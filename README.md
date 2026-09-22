# VPlanner

Internal content-production dashboard. First module: long-form YouTube video
pipeline management.

## Stack

- **Next.js 15** (App Router) — frontend and backend in one project
- **Supabase** — Postgres database, auth, and file storage. Permissions are
  enforced at the database level via Row Level Security (RLS), not just in
  the UI.
- **Vercel** — hosting. `main` branch → production. Every other branch/PR →
  its own preview deployment, pointed at the staging database.

## Project structure

```
app/
  login/                 Sign-in page (email/password, server action)
  (dashboard)/           Everything behind auth
    dashboard/           Placeholder home page
  api/auth/callback/     OAuth/magic-link callback (unused today, ready for
                          Google auth later)
lib/
  supabase/              Client helpers (browser, server, middleware)
  permissions/roles.ts   Frontend mirror of the DB's role → stage rules
modules/
  long-videos/           Where the video-pipeline module's own components
                          and logic will live, kept separate from shared
                          app code so future modules (Shorts, TikTok, etc.)
                          don't get tangled up with this one
supabase/
  migrations/0001_init.sql   Full schema: teams, roles, tags, projects,
                              stages, comments, review pins, RLS policies
types/database.ts        Placeholder types — see note below
```

## First-time setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Apply the database schema.** In your Supabase project (use
   `vplanner-staging` first): open the **SQL Editor**, paste the entire
   contents of `supabase/migrations/0001_init.sql`, and run it. Do the same
   in `vplanner-production` once you're happy with it.

3. **Set up local environment variables**
   ```
   cp .env.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   from your **staging** project (Settings → Data API). Never commit
   `.env.local` — it's already gitignored.

4. **Create your own login.** This app has no public sign-up page on
   purpose. Create your first user from the Supabase dashboard:
   Authentication → Users → Add user (set an email + password). That's the
   account you'll sign in with.

5. **Run it locally**
   ```
   npm run dev
   ```
   Visit `http://localhost:3000`, sign in, and you should land on a bare
   dashboard confirming your session and database connection both work.

6. **(Optional, recommended) Generate real types once the schema is live**
   ```
   npx supabase gen types typescript --project-id <your-project-ref> > types/database.ts
   ```

## Pushing this to GitHub

From inside this folder:

```
git init                        # only if not already a git repo
git remote add origin git@github.com:<your-username>/vplanner.git   # if not already set
git add .
git commit -m "Scaffold Next.js + Supabase project structure, auth, and DB schema"
git push -u origin main
```

Vercel will pick up the push automatically and deploy it.

## Where things stand

This is the **foundation**, not the finished app: real auth, a real
database schema with the full permission model enforced by RLS, and a
proof-that-it-all-works dashboard page. The actual VPlanner interface
(workspace switcher, project pipeline UI, calendar, editor review tool,
etc.) gets built next, on top of this — and on top of a proper design
system pass, since the current styling is placeholder only.
