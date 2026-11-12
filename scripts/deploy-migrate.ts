/**
 * Production deploys apply pending database migrations before the new build goes live, using the
 * owner connection Vercel already holds. Everything runs in one transaction (scripts/migrate.ts): it
 * applies fully or changes nothing, and a failure stops the build, so the live version keeps running.
 * Preview builds and local builds never touch a database here.
 */
import { migrate, runOwner } from './migrate';
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`Migrations skipped (${process.env.VERCEL_ENV ?? 'local'} build).`);
} else {
  await runOwner(migrate);
  console.log('Production migrations applied.');
}
