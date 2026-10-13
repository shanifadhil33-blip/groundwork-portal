-- Job comments remain. Only the added messaging fields and direct threads are removed.
DROP TRIGGER IF EXISTS comment_photos ON comments;
DROP TRIGGER IF EXISTS message_photos ON messages;
DROP TRIGGER IF EXISTS direct_message_notification ON messages;
DROP FUNCTION IF EXISTS link_message_photos(),notify_direct_message();
ALTER POLICY shared_photos_read ON shared_photos USING(is_member(workspace_id) AND (uploaded_by=app_user_id() OR EXISTS(SELECT 1 FROM job_suggestions s WHERE s.workspace_id=shared_photos.workspace_id AND s.id=shared_photos.suggestion_id)));
ALTER POLICY shared_photos_insert ON shared_photos WITH CHECK(is_member(workspace_id) AND uploaded_by=app_user_id() AND suggestion_id IS NULL);
ALTER TABLE shared_photos DROP COLUMN IF EXISTS conversation_id,DROP COLUMN IF EXISTS work_order_id;
DROP TABLE IF EXISTS message_reads,messages;
DROP TABLE IF EXISTS conversations CASCADE;
DROP FUNCTION IF EXISTS conversation_reader(uuid,uuid),message_people(uuid),can_message_person(uuid,uuid);
ALTER TABLE comments DROP COLUMN IF EXISTS author_name,DROP COLUMN IF EXISTS photo_ids,DROP COLUMN IF EXISTS voice_note_text,DROP COLUMN IF EXISTS original_language;

ALTER TABLE comments ALTER COLUMN created_at SET DEFAULT now();
