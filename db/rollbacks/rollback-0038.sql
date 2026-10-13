-- Removes only Team space. Private direct threads and job comments remain.
DROP TRIGGER IF EXISTS workspace_team_space ON workspaces;
DROP FUNCTION IF EXISTS create_team_space();
DROP TRIGGER IF EXISTS message_moderation ON messages;
DROP TRIGGER IF EXISTS removed_message_content ON messages;
DROP FUNCTION IF EXISTS guard_team_moderation(),remove_team_message_content();
DROP POLICY IF EXISTS messages_team_moderation ON messages;
DELETE FROM conversations WHERE kind='team';
CREATE OR REPLACE FUNCTION notify_direct_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
 SELECT person,NEW.workspace_id,'message_received','conversations',NEW.conversation_id,NEW.sender_id,NEW.sender_name,'Messages' FROM public.conversations c CROSS JOIN LATERAL unnest(c.participants) person
 WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.conversation_id AND person<>NEW.sender_id;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION conversation_reader(ws uuid,thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.conversations c WHERE c.workspace_id=ws AND c.id=thread AND public.app_user_id()=ANY(c.participants) AND public.can_message_person(ws,CASE WHEN c.participants[1]=public.app_user_id() THEN c.participants[2] ELSE c.participants[1] END)),false)
$$;
ALTER POLICY conversations_read ON conversations USING(app_user_id()=ANY(participants) AND can_message_person(workspace_id,CASE WHEN participants[1]=app_user_id() THEN participants[2] ELSE participants[1] END));
ALTER POLICY conversations_insert ON conversations WITH CHECK(app_user_id()=ANY(participants) AND can_message_person(workspace_id,CASE WHEN participants[1]=app_user_id() THEN participants[2] ELSE participants[1] END));
DROP INDEX IF EXISTS conversations_one_team;
ALTER TABLE conversations DROP CONSTRAINT conversations_participants_check;
ALTER TABLE conversations DROP COLUMN kind;
ALTER TABLE conversations ADD CONSTRAINT conversations_participants_check CHECK(cardinality(participants)=2 AND participants[1]<participants[2]);
ALTER TABLE messages DROP COLUMN pinned_at,DROP COLUMN removed_at,DROP COLUMN removed_by;
