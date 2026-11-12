# Go live: steps for the agent that deploys Groundwork

Context: pull request #17 (branch `claude/new-session-mptqlm`) holds all six steps of the Nov 10 handoff.
Tests pass (4,827) and a local crawl of every page is clean. What is left needs production access:
three database migrations, the merge, and checks on the live site. Adhil has approved all of it.

Do the steps in this order. Stop and report if any step fails.

## 1. Get the code and the production settings

```bash
git fetch origin claude/new-session-mptqlm
git checkout claude/new-session-mptqlm
pnpm install
vercel link                      # project: groundwork-portal
vercel env pull .env.production.local --environment=production
```

You need `DATABASE_URL_OWNER` (owner connection) from that file, and `APP_DB_ROLE` if it is set there
(if it is not set, the app role is `portal_app`). Never print these values or commit the file.

## 2. Make a safety copy of the database

In the Neon console (or `neonctl branches create --name before-nov12-migrations`), create a branch of the
production database first. It is a free instant copy to go back to if anything goes wrong.

## 3. Apply the three new migrations to production

The migrations are `db/migrations/0072_rls_once_per_query.sql`, `0073_agent_quota.sql` and
`0074_function_row_estimates.sql`. They work with the current live code too, so run them before the merge.

```bash
set -a; source .env.production.local; set +a
pnpm db:migrate
```

It runs in one transaction: everything applies or nothing does. Expected output: `Migrations applied.`
Check:

```sql
SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 3;
-- 0074_function_row_estimates.sql, 0073_agent_quota.sql, 0072_rls_once_per_query.sql
```

If it fails, nothing changed. Report the error and stop.

## 4. Merge pull request #17

Merge with a normal merge commit (keeps the step by step history). Vercel builds and deploys production.
Wait for the production deployment to show Ready. If the build fails, the old version stays live; report
the build log.

## 5. Check the live site

- Open the site, choose the demo, and go through Imran (owner), Ravi (technician) and Pranav (client)
  on a phone sized window: Home, Jobs, one job, the Agent button, Settings. Then once more in Arabic.
- Vercel, project groundwork-portal: look at runtime errors and logs for the last hour. Lines starting
  with `[slow query]` show any database query over 500 ms with its route; report any.
- The demo start should take under 3 s.

## 6. Two checks only Adhil can do (his Google account and his phone)

- Sign in with Google on the live site, sign out, sign in again.
- On his phone: Settings, turn on notifications, then have a job assigned to him and check the push arrives.

## If something goes wrong after the merge

- App problem: in Vercel, Deployments, pick the previous production deployment and choose Instant Rollback.
  The migrations can stay; the old code works with them.
- Database problem: run the rollbacks in reverse order on the owner connection,
  `db/rollbacks/rollback-0074.sql`, then `rollback-0073.sql`, then `rollback-0072.sql`,
  then delete those three rows from `schema_migrations`. Or restore from the Neon branch made in step 2.

## Optional: migrations on every production deploy

`scripts/deploy-migrate.ts` applies pending migrations only when `VERCEL_ENV=production`. To use it, change
the `build` script in `package.json` to `tsx scripts/deploy-migrate.ts && next build`. Not needed for this
release if step 3 was done by hand.

## Notes

- The daily demo cleanup cron stays daily (it works on the free Vercel plan). Expired demos are also cleaned
  right after each new demo starts.
- Full details of what changed: `docs/REPORT-2026-11-12.md` and the PR description.
