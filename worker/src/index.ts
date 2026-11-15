interface D1Result<T = Record<string, unknown>> { results?: T[]; success: boolean; meta?: { changes?: number }; }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database { prepare(query: string): D1Statement; batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>; }
interface Env { DB: D1Database; APP_ORIGIN: string; SESSION_TTL_HOURS?: string; }
type MemberRole = "platform_admin" | "headmaster" | "government_teacher" | "government_student" | "parent_guardian" | "private_principal" | "private_teacher" | "student_mentor" | "alumnus" | "community_volunteer" | "education_official";
interface SessionUser { id: string; full_name: string; email: string | null; preferred_language: string; }
interface Membership { id: string; institution_id: string; role: MemberRole; status: string; }
const encoder = new TextEncoder();
const SESSION_COOKIE = "ns_session";
const PBKDF2_ITERATIONS = 210000;
const SESSION_HOURS_DEFAULT = 12;
const RATE_WINDOW_SECONDS = 900;
const RATE_MAX_ATTEMPTS = 8;

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}
function error(message: string, status: number) { return json({ error: message }, status); }
function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}
function base64Url(bytes: Uint8Array) {
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64Url(value: string) {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal + "=".repeat((4 - normal.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function sha256(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
async function hashPassword(password: string) {
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
 const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:PBKDF2_ITERATIONS},key,256);
 return "pbkdf2$"+PBKDF2_ITERATIONS+"$"+base64Url(salt)+"$"+base64Url(new Uint8Array(bits));
}
async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(parts[2]), iterations }, key, 256);
    const actual = new Uint8Array(bits); const expected = fromBase64Url(parts[3]);
    if (actual.length !== expected.length) return false;
    let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}
function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return rest.join("="); }
  return null;
}
function sessionCookie(token: string, maxAge: number) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function validOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  return origin === env.APP_ORIGIN;
}
function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("origin");
  if (origin && origin === env.APP_ORIGIN) return { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "Content-Type", "vary": "Origin" };
  return {};
}
function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers); for (const [k,v] of Object.entries(corsHeaders(request,env))) headers.set(k,v);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function audit(env: Env, userId: string, membershipId: string | null, institutionId: string | null, action: string, resourceType: string, resourceId: string | null, outcome = "success") {
  await env.DB.prepare("INSERT INTO audit_logs (id,institution_id,actor_user_id,actor_membership_id,action,resource_type,resource_id,outcome) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),institutionId,userId,membershipId,action,resourceType,resourceId,outcome).run();
}
async function currentUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = cookieValue(request, SESSION_COOKIE); if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.full_name,u.email,u.preferred_language
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'`)
    .bind(tokenHash).first<SessionUser>();
  if (row) await env.DB.prepare("UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(tokenHash).run();
  return row;
}
async function requireMembership(request: Request, env: Env, institutionId: string, roles: MemberRole[]) {
  const user = await currentUser(request,env); if (!user) return { user: null, membership: null, response: error("Authentication required",401) };
  const placeholders = roles.map(()=>"?").join(",");
  const membership = await env.DB.prepare(`SELECT id,institution_id,role,status FROM memberships
    WHERE user_id=? AND status='active' AND ((institution_id=? AND role IN (${placeholders})) OR role='platform_admin') LIMIT 1`)
    .bind(user.id,institutionId,...roles).first<Membership>();
  if (!membership) return { user, membership: null, response: error("You are not authorised for this school",403) };
  return { user, membership, response: null };
}
async function requirePlatformAdmin(request: Request, env: Env) {
 const user=await currentUser(request,env); if(!user)return {user:null,membership:null,response:error("Authentication required",401)};
 const membership=await env.DB.prepare("SELECT id,institution_id,role,status FROM memberships WHERE user_id=? AND role='platform_admin' AND status='active' LIMIT 1").bind(user.id).first<Membership>();
 if(!membership)return {user,membership:null,response:error("Platform administrator access required",403)};
 return {user,membership,response:null};
}
async function createInstitution(request: Request, env: Env) {
 if(!validOrigin(request,env))return error("Invalid request origin",403);
 const auth=await requirePlatformAdmin(request,env); if(auth.response)return auth.response;
 let body:{name?:string;name_kn?:string;udise_code?:string;district?:string;taluk?:string;village?:string;address?:string};
 try{body=await request.json()}catch{return error("Invalid JSON body",400)}
 const name=String(body.name||"").trim(); const udise=String(body.udise_code||"").trim();
 if(!name||name.length>180)return error("School name is required (maximum 180 characters)",400);
 if(udise&&!/^[0-9]{11}$/.test(udise))return error("UDISE code must contain exactly 11 digits",400);
 const fields=[body.name_kn,body.district,body.taluk,body.village,body.address];
 if(fields.some(v=>v!==undefined&&String(v).trim().length>240))return error("A school detail exceeds the permitted length",400);
 const id=crypto.randomUUID();
 try{await env.DB.prepare("INSERT INTO institutions(id,name,name_kn,institution_type,udise_code,district,taluk,village,address,status) VALUES(?,?,?,'government_school',?,?,?,?,?,'pending_verification')").bind(id,name,body.name_kn?.trim()||null,udise||null,body.district?.trim()||null,body.taluk?.trim()||null,body.village?.trim()||null,body.address?.trim()||null).run()}catch{return error("Could not register school. The UDISE code may already be in use.",409)}
 await audit(env,auth.user!.id,auth.membership!.id,id,"institution.create","institution",id);
 return json({institution:{id,name,name_kn:body.name_kn?.trim()||null,institution_type:"government_school",udise_code:udise||null,status:"pending_verification"}},201);
}
async function activateInstitution(request: Request, env: Env, institutionId: string) {
 if(!validOrigin(request,env))return error("Invalid request origin",403);
 const auth=await requirePlatformAdmin(request,env); if(auth.response)return auth.response;
 const result=await env.DB.prepare("UPDATE institutions SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND institution_type='government_school' AND status='pending_verification'").bind(institutionId).run();
 if(!result.meta?.changes)return error("School not found or already activated",409);
 await audit(env,auth.user!.id,auth.membership!.id,institutionId,"institution.activate","institution",institutionId);
 return json({ok:true,status:"active"});
}
async function createInvitation(request: Request, env: Env, institutionId: string) {
 if(!validOrigin(request,env))return error("Invalid request origin",403);
 const auth=await requireMembership(request,env,institutionId,["platform_admin","headmaster"]); if(auth.response)return auth.response;
 const institution=await env.DB.prepare("SELECT id,institution_type,status FROM institutions WHERE id=?").bind(institutionId).first<{id:string;institution_type:string;status:string}>();
 if(!institution||institution.institution_type!=="government_school")return error("Government school not found",404);
 if(institution.status!=="active")return error("School must be activated before inviting users",409);
 let body:{email?:string;role?:string}; try{body=await request.json()}catch{return error("Invalid JSON body",400)}
 const email=String(body.email||"").trim().toLowerCase(); const role=String(body.role||"");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return error("A valid email address is required",400);
 const allowed=auth.membership!.role==="platform_admin"?["headmaster","government_teacher"]:["government_teacher"];
 if(!allowed.includes(role))return error("You cannot invite this role",403);
 if(await env.DB.prepare("SELECT id FROM users WHERE lower(email)=?").bind(email).first())return error("An account with this email already exists",409);
 const token=randomToken(32),id=crypto.randomUUID(),expiresAt=new Date(Date.now()+7*86400000).toISOString();
 try{await env.DB.prepare("INSERT INTO user_invitations(id,token_hash,email,institution_id,role,invited_by_membership_id,expires_at) VALUES(?,?,?,?,?,?,?)").bind(id,await sha256(token),email,institutionId,role,auth.membership!.id,expiresAt).run()}catch{return error("Could not create invitation",409)}
 await audit(env,auth.user!.id,auth.membership!.id,institutionId,"invitation.create","user_invitation",id);
 return json({invitation:{id,email,role,expires_at:expiresAt,token}},201);
}
async function acceptInvitation(request: Request, env: Env) {
 if(!validOrigin(request,env))return error("Invalid request origin",403);
 let body:{token?:string;full_name?:string;password?:string;preferred_language?:string}; try{body=await request.json()}catch{return error("Invalid JSON body",400)}
 const token=String(body.token||""),name=String(body.full_name||"").trim(),password=String(body.password||""),language=body.preferred_language==="kn"?"kn":"en";
 if(token.length<30||token.length>128||!name||name.length>160)return error("A valid invitation and full name are required",400);
 if(password.length<14||password.length>256)return error("Password must contain at least 14 characters",400);
 const invitation=await env.DB.prepare("SELECT id,email,institution_id,role FROM user_invitations WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP").bind(await sha256(token)).first<{id:string;email:string;institution_id:string;role:string}>();
 if(!invitation)return error("This invitation is invalid, expired or already used",400);
 if(await env.DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(invitation.email).first())return error("An account with this email already exists. Contact the school administrator.",409);
 const userId=crypto.randomUUID(),membershipId=crypto.randomUUID(),passwordHash=await hashPassword(password);
 let results:D1Result[];
 try{results=await env.DB.batch([
 env.DB.prepare("UPDATE user_invitations SET accepted_at=CURRENT_TIMESTAMP,accepted_user_id=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP").bind(userId,invitation.id),
 env.DB.prepare("INSERT INTO users(id,full_name,email,password_hash,status,preferred_language,password_changed_at) SELECT ?,?,?,?,'active',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM user_invitations WHERE id=? AND accepted_user_id=?)").bind(userId,name,invitation.email,passwordHash,language,invitation.id,userId),
 env.DB.prepare("INSERT INTO memberships(id,user_id,institution_id,role,status,approved_at) SELECT ?,?,?,?,'active',CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM users WHERE id=?)").bind(membershipId,userId,invitation.institution_id,invitation.role,userId)
 ])}catch{return error("Could not activate this account. Contact the school administrator.",409)}
 if(!results[0]?.meta?.changes)return error("This invitation has already been used or is no longer valid",409);
 await audit(env,userId,membershipId,invitation.institution_id,"invitation.accept","user_invitation",invitation.id);
 return json({ok:true,message:"Account activated. You can now sign in."},201);
}
async function rateLimited(request: Request, env: Env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = await sha256("login:" + ip);
  const row = await env.DB.prepare("SELECT window_started_at,attempts FROM auth_rate_limits WHERE key_hash=?").bind(key).first<{window_started_at:number;attempts:number}>();
  const now = Math.floor(Date.now()/1000);
  if (!row || now-row.window_started_at >= RATE_WINDOW_SECONDS) {
    await env.DB.prepare("INSERT INTO auth_rate_limits(key_hash,window_started_at,attempts) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET window_started_at=excluded.window_started_at,attempts=1").bind(key,now).run();
    return false;
  }
  if (row.attempts >= RATE_MAX_ATTEMPTS) return true;
  await env.DB.prepare("UPDATE auth_rate_limits SET attempts=attempts+1 WHERE key_hash=?").bind(key).run();
  return false;
}
async function login(request: Request, env: Env) {
  if (!validOrigin(request,env)) return error("Invalid request origin",403);
  if (await rateLimited(request,env)) return error("Too many sign-in attempts. Try again in 15 minutes.",429);
  let body: {email?:string;password?:string};
  try { body = await request.json(); } catch { return error("Invalid JSON body",400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password || password.length > 256) return error("Email and password are required",400);
  const user = await env.DB.prepare("SELECT id,password_hash,status FROM users WHERE lower(email)=? LIMIT 1")
    .bind(email).first<{id:string;password_hash:string|null;status:string}>();
  if (!user || user.status !== "active" || !user.password_hash || !(await verifyPassword(password,user.password_hash))) return error("Invalid email or password",401);
  const token = randomToken(); const tokenHash = await sha256(token);
  const ttlHours = Math.max(1,Math.min(24,Number(env.SESSION_TTL_HOURS || SESSION_HOURS_DEFAULT)));
  const expiresAt = new Date(Date.now()+ttlHours*3600000).toISOString().replace("T"," ").replace("Z","").split(".")[0];
  await env.DB.prepare("INSERT INTO auth_sessions(id,token_hash,user_id,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),tokenHash,user.id,expiresAt).run();
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key_hash=?").bind(await sha256("login:"+(request.headers.get("cf-connecting-ip")||"unknown"))).run();
  return json({ok:true},200,{"set-cookie":sessionCookie(token,ttlHours*3600)});
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url); const path = url.pathname.replace(/\/+$/,"") || "/";
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request,env)});
  if (path === "/health" && request.method === "GET") return json({ok:true,service:"namma-shale-api",version:1});
  if (path === "/v1/auth/login" && request.method === "POST") return login(request,env);
  if (path === "/v1/auth/accept-invitation" && request.method === "POST") return acceptInvitation(request,env);
  if (path === "/v1/institutions" && request.method === "POST") return createInstitution(request,env);
  if (path === "/v1/institutions" && request.method === "GET") {
    const auth=await requirePlatformAdmin(request,env); if(auth.response)return auth.response;
    const rows=await env.DB.prepare("SELECT id,name,name_kn,udise_code,district,taluk,village,status,created_at FROM institutions WHERE institution_type='government_school' ORDER BY name LIMIT 200").all();
    return json({institutions:rows.results||[]});
  }
  const activateMatch=path.match(/^\/v1\/institutions\/([^/]+)\/activate$/);
  if(activateMatch&&request.method==="POST")return activateInstitution(request,env,decodeURIComponent(activateMatch[1]));
  const invitationMatch=path.match(/^\/v1\/institutions\/([^/]+)\/invitations$/);
  if(invitationMatch&&request.method==="POST")return createInvitation(request,env,decodeURIComponent(invitationMatch[1]));
  if (path === "/v1/auth/logout" && request.method === "POST") {
    if (!validOrigin(request,env)) return error("Invalid request origin",403);
    const token=cookieValue(request,SESSION_COOKIE); if(token) await env.DB.prepare("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ok:true},200,{"set-cookie":clearSessionCookie()});
  }
  if (path === "/v1/me" && request.method === "GET") {
    const user=await currentUser(request,env); if(!user)return error("Authentication required",401);
    const memberships=await env.DB.prepare("SELECT m.id,m.institution_id,m.role,m.status,i.name AS institution_name,i.name_kn AS institution_name_kn FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.user_id=? AND m.status='active'").bind(user.id).all();
    return json({user,memberships:memberships.results||[]});
  }
  const studentsMatch=path.match(/^\/v1\/institutions\/([^/]+)\/students$/);
  if(studentsMatch){
    const institutionId=decodeURIComponent(studentsMatch[1]);
    if(request.method==="GET"){
      const auth=await requireMembership(request,env,institutionId,["platform_admin","headmaster","government_teacher"]);
      if(auth.response)return auth.response;
      const classId=url.searchParams.get("class_id");
      const rows=await env.DB.prepare(`SELECT id,admission_number,full_name,full_name_kn,class_id,status FROM students WHERE institution_id=? ${classId?"AND class_id=?":""} ORDER BY full_name LIMIT 200`)
        .bind(...(classId?[institutionId,classId]:[institutionId])).all();
      await audit(env,auth.user!.id,auth.membership!.id,institutionId,"students.list","student",null);
      return json({students:rows.results||[]});
    }
    if(request.method==="POST"){
      if(!validOrigin(request,env))return error("Invalid request origin",403);
      const auth=await requireMembership(request,env,institutionId,["platform_admin","headmaster"]);
      if(auth.response)return auth.response;
      let body:{admission_number?:string;full_name?:string;full_name_kn?:string;class_id?:string;admission_date?:string};
      try{body=await request.json()}catch{return error("Invalid JSON body",400)}
      const admission=String(body.admission_number||"").trim();const name=String(body.full_name||"").trim();
      if(!admission||!name||admission.length>40||name.length>160)return error("Admission number and student name are required",400);
      if(body.class_id){
        const cls=await env.DB.prepare("SELECT id FROM school_classes WHERE id=? AND institution_id=?").bind(body.class_id,institutionId).first();
        if(!cls)return error("Class does not belong to this school",400);
      }
      const id=crypto.randomUUID();
      try{
        await env.DB.prepare("INSERT INTO students(id,institution_id,admission_number,full_name,full_name_kn,class_id,admission_date) VALUES(?,?,?,?,?,?,?)")
          .bind(id,institutionId,admission,name,body.full_name_kn?.trim()||null,body.class_id||null,body.admission_date||null).run();
      }catch{return error("Could not create student. Check the admission number and class.",409)}
      await audit(env,auth.user!.id,auth.membership!.id,institutionId,"student.create","student",id);
      return json({student:{id,admission_number:admission,full_name:name,class_id:body.class_id||null}},201);
    }
  }
  const attendanceMatch=path.match(/^\/v1\/institutions\/([^/]+)\/attendance$/);
  if(attendanceMatch){
    const institutionId=decodeURIComponent(attendanceMatch[1]);
    if(request.method==="POST"){
      if(!validOrigin(request,env))return error("Invalid request origin",403);
      const auth=await requireMembership(request,env,institutionId,["platform_admin","headmaster","government_teacher"]);
      if(auth.response)return auth.response;
      let body:{student_id?:string;class_id?:string;attendance_date?:string;status?:string;note?:string};
      try{body=await request.json()}catch{return error("Invalid JSON body",400)}
      const {student_id,class_id,attendance_date,status}=body;
      if(!student_id||!class_id||!attendance_date||!["present","absent","leave","late"].includes(status||""))return error("Student, class, date and valid status are required",400);
      const student=await env.DB.prepare("SELECT id FROM students WHERE id=? AND institution_id=? AND class_id=? AND status='active'").bind(student_id,institutionId,class_id).first();
      const cls=await env.DB.prepare("SELECT id FROM school_classes WHERE id=? AND institution_id=?").bind(class_id,institutionId).first();
      if(!student||!cls)return error("Student or class does not belong to this school",400);
      const id=crypto.randomUUID();
      try{await env.DB.prepare("INSERT INTO attendance_records(id,institution_id,student_id,class_id,attendance_date,status,recorded_by_membership_id,note) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,note=excluded.note,recorded_by_membership_id=excluded.recorded_by_membership_id")
        .bind(id,institutionId,student_id,class_id,attendance_date,status,auth.membership!.id,body.note?.slice(0,500)||null).run();}
      catch{return error("Could not save attendance",409)}
      await audit(env,auth.user!.id,auth.membership!.id,institutionId,"attendance.upsert","attendance",student_id);
      return json({ok:true});
    }
    if(request.method==="GET"){
      const auth=await requireMembership(request,env,institutionId,["platform_admin","headmaster","government_teacher"]);
      if(auth.response)return auth.response;
      const classId=url.searchParams.get("class_id");const date=url.searchParams.get("date");
      if(!classId||!date)return error("class_id and date are required",400);
      const cls=await env.DB.prepare("SELECT id FROM school_classes WHERE id=? AND institution_id=?").bind(classId,institutionId).first();
      if(!cls)return error("Class does not belong to this school",400);
      const rows=await env.DB.prepare("SELECT a.student_id,s.admission_number,s.full_name,a.status,a.note FROM attendance_records a JOIN students s ON s.id=a.student_id WHERE a.institution_id=? AND a.class_id=? AND a.attendance_date=? ORDER BY s.full_name").bind(institutionId,classId,date).all();
      await audit(env,auth.user!.id,auth.membership!.id,institutionId,"attendance.list","attendance",classId);
      return json({records:rows.results||[]});
    }
  }
  return error("Not found",404);
}
export default { async fetch(request:Request,env:Env):Promise<Response>{
  try{return withCors(await handle(request,env),request,env)}
  catch(e){return withCors(error("Unexpected server error",500),request,env)}
}};
