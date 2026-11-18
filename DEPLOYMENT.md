# Deployment and service configuration

The code, schema and seed are all in this repository. What is **not** in it is the
configuration applied to Supabase and Vercel through their dashboards and APIs.
Without the steps below a fresh deployment builds and runs, but password reset
links break and the site sits behind a Vercel login wall.

This is the checklist for standing the app up somewhere new, or for handing it to
somebody else.

## 1. Supabase project

Create a project, then fill in `.env.local` (see `.env.example`) and apply the
schema:

```bash
npm run setup           # writes the two API keys into .env.local
npm run setup:supabase  # stores an account token for migrations
npm run db:apply        # applies every migration, tracked in schema_migrations
npm run db:seed         # development data only — never in production
```

`npm run db:apply -- --status` lists what has been applied and what is pending.
For a database created by hand, `npm run db:apply -- --baseline <version>` records
migrations up to that version as applied without re-running them.

### Auth settings

These are **not** in the repository and must be set per project, under
Authentication → URL Configuration and Providers → Email:

| Setting | Value | Why |
| --- | --- | --- |
| Site URL | the production URL | Where emailed links come back to |
| Redirect URLs | `https://<production>/**` and `http://localhost:3000/**` | Otherwise a reset link is rejected |
| Minimum password length | 8 | Matches what the form asks for |

They can also be set through the Management API:

```
PATCH https://api.supabase.com/v1/projects/<ref>/config/auth
{ "site_url": "...", "uri_allow_list": "...", "password_min_length": 8 }
```

### A known limitation

Free-tier projects use a shared email sender and cannot customise email
templates. The recovery link therefore arrives in Supabase's default format,
which delivers its credential in the URL fragment — handled in
`app/(auth)/admin-reset/`.

That sender is also unreliable: mail providers pre-open links to scan them, which
burns the one-time token before the organiser clicks it, producing
`otp_expired`. `npm run admin:password` is the way back in when that happens.
Configuring a custom SMTP sender removes the problem.

## 2. Vercel project

```bash
npm run setup:vercel    # stores a deploy token
npx vercel link --yes --project <name>
```

Push these environment variables to **production and preview** — the
`NEXT_PUBLIC_` ones are inlined at build time, so they must exist before a build,
not just at runtime:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

`DATABASE_URL` and the `*-token` files are local tooling only. They must never be
added to Vercel.

### Turn off Deployment Protection

Vercel enables **Vercel Authentication** on new projects, which redirects
anonymous visitors to a Vercel login. For an app the whole group opens from a
chat link, this has to go:

Project → Settings → Deployment Protection → Vercel Authentication → Disabled.

Or:

```
PATCH https://api.vercel.com/v9/projects/<id>
{ "ssoProtection": null }
```

Verify with a request that carries no cookies, not just in a browser you are
already signed into Vercel with:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<production>/
```

A `307` to `vercel.com/login` means it is still protected.

## 3. The first organiser

Admins sign in with Supabase Auth rather than a PIN.

1. Authentication → Users → **Add user**, with an email and password, and
   **Auto Confirm User** ticked.
2. Make sure a player row carries the same email — the `on_auth_user_created`
   trigger links the two automatically:

```sql
update players set email = 'you@example.com' where name = 'Your Name';
update group_members set role = 'admin'
 where player_id = (select id from players where name = 'Your Name');
```

Then sign in at `/admin-login`.

## 4. Group settings

Kickoff times, venue and the reveal schedule are **data**, not configuration, and
are edited in the app under Admin → Settings. A new deployment starts from the
values in `supabase/seed.sql`.

## Handing this over

Someone taking this on needs:

- this repository
- **Supabase**: an invitation to the project (Settings → Team), not the keys
- **Vercel**: an invitation to the project, not the token
- the production URL

Never send API keys or tokens in a message. Adding somebody to both projects lets
them generate their own, and lets you remove their access later.

<!-- deploy check 23:11 -->

## Backups

The free Supabase plan keeps **no backups** (no point-in-time recovery, nothing
scheduled). Take one yourself:

```bash
npm run db:backup     # writes ~/sunday-football-backups/*.json.gz, owner-only
```

It exports every `public` table plus the list of admin sign-ins (no password
hashes) through the Management API, and checks each table's row count. Do it
before any migration and roughly weekly. The file holds private data (PIN hashes,
ratings, emails): keep it out of git and out of shared folders. Avatar images are
not included. It is a data export, not a one-command restore; rebuild the schema
with `npm run db:apply`, then load the rows.
