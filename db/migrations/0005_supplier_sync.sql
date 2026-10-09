-- Cobalt is a simulated supplier, part of this repo. Its source of truth is
-- deliberately separate from the portal's supplier projections.
CREATE TABLE cobalt_state (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 sequence bigint NOT NULL DEFAULT 0 CHECK(sequence>=0), outage boolean NOT NULL DEFAULT false
);
CREATE TABLE cobalt_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 work_order_id uuid NOT NULL, cobalt_ref text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('ordered','shipped','delivered','cancelled')),
 UNIQUE(workspace_id,cobalt_ref)
);
CREATE TABLE cobalt_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 cobalt_ref text NOT NULL, event_id text NOT NULL UNIQUE, sequence bigint NOT NULL CHECK(sequence>0),
 status text NOT NULL CHECK(status IN ('ordered','shipped','delivered','cancelled')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), dropped boolean NOT NULL DEFAULT false,
 UNIQUE(workspace_id,sequence), FOREIGN KEY(workspace_id,cobalt_ref) REFERENCES cobalt_orders(workspace_id,cobalt_ref) ON DELETE CASCADE
);
ALTER TABLE supplier_orders ADD COLUMN last_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE supplier_events ADD COLUMN sequence bigint;
CREATE TABLE supplier_sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 trigger text NOT NULL CHECK(trigger IN ('manual','cron')), operation text NOT NULL CHECK(operation IN ('check','repair')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 mismatches_found integer NOT NULL DEFAULT 0, repaired_count integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','error')), error_message text
);
CREATE INDEX supplier_sync_runs_recent ON supplier_sync_runs(workspace_id,started_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cobalt_state','cobalt_orders','cobalt_events','supplier_sync_runs'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY system_owner ON %I TO %I USING(true) WITH CHECK(true)',t,current_user);
 EXECUTE format('CREATE POLICY staff_read ON %I FOR SELECT USING(is_staff(workspace_id))',t);
 END LOOP;
END $$;
REVOKE ALL ON cobalt_state,cobalt_orders,cobalt_events,supplier_sync_runs FROM PUBLIC;
-- Bootstrap existing supplier rows without changing the portal projection.
INSERT INTO cobalt_state(workspace_id) SELECT DISTINCT workspace_id FROM supplier_orders;
INSERT INTO cobalt_orders(workspace_id,work_order_id,cobalt_ref,status)
 SELECT workspace_id,work_order_id,cobalt_ref,local_status FROM supplier_orders;
-- No synthetic historical events: future sequences start after any known receipts.
UPDATE cobalt_state s SET sequence=coalesce((SELECT max(last_sequence) FROM supplier_orders WHERE workspace_id=s.workspace_id),0);
