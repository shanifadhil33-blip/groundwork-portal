# Go live: steps for the agent that deploys Groundwork

Groundwork is a portfolio project with no real users. The goal is that an agency owner who opens it from
Adhil's portfolio sees everything working. Pull request #17 (branch `claude/new-session-mptqlm`) holds the
finished work; tests pass. Adhil has approved every step below. Stop and report if a step fails.

1. Check out the branch and pull the production settings:
   ```bash
   git fetch origin claude/new-session-mptqlm && git checkout claude/new-session-mptqlm
   pnpm install
   vercel link   # project: groundwork-portal
   vercel env pull .env.production.local --environment=production
   ```
   Do not print or commit that file.

2. Apply the three new database migrations (0072, 0073, 0074) to production. They also work with the
   current live code, so do this before the merge. It runs in one transaction: all or nothing.
   ```bash
   set -a; source .env.production.local; set +a
   pnpm db:migrate
   ```
   Expected output: `Migrations applied.`

3. Merge pull request #17 into main with a normal merge commit. Wait until the Vercel production
   deployment is Ready.

4. Check the live site: open the demo, try Imran (owner), Ravi (technician) and Pranav (client) on a phone
   sized window (Home, Jobs, one job, the Agent button, Settings), then once in Arabic. In Vercel, check
   runtime errors for the last hour. Report anything broken.

If the new version misbehaves, use Instant Rollback in Vercel to the previous production deployment.
