-- Trade on jobs, trades and areas on workers, for assigning by trade and area. Additive only.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS trade text CHECK (trade IS NULL OR trade IN ('electrical','plumbing','ac','carpentry','painting','cleaning','general'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS trades text[] NOT NULL DEFAULT '{}' CHECK (cardinality(trades) <= 7 AND trades <@ ARRAY['electrical','plumbing','ac','carpentry','painting','cleaning','general']::text[]);
ALTER TABLE members ADD COLUMN IF NOT EXISTS areas text[] NOT NULL DEFAULT '{}' CHECK (cardinality(areas) <= 30);
CREATE INDEX IF NOT EXISTS wo_ws_trade ON work_orders(workspace_id, trade) WHERE trade IS NOT NULL;
