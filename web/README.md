# SideQuest (web)

The mockup's interface (`../mockup/sidequest-v2.html`) as a working app:
Next.js + Supabase (auth, Postgres with RLS, storage, realtime).

## Setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. `npm install`
3. `npm run db:migrate` — applies `supabase/migrations/`.
4. `npm run db:seed` — demo data from the mockup (accounts in `scripts/demo-accounts.txt`).
5. `npm run dev` → http://localhost:3000
6. Sign up with your own email, then `npm run db:admin you@example.com` to review venue requests.

## Supabase settings (dashboard)

- Authentication → URL Configuration: Site URL = the Vercel domain, and
  Redirect URLs `https://<domain>/**` and `http://localhost:3001/**`. The
  emails' links go to `/auth/callback`.
- The default email templates work as they are (they carry the link).
  `supabase/templates/` are branded versions for when custom SMTP is set up.
- Custom SMTP (Resend or Gmail) before real users: the built-in sender only
  allows a few emails an hour.
