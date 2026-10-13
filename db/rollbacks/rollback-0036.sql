-- Removes suggestions only. Approved jobs remain in their normal history.
ALTER POLICY work_orders_insert ON work_orders WITH CHECK(is_staff(workspace_id) AND created_by=app_user_id());
DROP FUNCTION IF EXISTS notify_suggestion() CASCADE;
DROP TABLE IF EXISTS shared_photos;
DROP TABLE IF EXISTS job_suggestions;
