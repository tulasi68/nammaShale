
## Secure API foundation (in progress)

The API Worker lives in `worker/src/index.ts`. It provides:
- Password verification using PBKDF2-HMAC-SHA-256.
- Random opaque sessions; only a SHA-256 digest is stored in D1.
- HttpOnly, Secure, SameSite=Lax session cookies.
- Login throttling, origin checks on writes and audit events.
- Server-side institution membership checks for student and attendance APIs.
- Tenant-scoped student creation/listing and attendance read/write endpoints.

### Configure and apply the API database

1. Create a dedicated Cloudflare D1 database for NammaShale. Do not reuse a database from another project.
2. Put its database ID in `wrangler.toml` and set `APP_ORIGIN` to the exact deployed frontend origin.
3. Apply the base schema, then the secure-core migration:

```bash
npx wrangler d1 execute namma-shale-db --remote --file=db/schema.sql
npx wrangler d1 execute namma-shale-db --remote --file=db/migrations/0002_secure_platform_core.sql
```

For local testing, replace `--remote` with `--local`.

4. Provision the first platform administrator after both schema files are applied:

```bash
NAMMASHALE_ADMIN_EMAIL=admin@example.org NAMMASHALE_ADMIN_NAME="Platform Admin" node scripts/bootstrap-platform-admin.mjs
```

The script prompts for the initial password and stores only a PBKDF2 hash. Use a strong unique password.

5. Run the API locally with `npm run api:dev`; deploy with `npm run api:deploy`.

### API routes

- `GET /health`
- `POST /v1/auth/login` — JSON `{ "email": "...", "password": "..." }`
- `POST /v1/auth/logout`
- `GET /v1/me`
- `GET|POST /v1/institutions/:institutionId/students`
- `GET|POST /v1/institutions/:institutionId/attendance`

The student and attendance routes currently require an active platform-admin, headmaster or government-teacher membership. The API deliberately does not expose student data to alumni, partner-school members or community volunteers.

### Security scope

This is an initial security foundation, not a production security certification. Before using real student data, add and test invitation/activation flows, guardian-linked access, password reset, MFA for privileged roles, request-level abuse controls, export controls, retention/deletion workflows, backup/restore and independent security review. Keep the API Worker and frontend on HTTPS origins you control.
