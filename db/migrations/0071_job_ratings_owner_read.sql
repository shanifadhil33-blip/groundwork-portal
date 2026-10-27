-- Ratings RLS: job_ratings has FORCE ROW LEVEL SECURITY but no policy for the
-- migration owner, so owner reads (withSystem, used by lib/services/technician-ratings.ts
-- to show a technician only his own 4 and 5 star thanks) return nothing.
-- Same pattern as other tables (0019, 0056, 0064, 0066), but read only:
-- the owner may SELECT; inserts still go through job_ratings_insert as the client.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_ratings' AND policyname='system_owner_read') THEN
    EXECUTE format('CREATE POLICY system_owner_read ON job_ratings FOR SELECT TO %I USING (true)', current_user);
  END IF;
END $$;
