interface D1Result<T = Record<string, unknown>> { results?: T[]; success: boolean; meta?: { changes?: number }; }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database { prepare(query: string): D1Statement; }
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
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
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
    WHERE user_id=? AND institution_id=? AND status='active' AND role IN (${placeholders}) LIMIT 1`)
    .bind(user.id,institutionId,...roles).first<Membership>();
  if (!membership) return { user, membership: null, response: error("You are not authorised for this school",403) };
  return { user, membership, response: null };
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
  const expiresAt = new Date(Date.now()+ttlHours*3600000).toISOString();
  await env.DB.prepare("INSERT INTO auth_sessions(id,token_hash,user_id,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),tokenHash,user.id,expiresAt).run();
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key_hash=?").bind(await sha256("login:"+(request.headers.get("cf-connecting-ip")||"unknown"))).run();
  return json({ok:true},200,{"set-cookie":sessionCookie(token,ttlHours*3600)});
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url); const path = url.pathname.replace(/\/+$/,"") || "/";
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request,env)});
  if (path === "/health" && request.method === "GET") return json({ok:true,service:"namma-shale-api",version:1});
  if (path === "/v1/auth/login" && request.method === "POST") return login(request,env);
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
