# NammaShale — Architecture and implementation baseline

## Product boundary
NammaShale is a multi-institution school-support platform. The first deployment is one Karnataka government school, but every school-owned record is institution-scoped from the first migration. The government school remains the authority for its own administration and student records. Private schools, alumni and community supporters participate only within explicitly approved scopes.

## Application architecture
- Web: Next.js App Router, TypeScript, Tailwind CSS; mobile-first and Kannada/English.
- Runtime/API: Cloudflare Workers. Use server-side route handlers or a dedicated Worker API; the browser is never a trusted boundary.
- Relational data: Cloudflare D1 (SQLite). Apply versioned SQL migrations.
- Files: private Cloudflare R2 bucket for documents, marksheets and evidence. Serve only through authenticated, short-lived access routes; never expose raw bucket keys.
- Identity: server-validated authentication with secure, HttpOnly, Secure, SameSite cookies.
- Observability: structured request logs, security audit events and operational error reporting.

The current repository is the UI foundation. The demo/localStorage authentication inherited from AlumniForge is not production authentication and must not be used to store real student records.

## Tenancy and identity
Users represent people. Memberships represent their role at an institution. A person may belong to more than one institution and hold different roles at each. Every school-owned data row includes institution_id directly or is reached through a parent row whose institution is checked by the API.

For every request: resolve the authenticated user on the server; resolve active membership(s) for the requested institution; check role and resource-level permission; verify the resource belongs to the same institution or an explicitly approved partnership scope; record sensitive read/write actions in audit_logs.

Never trust a user_id, institution_id, role or student ID supplied by the browser without re-validating it.

## Role catalogue
- Platform administrator
- Government-school headmaster
- Government-school teacher / teacher coordinator
- Government-school student
- Parent / guardian
- Private-school principal
- Private-school teacher
- Student mentor
- Verified alumnus
- Community volunteer / supporter
- Authorised education-department official

A membership is not trusted merely because a user selects a role during sign-in. Institution administrators and authorised workflows must verify and approve it.

## Access policy principles
- School profile, public notices and events: school staff manage; other audiences see approved public information.
- Identifiable student profile: authorised school staff only; a student/guardian sees only their own linked record.
- Attendance and marksheets: authorised school staff and the linked student/guardian only.
- Partner schools receive aggregate/de-identified student information only when explicitly approved.
- Alumni and community supporters receive no default access to student-identifiable records.
- Partnership activity is visible only to approved participants.
- Teacher resources are shared according to the collaboration's approved scope.

Enforce permissions on the server for every API and file request.

## Core domains
Institution registry and memberships; academic years, classes, sections and staff; student records and guardian relationships; attendance and assessments/marksheets; notices, events and calendar; alumni profiles and volunteering; Namma Javabdari needs/projects/milestones/volunteer assignments/contribution records; Namma Partnership proposals/approvals/activities/reviews; mentoring programmes/assignments/supervising teachers/sessions; teacher collaboration; consent records and audit logs.

The initial D1 schema is in db/schema.sql. Subsequent changes should be numbered migrations rather than edits to an already-applied migration.

## Child safeguarding
- No unrestricted private messaging between adult mentors and minor students.
- Every student mentoring programme has a named supervising teacher and institutional approval.
- Capture guardian consent where required; record purpose, status, time and evidence.
- Avoid collecting sensitive student information unless a defined school purpose requires it.
- Partner institutions and external supporters receive aggregate or de-identified information by default.
- File access and student exports require explicit permission and audit events.

## Namma Javabdari governance
A need is first recorded by authorised school staff. Approval is a separate step. Approved needs may become projects with owners, milestones and completion evidence. Volunteer work and in-kind support are recorded separately from money. Monetary contributions must follow applicable school, department and government financial procedures; the platform is not itself a payment authorisation or school fund account.

## Partnership governance
A partnership proposal identifies the government school, partner institution, objectives, focus areas, duration and responsible coordinators. Approval is captured for each institution and any additional authority required by the applicable process. The government school headmaster remains responsible for the school's participation. Student mentoring must be teacher-supervised and guardian-consented as applicable.

## Bilingual and low-connectivity design
Keep UI labels and validation messages in Kannada and English. Store user language preference; do not duplicate the underlying record per language. Use compact pages, low-resolution thumbnails, pagination and explicit upload limits. Keep forms short and resilient to intermittent connectivity. Consider offline attendance capture only after online permissions, conflict handling and audit semantics are stable.

## Delivery phases
1. Foundation: NammaShale identity, module navigation, product boundaries, initial D1 schema and architecture notes.
2. Secure platform core: Worker API, D1 migrations, authentication, institution membership, server-side authorisation and audit logging.
3. School operations: school profile, academic years, classes, student/guardian records, attendance, assessments and notices.
4. Community support: alumni, Namma Javabdari needs/projects and contribution tracking.
5. Partnerships: school-to-school proposals, principal coordination, teacher collaboration and supervised mentoring.
6. Pilot hardening: consent review, security tests, backup/restore, operational monitoring, accessibility and field testing.

## Production-readiness gates
Before real student data is entered, validate applicable Karnataka education-department processes, UDISE+ integration expectations, child-protection requirements, guardian consent, DPDP Act/rules commencement and obligations, retention/deletion policy, breach response, data processor contracts and financial contribution rules with qualified stakeholders. Do not claim legal compliance merely because a consent or audit table exists.
