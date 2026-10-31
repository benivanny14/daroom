# DarRoom

Mobile-first Dar es Salaam rental-discovery app built with Next.js App Router,
TypeScript, Prisma, and PostgreSQL. The tenant journey is public and free;
tenants contact the advertiser directly. Rent can optionally be paid through
DarRoom's SonicPesa mobile-money page when an agent asks the tenant to use it.
DarRoom never asks for a tenant's mobile-money PIN.

## Run locally (Windows)

This repository ships a helper that runs an isolated PostgreSQL 18 cluster on
port `5434`, so it does not touch any existing PostgreSQL service.

```sh
npm install
npm run db:start        # start the local cluster (port 5434)
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. Stop the database with `npm run db:stop`.
The cluster data directory and log live under
`%LOCALAPPDATA%\DarRoom\pgdata` and `%LOCALAPPDATA%\DarRoom\postgres.log`.

`.env` is already prepared for this local cluster. If you recreate it, copy
`.env.example` and set:

- `DATABASE_URL` — `postgresql://darroom:<password>@127.0.0.1:5434/darroom?schema=public`
- `AUTH_SECRET` — at least 32 random characters (also signs local media uploads)
- `APP_URL` — `http://localhost:3000`
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` — used by
  `npm run db:seed` to create the administrator

The seed is idempotent. It creates geography, the administrator, payment
methods, and static pages. Sample agents and listings are opt-in: set
`SEED_DEMO_DATA="true"` (local development only) to also create the demo agent
`juma@example.com` (password `StrongPassword123456`), two sample listings, and
a 30-day subscription. Leave it unset in production so the database stays
clean. Change every seed password before any public deployment.

Run checks with:

```sh
npm test
npm run typecheck
npm run build
```

Development uses `.next-dev`; production builds and `npm run start` use
`.next`. Keeping these output directories separate prevents a build from
overwriting the development server's compiled chunks.

## Payments

SonicPesa is the only payment provider. It collects mobile money in Tanzania
(M-Pesa, Tigo Pesa, Airtel Money, Halopesa) through a USSD/STK push that the
customer approves on their own phone. DarRoom never asks for a mobile-money PIN.

- **Agent subscription** (`app/api/payments/subscription/checkout`): the only
  plan is TSh 5,000 for 30 days. The amount and plan are fixed on the server.
  When the signed webhook confirms the payment, `lib/subscription-payments.ts`
  marks the `PaymentEvent` as verified and adds a 30-day `Subscription` period
  (a renewal extends the remaining time instead of replacing it).
- **Tenant rent** (`app/api/payments/checkout`): the tenant enters an amount and
  phone number on `/rent`. The route stores a `RentPayment` row and sends the
  push; the webhook moves it to `PAID`, `FAILED`, or `CANCELLED`.
- **Webhook** (`/api/payments/webhook`): verifies `X-SonicPesa-Signature`
  (HMAC-SHA256 of the raw body using `SONICPESA_SECRET_KEY`) before changing
  either record, rejects amount mismatches, and is idempotent.
- **Status polling**: both checkouts expose `GET ...?paymentId=...&refresh=1`
  so the UI can ask SonicPesa directly when a webhook is delayed.

Set `SONICPESA_ACCESS_KEY`, `SONICPESA_SECRET_KEY`, and optionally
`SONICPESA_BASE_URL`, then register the webhook URL in the SonicPesa dashboard.

### Development-only fallback

- **Media storage** (`lib/storage.ts`): when `S3_*` variables are empty and
  `NODE_ENV` is not `production`, uploads are written to `public/uploads` and
  served as `/uploads/...`. The signed PUT endpoint
  `app/api/uploads/local/route.ts` validates the HMAC signature, content type,
  magic bytes, and the 15 MB limit. This driver is disabled in production.

Email is also optional. When `RESEND_API_KEY` and `EMAIL_FROM` are missing,
`emailConfigured()` is false and the auth flow adapts instead of creating
unusable accounts:

- Registration creates the account already verified, so the person can log in
  immediately.
- Login does not block unverified accounts.
- “Forgot password” and “resend verification” return a clear `503` explaining
  that email delivery is not configured yet.

Once a real Resend sender is configured, verification and password-reset
emails are sent and the normal verification requirement returns automatically.
No code change is needed.

> **Resend sandbox sender:** `onboarding@resend.dev` only delivers to the Resend
> account owner. It is treated as “not configured” so registration stays open
> for everyone. Verify a domain at resend.com/domains, then set `EMAIL_FROM` to
> an address on that domain (for example `DarRoom <no-reply@darroom.site>`).

### Phone privacy and reports

- Public listing feeds return `phone: null` plus a masked `phoneMasked` value.
  The full number is only returned by `POST /api/listings/[id]/contact`, which
  requires a signed-in user, is rate-limited, and counts as a WhatsApp contact.
- A listing is not hidden after the first report. It is auto-flagged only after
  `REPORT_FLAG_THRESHOLD` open reports (default `3`) within 30 days. Duplicate
  reports from the same account or IP hash are ignored.
- Confirming a report hides the listing. It stays in the admin queue so the
  administrator can reverse it with “Restore listing”, and dismissing the last
  open report restores it automatically.
- Every administrator moderation action is written to `AdminAuditLog` and can
  be reviewed in the “Audit log” tab of `/admin`.

## Application scope

- `/` is the public rental finder with district, neighborhood,
  budget, and text filters, database-backed listings, direct WhatsApp contact,
  reviews, viewing appointments, favorites, and public reporting. Search
  excludes prices below TSh 50,000 per month and listings whose 60-day window
  has ended. Signed-in visitors get account-synced favorites.
- `/account` shows the login/registration flow to guests. Signed-in users get a
  dashboard with profile editing, password change, device-wide logout,
  account favorites, and their viewing appointments.
- `/dalali` is the agent dashboard: one subscription at TSh 5,000 / 30 days
  (no plan picker), listing create/edit/hide/restore, multi-photo upload (10
  photos per listing, hard ceiling 10; 15 MB per photo), analytics,
  availability toggle, expiry and 60-day renewal, viewing management (bookings
  are confirmed immediately, with no agent approval step), and ID verification
  submission.
- Tenants see multiple photos as a slideshow on `/listing/[id]` (thumbnails,
  dots, previous/next, swipe and keyboard arrows). Listing cards keep a compact
  carousel with a photo counter.
- `/admin` is the moderation console: open reports, agent accounts and
  subscriptions, and the audit log. There is no listing approval step.
- Every API route validates input with `zod`, enforces same-origin requests,
  applies rate limits, and returns proper `401`/`403` responses through
  `lib/auth.ts`.

### Listing lifecycle

1. An agent subscribes (mock checkout locally).
2. The agent creates a listing; it goes live immediately with a 60-day expiry.
3. The agent can add photos while creating the listing, or later from the
   listing card (presign → PUT → confirm). Several photos can be selected at
   once; each is uploaded in order and the upload order becomes the slideshow
   order. The first photo is the cover.
4. The listing appears in the public feed and `/listing/[id]` as soon as it is
   saved. There is no approval step.
5. When a room is taken, the agent marks it unavailable. It stays visible with
   a “Rented” badge, but new viewing appointments are blocked.
6. After 60 days the cron pass marks the listing `EXPIRED` and removes it from
   search. The agent can renew it for another 60 days while the subscription
   is active.

### ID verification

1. The agent submits a document through the verification API (presign → PUT → submit). The upload form is not shown on the agent dashboard.
2. The record is approved automatically and stamped with the verification time.
3. Verified agents show a verified badge on their listings.

## Geographic data

The schema supports `Region -> District -> Neighborhood`. The seed creates one
Dar es Salaam region and the five districts, plus the supplied
neighborhood/ward lists. These lists are not asserted to be a complete official
neighborhood register. Agents can type additional neighborhood names; the
server saves each name against the selected district and reuses existing names
regardless of letter case.

## Cron endpoints

Both endpoints require `CRON_SECRET` and should be called by a scheduler, not
by a browser. Each accepts `GET` and `POST`; `auto-expiry` reads the secret from
`x-cron-secret` or `Authorization: Bearer`, and `subscriptions` reads it from
`Authorization: Bearer`.

```sh
# Expire featured listings, listings past 60 days, and subscriptions;
# send day-27 reminders; remove stale rate-limit buckets
curl http://localhost:3000/api/cron/auto-expiry \
  -H "x-cron-secret: $CRON_SECRET"

# Subscription expiry/reminder pass
curl http://localhost:3000/api/cron/subscriptions \
  -H "Authorization: Bearer $CRON_SECRET"
```

Without `CRON_SECRET` both endpoints return `401`.

`vercel.json` schedules them automatically on Vercel (daily at 05:00 and
06:00 UTC — the Hobby plan allows one run per day per cron, so the expiry pass
runs once daily instead of hourly). On any other host add an equivalent
scheduler entry — for
example a GitHub Actions workflow on `schedule:` or a crontab line:

```cron
0 * * * * curl -fsS -H "x-cron-secret: $CRON_SECRET" https://your-host/api/cron/auto-expiry
0 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/subscriptions
```

These jobs are what expire stale listings and subscriptions, send renewal
reminders and trim old rate-limit buckets; if nothing calls them those states
never change.

## Project map

```text
app/
  api/                       route handlers (auth, listings, dalali, admin,
                             payments, uploads, cron)
  account/page.tsx           auth flow + signed-in account dashboard
  admin/page.tsx             moderation console
  dalali/page.tsx            agent dashboard
  listing/[id]/page.tsx      public listing detail
  page.tsx                   public discovery experience
components/
  AccountForm.tsx            login/register/reset forms
  AccountDashboard.tsx       profile, password, favorites, appointments
  AdminConsole.tsx           report review and restore, agent accounts, audit log
  DalaliDashboard.tsx        subscription, listings, photos, availability,
                             renewal, appointments, verification
  ListingExplorer.tsx        filters, cards, favorites, report interaction
  ListingDetailView.tsx      detail, reviews, appointment booking, WhatsApp
lib/
  auth.ts                    sessions, origin checks, role guards
  listing-policy.ts          60-day listing expiry helpers
  storage.ts                 S3 driver + local dev fallback
  sonicpesa.ts               SonicPesa client, status mapping, webhook HMAC
  subscription-payments.ts   verifies a paid subscription and extends access
  subscriptions.ts           entitlement rules
  subscriptions-plans.ts     plan limits and pricing
  rate-limit.ts              database-backed rate limiting
  geography.ts               district-scoped name normalization
  moderation.ts              transactional ban flow
prisma/
  schema.prisma              PostgreSQL relational schema
  seed.cjs                   idempotent seed
scripts/
  db-start.ps1 / db-stop.ps1 local PostgreSQL cluster control
```

## Production notes

Do not enable the local media driver in production. Configure `S3_*` and
`MEDIA_PUBLIC_BASE_URL`, `SONICPESA_*`, `RESEND_API_KEY`/`EMAIL_FROM`,
`CRON_SECRET` instead. Payment callbacks are signature-verified
server-to-server before entitlement changes; never treat a browser redirect or
callback parameter as proof of payment. Replace all seed credentials and use a
managed PostgreSQL instance with backups.

For SonicPesa, set the webhook URL in the SonicPesa dashboard to
`https://<your-domain>/api/payments/webhook`. The handler verifies the
`X-SonicPesa-Signature` HMAC (SHA-256 of the raw body using
`SONICPESA_SECRET_KEY`) before changing any `RentPayment` or `PaymentEvent`
row.

### Deploying to Vercel + Supabase

1. **Database** — use the Supabase session pooler (IPv4, port 5432), username
   `postgres.<project-ref>`:
   `postgresql://postgres:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Supabase signs pooler certificates with its own root CA, so `lib/prisma.ts`
   and `prisma/seed.cjs` pin that CA explicitly while keeping full certificate
   verification enabled (no `rejectUnauthorized: false` anywhere). Because the
   session pooler allows only ~15 clients in total, set `DATABASE_POOL_URL` to
   the same URL on **port 6543** (transaction pooler) for the running app;
   migrations keep using `DATABASE_URL` on 5432.
2. **Migrations run on every deploy** — `vercel.json` sets
   `buildCommand` to `prisma generate && prisma migrate deploy && next build`,
   so a new commit applies pending migrations before the app builds. Seeds are
   NOT run on deploy; run `npm run db:seed` once against the production URL
   (it is idempotent).
3. **Environment variables** — set every key from `.env.example` in the Vercel
   project (Production/Preview): `DATABASE_URL`, `DATABASE_POOL_URL` (port
   6543), `APP_URL` (the real https domain), `AUTH_SECRET` (≥ 32 random chars),
   `ADMIN_*`, `CRON_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, `SONICPESA_*`, plus the
   `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SECRET_KEY` coordinates. Listing photos
   use Supabase Storage (`SUPABASE_STORAGE_BUCKET`, default `darroom`) whenever
   `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` are present; `S3_*` is
   only needed if you prefer an S3-compatible bucket instead. Never commit
   `.env` (it is gitignored).
4. **Cron** — the `crons` block in `vercel.json` calls both endpoints daily
   (05:00 and 06:00 UTC; the Hobby plan allows one run per day per cron);
   `CRON_SECRET` must be set in Vercel or they return `401`.
5. **Final gate** — confirm the local upload driver stays disabled (it checks
   `NODE_ENV`), seed passwords are replaced, and backups/point-in-time recovery
   are enabled on Supabase.
6. **Automatic deploys** — run `vercel git connect` once so every push to
   `main` builds and deploys to production. Run `vercel --prod` manually only
   for the first deploy or when the Git connection is unavailable.
