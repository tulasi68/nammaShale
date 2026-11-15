#!/usr/bin/env node
import { createHash, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const database = process.env.NAMMASHALE_D1_DATABASE || "namma-shale-db";
const email = process.env.NAMMASHALE_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.NAMMASHALE_ADMIN_NAME?.trim();
if (!email || !name) {
  console.error("Set NAMMASHALE_ADMIN_EMAIL and NAMMASHALE_ADMIN_NAME before running.");
  process.exit(1);
}
const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question("Initial platform admin password (min 14 chars): ");
rl.close();
if (password.length < 14) throw new Error("Password must be at least 14 characters.");
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, 210000, 32, "sha256");
const b64url = (b) => b.toString("base64url");
const passwordHash = `pbkdf2$210000$${b64url(salt)}$${b64url(derived)}`;
const userId = randomUUID();
const institutionId = randomUUID();
const membershipId = randomUUID();
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const sql = `
INSERT INTO institutions(id,name,institution_type,status) VALUES(${quote(institutionId)},'NammaShale Platform','supporting_organisation','active');
INSERT INTO users(id,full_name,email,password_hash,status,preferred_language) VALUES(${quote(userId)},${quote(name)},${quote(email)},${quote(passwordHash)},'active','en');
INSERT INTO memberships(id,user_id,institution_id,role,status) VALUES(${quote(membershipId)},${quote(userId)},${quote(institutionId)},'platform_admin','active');
`;
const migration = resolve("db/migrations/0002_secure_platform_core.sql");
if (!readFileSync(migration,"utf8").includes("CREATE TABLE IF NOT EXISTS auth_sessions")) throw new Error("Migration file validation failed.");
console.log("Creating the initial platform administrator in D1:", database);
execFileSync("npx",["wrangler","d1","execute",database,"--remote","--command",sql],{stdio:"inherit"});
console.log("Platform administrator provisioned. Store the password in a password manager; it is not recoverable from the database.");
