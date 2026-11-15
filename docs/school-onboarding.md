# School onboarding and institutional administration

This milestone adds an initial platform-admin school registration flow and one-time headmaster/teacher invitations.

## Apply migrations

Apply these files to the dedicated NammaShale D1 database, in order:

1. `db/schema.sql`
2. `db/migrations/0002_secure_platform_core.sql`
3. `db/migrations/0003_school_onboarding.sql`

Do not run these commands against another project's database. Confirm the D1 database name and ID before any remote migration.

## API

- `POST /v1/institutions` — platform administrator creates a government-school institution. New schools are `pending_verification`.
- `GET /v1/institutions` — platform administrator lists government schools.
- `POST /v1/institutions/:id/activate` — platform administrator activates a school only after independently checking its identity against an authoritative record.
- `POST /v1/institutions/:id/invitations` — platform administrator may invite a headmaster or government teacher; an active headmaster may invite government teachers only.
- `POST /v1/auth/accept-invitation` — one-time invitation activation. The recipient sets their own password (minimum 14 characters).

Invitation tokens are stored as SHA-256 digests and returned only once to the authorised inviter. The link is a bearer credential: deliver it through a verified channel and do not publish it. Invitations expire after seven days and cannot be reused. Email delivery is not included; this milestone provides controlled manual delivery.

## UI

- `/platform/schools` — platform administrator school registration and headmaster invitation.
- `/accept-invitation?token=...` — recipient activation.

## Important limitations

- A newly registered school remains pending verification until a platform administrator explicitly confirms that its identity has been checked against an authoritative record. The activation action is an administrative attestation, not an automated UDISE verification.
- The API refuses invitations until the institution has been activated through an approved provisioning process.
- Do not enter real student information. This is not a production security certification. Before a real pilot, complete deployment/domain configuration, account recovery, stronger abuse controls, privileged-role safeguards, guardian/consent workflows, retention and deletion procedures, backup/restore, operational incident procedures, and independent security/privacy review.
- The frontend must use an API deployment and cookie/domain arrangement that supports credentialed browser requests. Prefer controlled custom domains under the same registrable site; test cookie behavior in supported browsers.
