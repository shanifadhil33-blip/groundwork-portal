-- One private company thread. Clients and households are never members of this space.
ALTER TABLE conversations ADD COLUMN kind text NOT NULL DEFAULT 'direct' CHECK(kind IN ('direct','team'));
ALTER TABLE conversations DROP CONSTRAINT conversations_participants_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_participants_check CHECK((kind='direct' AND cardinality(participants)=2 AND participants[1]<participants[2]) OR (kind='team' AND cardinality(participants)=0));
CREATE UNIQUE INDEX conversations_one_team ON conversations(workspace_id) WHERE kind='team';
CREATE OR REPLACE FUNCTION conversation_reader(ws uuid,thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.conversations c WHERE c.workspace_id=ws AND c.id=thread AND
 ((c.kind='team' AND public.my_role(ws) IN ('admin','staff','technician')) OR (c.kind='direct' AND public.app_user_id()=ANY(c.participants) AND public.can_message_person(ws,CASE WHEN c.participants[1]=public.app_user_id() THEN c.participants[2] ELSE c.participants[1] END)))),false)
$$;
ALTER POLICY conversations_read ON conversations USING((kind='team' AND my_role(workspace_id) IN ('admin','staff','technician')) OR (kind='direct' AND app_user_id()=ANY(participants) AND can_message_person(workspace_id,CASE WHEN participants[1]=app_user_id() THEN participants[2] ELSE participants[1] END)));
ALTER POLICY conversations_insert ON conversations WITH CHECK((kind='team' AND my_role(workspace_id) IN ('admin','staff','technician')) OR (kind='direct' AND app_user_id()=ANY(participants) AND can_message_person(workspace_id,CASE WHEN participants[1]=app_user_id() THEN participants[2] ELSE participants[1] END)));
CREATE FUNCTION create_team_space() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.conversations(workspace_id,participants,kind) VALUES(NEW.id,'{}','team') ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER workspace_team_space AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION create_team_space();
INSERT INTO conversations(workspace_id,participants,kind) SELECT id,'{}','team' FROM workspaces ON CONFLICT DO NOTHING;
ALTER TABLE messages ADD COLUMN pinned_at timestamptz,ADD COLUMN removed_at timestamptz,ADD COLUMN removed_by uuid REFERENCES users(id);
CREATE POLICY messages_team_moderation ON messages FOR UPDATE USING(my_role(workspace_id)='admin' AND EXISTS(SELECT 1 FROM conversations c WHERE c.workspace_id=messages.workspace_id AND c.id=messages.conversation_id AND c.kind='team')) WITH CHECK(my_role(workspace_id)='admin' AND EXISTS(SELECT 1 FROM conversations c WHERE c.workspace_id=messages.workspace_id AND c.id=messages.conversation_id AND c.kind='team'));
CREATE FUNCTION guard_team_moderation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-'pinned_at'-'removed_at'-'removed_by'-'body'-'photo_ids'-'voice_note_text')<>(to_jsonb(OLD)-'pinned_at'-'removed_at'-'removed_by'-'body'-'photo_ids'-'voice_note_text') THEN RAISE EXCEPTION 'Only pinning or removal is allowed' USING ERRCODE='P0403'; END IF;
 IF NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
  IF OLD.removed_at IS NOT NULL OR NEW.removed_at IS NULL OR NEW.removed_by IS DISTINCT FROM public.app_user_id() OR NEW.body<>'Message removed by an admin' OR NEW.photo_ids<>'[]'::jsonb OR NEW.voice_note_text IS NOT NULL THEN RAISE EXCEPTION 'Use message removal' USING ERRCODE='P0403'; END IF;
 ELSE
  IF (NEW.body,NEW.photo_ids,NEW.voice_note_text,NEW.removed_by) IS DISTINCT FROM (OLD.body,OLD.photo_ids,OLD.voice_note_text,OLD.removed_by) THEN RAISE EXCEPTION 'Only pinning or removal is allowed' USING ERRCODE='P0403'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER message_moderation BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION guard_team_moderation();
CREATE FUNCTION remove_team_message_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.removed_at IS DISTINCT FROM OLD.removed_at AND NEW.removed_at IS NOT NULL THEN
  DELETE FROM public.shared_photos WHERE workspace_id=OLD.workspace_id AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(OLD.photo_ids));
  DELETE FROM public.message_translations WHERE workspace_id=OLD.workspace_id AND conversation_id=OLD.conversation_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER removed_message_content AFTER UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION remove_team_message_content();
CREATE OR REPLACE FUNCTION notify_direct_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE team boolean;
BEGIN
 SELECT kind='team' INTO team FROM public.conversations WHERE workspace_id=NEW.workspace_id AND id=NEW.conversation_id;
 IF team THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
  SELECT user_id,NEW.workspace_id,'team_message','team_space',NEW.conversation_id,NEW.sender_id,NEW.sender_name,'Team space' FROM public.members WHERE workspace_id=NEW.workspace_id AND archived_at IS NULL AND role IN ('admin','staff','technician') AND user_id<>NEW.sender_id;
 ELSE
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
  SELECT person,NEW.workspace_id,'message_received','conversations',NEW.conversation_id,NEW.sender_id,NEW.sender_name,'Messages' FROM public.conversations c CROSS JOIN LATERAL unnest(c.participants) person WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.conversation_id AND person<>NEW.sender_id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION create_team_space(),guard_team_moderation(),remove_team_message_content() FROM PUBLIC;
