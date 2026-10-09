ALTER TABLE imports DROP CONSTRAINT imports_status_check;
UPDATE imports SET status='uploaded' WHERE status='draft';
ALTER TABLE imports ALTER COLUMN status SET DEFAULT 'uploaded';
ALTER TABLE imports ADD CHECK(status IN ('uploaded','mapped','queued','completed'));
ALTER TABLE imports ADD COLUMN content_hash text, ADD COLUMN headers jsonb NOT NULL DEFAULT '[]', ADD COLUMN raw_rows jsonb NOT NULL DEFAULT '[]', ADD COLUMN mapping jsonb NOT NULL DEFAULT '{}';
CREATE INDEX imports_content_hash ON imports(workspace_id,content_hash);
ALTER TABLE import_rows ADD COLUMN warnings jsonb NOT NULL DEFAULT '[]', ADD COLUMN status text NOT NULL DEFAULT 'valid' CHECK(status IN ('valid','warning','error')), ADD COLUMN queued boolean NOT NULL DEFAULT false, ADD COLUMN rejected_at timestamptz;
CREATE INDEX import_rows_queue ON import_rows(workspace_id,decision) WHERE queued;
-- Preserve any queue data staged before this workflow migration.
UPDATE import_rows r SET status=CASE WHEN jsonb_array_length(r.errors)>0 THEN 'error' ELSE 'valid' END,
 queued=i.status IN ('queued','completed') AND jsonb_array_length(r.errors)=0
 FROM imports i WHERE i.id=r.import_id AND i.workspace_id=r.workspace_id;
