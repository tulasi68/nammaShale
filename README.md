# NammaShale (ನಮ್ಮಶಾಲೆ)

**Our School. Our Responsibility. Our Future.**

NammaShale is a bilingual (Kannada and English), mobile-first digital ecosystem to strengthen Karnataka government schools by connecting school operations, student development, alumni, communities and private-school partners.

## Product pillars

1. **Namma School** — school profile, staff, student administration, attendance, notices, events and calendar.
2. **Namma Students** — student records, learning progress, assessments, marksheets, achievements and support.
3. **Namma Alumni** — verified alumni, volunteering, mentoring and school engagement.
4. **Namma Javabdari** — school needs, approved development projects, volunteers, milestones and transparent contribution records.
5. **Namma Partnership** — private-school adoption/mentorship partnerships, teacher collaboration, principal coordination and supervised student mentoring.

## Current status

This repository is the independent NammaShale implementation based on the AlumniForge starter UI. The initial implementation establishes the NammaShale experience, module structure, architecture baseline and initial Cloudflare D1 schema.

**Important:** The current web experience is a product/UI foundation. It is not yet connected to a production backend. Do not enter real student information. The inherited demo/localStorage login is not secure authentication and is not suitable for student data.

## Technology direction

- Next.js App Router + TypeScript + Tailwind CSS
- Cloudflare Workers for server-side API/runtime
- Cloudflare D1 for relational records
- Cloudflare R2 for private documents and evidence
- Server-side authentication, institution memberships and role-based authorisation

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Database foundation

The initial D1 schema is in db/schema.sql. Review it before applying it to a database. Future changes must be versioned migrations. Example:

```bash
npx wrangler d1 execute YOUR_DATABASE_NAME --local --file=db/schema.sql
```

Use --remote only after confirming the intended Cloudflare account and database. Never apply schema changes to an unrelated or production database.

## Key design rules

- Multi-institution from day one; every school-owned record is institution-scoped.
- A user identity is separate from a user's role/membership at an institution.
- Enforce authorisation in server-side code, never only in the browser.
- Student-identifiable records are visible only to explicitly authorised school staff and the linked student/guardian.
- Partner schools, alumni and community supporters do not receive default access to student records.
- Mentoring involving minors requires institutional approval, teacher supervision and guardian consent as applicable; no unrestricted adult-to-minor private messaging.
- Namma Javabdari separates needs, approvals, project progress, in-kind contributions and monetary records.
- The government school retains its own institutional authority in every partnership.

## Documentation

- Architecture and implementation baseline: docs/architecture.md
- Initial D1 schema: db/schema.sql

## Pilot approach

Start with one government school. Configure institution identity, validate user roles and approval workflows with the headmaster, and test using synthetic data. Expand only after field feedback, safeguarding review and security checks.

## Legal and operational validation

Before production use, obtain qualified review of Karnataka education-department requirements, child-protection and consent processes, DPDP obligations and commencement, retention/deletion, breach response, data-sharing agreements and government financial procedures. This project does not claim legal or regulatory compliance merely by providing technical controls.


## Secure API foundation (in progress)

The API Worker lives in `worker/src/index.ts`. It provides password verification using PBKDF2-HMAC-SHA-256, opaque hashed sessions, HttpOnly/Secure/SameSite cookies, login throttling, origin checks, audit events, and institution-scoped student and attendance endpoints.

**Do not enter real student information yet.** The API foundation is not a production security certification; account invitation/reset, guardian access, MFA, retention, export controls, backup/restore and independent security review remain necessary.

### Configure and apply the API database

1. Create a dedicated Cloudflare D1 database for NammaShale. Do not reuse another project's database.
2. Set the database ID and exact frontend origin in `wrangler.toml`.
3. Apply the schema and migration in order:

```bash
npx wrangler d1 execute namma-shale-db --remote --file=db/schema.sql
npx wrangler d1 execute namma-shale-db --remote --file=db/migrations/0002_secure_platform_core.sql
```

Use `--local` instead of `--remote` for local development. Provision the first platform administrator only after both schema files are applied:

```bash
NAMMASHALE_ADMIN_EMAIL=admin@example.org NAMMASHALE_ADMIN_NAME="Platform Admin" node scripts/bootstrap-platform-admin.mjs
```

The script prompts for a strong initial password and stores only a PBKDF2 hash.

### API routes

- `GET /health`
- `POST /v1/auth/login` and `POST /v1/auth/logout`
- `GET /v1/me`
- `GET|POST /v1/institutions/:institutionId/students`
- `GET|POST /v1/institutions/:institutionId/attendance`

Student and attendance endpoints require an active platform-admin, headmaster or government-teacher membership. They do not expose student data to alumni, partner-school members or community volunteers.


### Frontend sign-in

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_NAMMASHALE_API_URL` to the deployed API Worker origin. The sign-in page calls the Worker with credentialed requests. Configure the Worker `APP_ORIGIN` to the exact frontend origin. Prefer frontend and API custom domains under the same site so the secure session cookie works consistently across browsers.

The old AlumniForge demo login has been replaced; legacy demo pages redirect to their NammaShale module equivalents. The sign-in page remains unavailable until the API origin is configured and accounts have been provisioned by an authorised administrator.
