-- Direct threads stay private to their participants. Job threads reuse comments.
CREATE FUNCTION can_message_person(ws uuid,target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(EXISTS(
 SELECT 1 FROM public.members me JOIN public.members other ON other.workspace_id=me.workspace_id
 WHERE me.workspace_id=ws AND me.user_id=public.app_user_id() AND other.user_id=target AND target<>me.user_id AND me.archived_at IS NULL AND other.archived_at IS NULL AND (
 (me.role='admin' OR (me.role='staff' AND me.staff_kind IS DISTINCT FROM 'office'))
 OR (other.role='admin' OR (other.role='staff' AND other.staff_kind IS DISTINCT FROM 'office'))
 OR (me.role<>'client' AND other.role<>'client')
 OR (me.role='client' AND other.role='client' AND me.client_id=other.client_id AND coalesce(me.client_kind,'manager') IN ('manager','office') AND coalesce(other.client_kind,'manager') IN ('manager','office'))
 OR (me.role='technician' AND other.role='client' AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.workspace_id=ws AND w.assignee_id=me.user_id AND w.client_id=other.client_id AND (coalesce(other.client_kind,'manager')<>'household' OR w.created_by=other.user_id)))
 OR (me.role='client' AND other.role='technician' AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.workspace_id=ws AND w.assignee_id=other.user_id AND w.client_id=me.client_id AND (coalesce(me.client_kind,'manager')<>'household' OR w.created_by=me.user_id)))
 )),false)
$$;
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 participants uuid[] NOT NULL CHECK(cardinality(participants)=2 AND participants[1]<participants[2]),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,participants)
);
CREATE FUNCTION conversation_reader(ws uuid,thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.conversations c WHERE c.workspace_id=ws AND c.id=thread AND public.app_user_id()=ANY(c.participants) AND public.can_message_person(ws,CASE WHEN c.participants[1]=public.app_user_id() THEN c.participants[2] ELSE c.participants[1] END)),false)
$$;
CREATE FUNCTION message_people(ws uuid) RETURNS TABLE(user_id uuid,name text,role text,staff_kind text,client_kind text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT m.user_id,coalesce(u.name,'Team member'),m.role,m.staff_kind,m.client_kind FROM public.members m JOIN public.users u ON u.id=m.user_id WHERE m.workspace_id=ws AND public.can_message_person(ws,m.user_id) ORDER BY u.name,m.user_id
$$;
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 conversation_id uuid,work_order_id uuid,sender_id uuid NOT NULL REFERENCES users(id),sender_name text NOT NULL,
 body text NOT NULL CHECK(length(body)<=20000),photo_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(photo_ids)='array'),voice_note_text text,original_language text NOT NULL DEFAULT 'en',
 created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),UNIQUE(workspace_id,id),
 CHECK(num_nonnulls(conversation_id,work_order_id)=1),CHECK(length(trim(body))>0 OR jsonb_array_length(photo_ids)>0),
 FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE comments ADD COLUMN author_name text,ADD COLUMN photo_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(photo_ids)='array'),ADD COLUMN voice_note_text text,ADD COLUMN original_language text NOT NULL DEFAULT 'en';
ALTER TABLE comments ALTER COLUMN created_at SET DEFAULT date_trunc('milliseconds',clock_timestamp());
CREATE TABLE message_reads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,conversation_id uuid,work_order_id uuid,last_read_at timestamptz NOT NULL,
 CHECK(num_nonnulls(conversation_id,work_order_id)=1),
 FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX message_reads_conversation ON message_reads(workspace_id,user_id,conversation_id) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX message_reads_job ON message_reads(workspace_id,user_id,work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX messages_thread_time ON messages(workspace_id,conversation_id,created_at,id);
ALTER TABLE shared_photos ADD COLUMN conversation_id uuid,ADD COLUMN work_order_id uuid,
 ADD FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE CASCADE,
 ADD FOREIGN KEY(workspace_id,work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['conversations','messages','message_reads'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY system_owner ON %I TO %I USING(true) WITH CHECK(true)',t,current_user);
 END LOOP; END $$;
CREATE POLICY conversations_read ON conversations FOR SELECT USING(app_user_id()=ANY(participants) AND can_message_person(workspace_id,CASE WHEN participants[1]=app_user_id() THEN participants[2] ELSE participants[1] END));
CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK(app_user_id()=ANY(participants) AND can_message_person(workspace_id,CASE WHEN participants[1]=app_user_id() THEN participants[2] ELSE participants[1] END));
CREATE POLICY messages_read ON messages FOR SELECT USING(conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=messages.workspace_id AND w.id=messages.work_order_id));
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK(sender_id=app_user_id() AND (conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=messages.workspace_id AND w.id=messages.work_order_id)));
CREATE POLICY message_reads_personal ON message_reads USING(user_id=app_user_id() AND (conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=message_reads.workspace_id AND w.id=message_reads.work_order_id))) WITH CHECK(user_id=app_user_id() AND (conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=message_reads.workspace_id AND w.id=message_reads.work_order_id)));
ALTER POLICY shared_photos_insert ON shared_photos WITH CHECK(is_member(workspace_id) AND uploaded_by=app_user_id() AND suggestion_id IS NULL AND conversation_id IS NULL AND work_order_id IS NULL);
ALTER POLICY shared_photos_read ON shared_photos USING(is_member(workspace_id) AND ((uploaded_by=app_user_id() AND conversation_id IS NULL AND work_order_id IS NULL) OR EXISTS(SELECT 1 FROM job_suggestions s WHERE s.workspace_id=shared_photos.workspace_id AND s.id=shared_photos.suggestion_id) OR conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=shared_photos.workspace_id AND w.id=shared_photos.work_order_id)));
-- Link photos inside the same insert transaction. Every supplied id must be the sender's unlinked draft.
CREATE FUNCTION link_message_photos() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE photo uuid; author uuid; thread uuid; job uuid;
BEGIN
 author=coalesce((to_jsonb(NEW)->>'author_id')::uuid,(to_jsonb(NEW)->>'sender_id')::uuid);
 thread=(to_jsonb(NEW)->>'conversation_id')::uuid;job=NEW.work_order_id;
 IF TG_TABLE_NAME='messages' THEN SELECT coalesce(name,'Team member') INTO NEW.sender_name FROM public.users WHERE id=author;
 ELSE SELECT coalesce(name,'Team member') INTO NEW.author_name FROM public.users WHERE id=author; END IF;
 IF jsonb_array_length(NEW.photo_ids)>4 THEN RAISE EXCEPTION 'Choose up to four photos' USING ERRCODE='P0422'; END IF;
 FOR photo IN SELECT value::uuid FROM jsonb_array_elements_text(NEW.photo_ids) LOOP
  UPDATE public.shared_photos SET conversation_id=thread,work_order_id=job WHERE workspace_id=NEW.workspace_id AND id=photo AND uploaded_by=author AND suggestion_id IS NULL AND conversation_id IS NULL AND work_order_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose your own draft photos' USING ERRCODE='P0422'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER message_photos BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION link_message_photos();
CREATE TRIGGER comment_photos BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION link_message_photos();
CREATE FUNCTION notify_direct_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
 SELECT person,NEW.workspace_id,'message_received','conversations',NEW.conversation_id,NEW.sender_id,NEW.sender_name,'Messages' FROM public.conversations c CROSS JOIN LATERAL unnest(c.participants) person
 WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.conversation_id AND person<>NEW.sender_id;
 RETURN NULL;
END $$;
CREATE TRIGGER direct_message_notification AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION notify_direct_message();
REVOKE ALL ON conversations,messages,message_reads FROM PUBLIC;
REVOKE ALL ON FUNCTION can_message_person(uuid,uuid),conversation_reader(uuid,uuid),message_people(uuid),link_message_photos(),notify_direct_message() FROM PUBLIC;
-- Message translations contain private text and must never enter the global UI cache.
CREATE TABLE message_translations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,conversation_id uuid,work_order_id uuid,
 lang text NOT NULL,source_hash text NOT NULL,source text NOT NULL,translated text NOT NULL,
 CHECK(num_nonnulls(conversation_id,work_order_id)=1),
 FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX message_translation_direct ON message_translations(workspace_id,user_id,conversation_id,lang,source_hash) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX message_translation_job ON message_translations(workspace_id,user_id,work_order_id,lang,source_hash) WHERE work_order_id IS NOT NULL;
ALTER TABLE message_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_translations FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON message_translations TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY message_translations_personal ON message_translations USING(user_id=app_user_id() AND (conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=message_translations.workspace_id AND w.id=message_translations.work_order_id))) WITH CHECK(user_id=app_user_id() AND (conversation_reader(workspace_id,conversation_id) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=message_translations.workspace_id AND w.id=message_translations.work_order_id)));
REVOKE ALL ON message_translations FROM PUBLIC;
