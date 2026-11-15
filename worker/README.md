# NammaShale API Worker

This Worker is a separate API service from the Next.js frontend. It uses a dedicated Cloudflare D1 binding named `DB`.

Configure the database ID and exact frontend origin in the root `wrangler.toml`. Apply `db/schema.sql` once, then the numbered files in `db/migrations/` in order.

Run locally with `npx wrangler dev` and deploy with `npx wrangler deploy`.

The Worker currently supports login/logout, session introspection, school-scoped student list/create and attendance read/write. All student routes require active membership in the requested institution. Do not use real student data until remaining account lifecycle, safeguarding, privacy, and operational controls are completed and reviewed.
