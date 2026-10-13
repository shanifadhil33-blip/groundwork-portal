-- Removes suggestions only. Approved jobs remain in their normal history.
ALTER POLICY work_orders_insert ON work_orders WITH CHECK((is_staff(workspace_id) AND created_by=app_user_id()) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id) AND created_by=app_user_id() AND source='client' AND status='open' AND assignee_id IS NULL AND scheduled_for IS NULL AND due_on IS NULL));
DROP FUNCTION IF EXISTS notify_suggestion() CASCADE;
DROP TABLE IF EXISTS shared_photos;
DROP TABLE IF EXISTS job_suggestions;
