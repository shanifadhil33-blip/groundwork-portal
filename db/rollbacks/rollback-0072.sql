-- Put back the per row helper policies.
ALTER POLICY "workspaces_read" ON public.workspaces USING (is_member(id));
ALTER POLICY "workspaces_insert" ON public.workspaces WITH CHECK ((my_role(id) = 'admin'::text));
ALTER POLICY "workspaces_update" ON public.workspaces USING ((my_role(id) = 'admin'::text)) WITH CHECK ((my_role(id) = 'admin'::text));
ALTER POLICY "workspaces_delete" ON public.workspaces USING ((my_role(id) = 'admin'::text));
ALTER POLICY "members_read" ON public.members USING (is_staff(workspace_id));
ALTER POLICY "members_insert" ON public.members WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "members_update" ON public.members USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "members_delete" ON public.members USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "sites_delete" ON public.sites USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "clients_insert" ON public.clients WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "clients_update" ON public.clients USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "clients_delete" ON public.clients USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "sites_insert" ON public.sites WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "sites_update" ON public.sites USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "work_orders_delete" ON public.work_orders USING (is_staff(workspace_id));
ALTER POLICY "comments_update" ON public.comments USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
ALTER POLICY "comments_delete" ON public.comments USING (is_staff(workspace_id));
ALTER POLICY "invites_read" ON public.invites USING (is_staff(workspace_id));
ALTER POLICY "invites_insert" ON public.invites WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "invites_update" ON public.invites USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "invites_delete" ON public.invites USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "imports_read" ON public.imports USING (is_staff(workspace_id));
ALTER POLICY "imports_insert" ON public.imports WITH CHECK (is_staff(workspace_id));
ALTER POLICY "imports_update" ON public.imports USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
ALTER POLICY "imports_delete" ON public.imports USING (is_staff(workspace_id));
ALTER POLICY "import_rows_read" ON public.import_rows USING (is_staff(workspace_id));
ALTER POLICY "import_rows_insert" ON public.import_rows WITH CHECK (is_staff(workspace_id));
ALTER POLICY "import_rows_update" ON public.import_rows USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
ALTER POLICY "import_rows_delete" ON public.import_rows USING (is_staff(workspace_id));
ALTER POLICY "supplier_orders_read" ON public.supplier_orders USING (is_staff(workspace_id));
ALTER POLICY "supplier_orders_insert" ON public.supplier_orders WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "supplier_orders_update" ON public.supplier_orders USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "supplier_orders_delete" ON public.supplier_orders USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "supplier_events_read" ON public.supplier_events USING (is_staff(workspace_id));
ALTER POLICY "supplier_events_insert" ON public.supplier_events WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "supplier_events_update" ON public.supplier_events USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "supplier_events_delete" ON public.supplier_events USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "audit_log_read" ON public.audit_log USING (((my_role(workspace_id) = 'admin'::text) OR ((my_role(workspace_id) = 'staff'::text) AND (actor_id = app_user_id()))));
ALTER POLICY "notifications_read" ON public.notifications USING ((is_member(workspace_id) AND (user_id = app_user_id())));
ALTER POLICY "notifications_update" ON public.notifications USING ((is_member(workspace_id) AND (user_id = app_user_id()))) WITH CHECK ((is_member(workspace_id) AND (user_id = app_user_id())));
ALTER POLICY "staff_read" ON public.cobalt_state USING (is_staff(workspace_id));
ALTER POLICY "staff_read" ON public.cobalt_orders USING (is_staff(workspace_id));
ALTER POLICY "staff_read" ON public.cobalt_events USING (is_staff(workspace_id));
ALTER POLICY "staff_read" ON public.supplier_sync_runs USING (is_staff(workspace_id));
ALTER POLICY "token_read" ON public.api_tokens USING ((is_member(workspace_id) AND ((user_id = app_user_id()) OR (my_role(workspace_id) = 'admin'::text))));
ALTER POLICY "token_create" ON public.api_tokens WITH CHECK (((user_id = app_user_id()) AND is_member(workspace_id)));
ALTER POLICY "token_revoke" ON public.api_tokens USING ((is_member(workspace_id) AND ((user_id = app_user_id()) OR (my_role(workspace_id) = 'admin'::text)))) WITH CHECK ((is_member(workspace_id) AND ((user_id = app_user_id()) OR (my_role(workspace_id) = 'admin'::text))));
ALTER POLICY "own_actions" ON public.assistant_actions USING (((user_id = app_user_id()) AND is_member(workspace_id))) WITH CHECK (((user_id = app_user_id()) AND is_member(workspace_id)));
ALTER POLICY "work_orders_read" ON public.work_orders USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id))) OR ((my_role(workspace_id) = 'technician'::text) AND (assignee_id = app_user_id()))));
ALTER POLICY "work_orders_update" ON public.work_orders USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'technician'::text) AND (assignee_id = app_user_id())))) WITH CHECK ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'technician'::text) AND (assignee_id = app_user_id()))));
ALTER POLICY "clients_read" ON public.clients USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (id = my_client(workspace_id))) OR my_job_client(workspace_id, id)));
ALTER POLICY "sites_read" ON public.sites USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id))) OR my_job_site(workspace_id, id)));
ALTER POLICY "comments_read" ON public.comments USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)) AND (visibility = 'client'::text)) OR my_job(workspace_id, work_order_id)));
ALTER POLICY "comments_insert" ON public.comments WITH CHECK (((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)) AND (visibility = 'client'::text)) OR my_job(workspace_id, work_order_id)) AND (author_id = app_user_id())));
ALTER POLICY "work_order_events_read" ON public.work_order_events USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id))) OR my_job(workspace_id, work_order_id)));
ALTER POLICY "job_photos_read" ON public.job_photos USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id))) OR my_job(workspace_id, work_order_id)));
ALTER POLICY "job_photos_insert" ON public.job_photos WITH CHECK (((is_staff(workspace_id) OR my_job(workspace_id, work_order_id)) AND (taken_by = app_user_id())));
ALTER POLICY "job_photos_delete" ON public.job_photos USING ((is_staff(workspace_id) OR (my_job(workspace_id, work_order_id) AND (taken_by = app_user_id()))));
ALTER POLICY "company_documents_staff" ON public.company_documents USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
ALTER POLICY "time_off_staff" ON public.time_off USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
ALTER POLICY "time_off_own_read" ON public.time_off USING (((user_id = app_user_id()) AND is_member(workspace_id)));
ALTER POLICY "household_own" ON public.work_orders USING (((CURRENT_USER = 'gw_owner'::name) OR (my_client_kind(workspace_id) IS DISTINCT FROM 'household'::text) OR (created_by = app_user_id()))) WITH CHECK (((CURRENT_USER = 'gw_owner'::name) OR (my_client_kind(workspace_id) IS DISTINCT FROM 'household'::text) OR (created_by = app_user_id())));
ALTER POLICY "household_own" ON public.comments USING (((CURRENT_USER = 'gw_owner'::name) OR (my_client_kind(workspace_id) IS DISTINCT FROM 'household'::text) OR (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.workspace_id = comments.workspace_id) AND (w.id = comments.work_order_id) AND (w.created_by = app_user_id()))))));
ALTER POLICY "household_own" ON public.work_order_events USING (((CURRENT_USER = 'gw_owner'::name) OR (my_client_kind(workspace_id) IS DISTINCT FROM 'household'::text) OR (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.workspace_id = work_order_events.workspace_id) AND (w.id = work_order_events.work_order_id) AND (w.created_by = app_user_id()))))));
ALTER POLICY "household_own" ON public.job_photos USING (((CURRENT_USER = 'gw_owner'::name) OR (my_client_kind(workspace_id) IS DISTINCT FROM 'household'::text) OR (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.workspace_id = job_photos.workspace_id) AND (w.id = job_photos.work_order_id) AND (w.created_by = app_user_id()))))));
ALTER POLICY "suggestions_read" ON public.job_suggestions USING ((is_staff(workspace_id) OR (is_member(workspace_id) AND (sender_user_id = app_user_id()))));
ALTER POLICY "suggestions_insert" ON public.job_suggestions WITH CHECK (((status = 'pending'::text) AND (work_order_id IS NULL) AND (decided_by IS NULL) AND (decided_at IS NULL) AND (is_staff(workspace_id) OR ((sender_user_id = app_user_id()) AND (((my_role(workspace_id) = 'client'::text) AND (source = ANY (ARRAY['client'::text, 'household'::text, 'agent'::text])) AND (client_id = my_client(workspace_id)) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.workspace_id = job_suggestions.workspace_id) AND (s.id = job_suggestions.site_id) AND (s.client_id = job_suggestions.client_id))))) OR ((my_role(workspace_id) = 'technician'::text) AND (source = ANY (ARRAY['technician'::text, 'agent'::text])) AND my_job_site(workspace_id, site_id)))))));
ALTER POLICY "suggestions_update" ON public.job_suggestions USING ((is_staff(workspace_id) AND (my_staff_kind(workspace_id) IS DISTINCT FROM 'office'::text))) WITH CHECK ((is_staff(workspace_id) AND (my_staff_kind(workspace_id) IS DISTINCT FROM 'office'::text)));
ALTER POLICY "work_orders_insert" ON public.work_orders WITH CHECK ((is_staff(workspace_id) AND ((created_by = app_user_id()) OR (EXISTS ( SELECT 1
   FROM job_suggestions s
  WHERE ((s.workspace_id = work_orders.workspace_id) AND (s.sender_user_id = work_orders.created_by) AND (s.client_id = work_orders.client_id) AND (s.site_id = work_orders.site_id) AND (s.status = 'pending'::text)))))));
ALTER POLICY "shared_photos_update" ON public.shared_photos USING ((is_member(workspace_id) AND (uploaded_by = app_user_id()) AND (suggestion_id IS NULL))) WITH CHECK (((uploaded_by = app_user_id()) AND (EXISTS ( SELECT 1
   FROM job_suggestions s
  WHERE ((s.workspace_id = shared_photos.workspace_id) AND (s.id = shared_photos.suggestion_id) AND ((s.sender_user_id = app_user_id()) OR ((s.source = 'whatsapp'::text) AND is_staff(s.workspace_id) AND (my_staff_kind(s.workspace_id) IS DISTINCT FROM 'office'::text))))))));
ALTER POLICY "shared_photos_read" ON public.shared_photos USING ((is_member(workspace_id) AND (((uploaded_by = app_user_id()) AND (conversation_id IS NULL) AND (work_order_id IS NULL)) OR (EXISTS ( SELECT 1
   FROM job_suggestions s
  WHERE ((s.workspace_id = shared_photos.workspace_id) AND (s.id = shared_photos.suggestion_id)))) OR conversation_reader(workspace_id, conversation_id) OR (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.workspace_id = shared_photos.workspace_id) AND (w.id = shared_photos.work_order_id)))))));
ALTER POLICY "shared_photos_insert" ON public.shared_photos WITH CHECK ((is_member(workspace_id) AND (uploaded_by = app_user_id()) AND (suggestion_id IS NULL) AND (conversation_id IS NULL) AND (work_order_id IS NULL)));
ALTER POLICY "conversations_read" ON public.conversations USING ((((kind = 'team'::text) AND (my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text, 'technician'::text]))) OR ((kind = 'direct'::text) AND (app_user_id() = ANY (participants)) AND can_message_person(workspace_id,
CASE
    WHEN (participants[1] = app_user_id()) THEN participants[2]
    ELSE participants[1]
END))));
ALTER POLICY "conversations_insert" ON public.conversations WITH CHECK ((((kind = 'team'::text) AND (my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text, 'technician'::text]))) OR ((kind = 'direct'::text) AND (app_user_id() = ANY (participants)) AND can_message_person(workspace_id,
CASE
    WHEN (participants[1] = app_user_id()) THEN participants[2]
    ELSE participants[1]
END))));
ALTER POLICY "messages_team_moderation" ON public.messages USING (((my_role(workspace_id) = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.workspace_id = messages.workspace_id) AND (c.id = messages.conversation_id) AND (c.kind = 'team'::text)))))) WITH CHECK (((my_role(workspace_id) = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.workspace_id = messages.workspace_id) AND (c.id = messages.conversation_id) AND (c.kind = 'team'::text))))));
ALTER POLICY "personal_learning_owner" ON public.personal_agent_learning USING (((user_id = app_user_id()) AND is_member(workspace_id))) WITH CHECK (((user_id = app_user_id()) AND is_member(workspace_id)));
ALTER POLICY "company_rules_read" ON public.company_rules USING ((my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text, 'technician'::text])));
ALTER POLICY "company_rules_admin" ON public.company_rules WITH CHECK (((my_role(workspace_id) = 'admin'::text) AND (created_by = app_user_id())));
ALTER POLICY "company_rules_change" ON public.company_rules USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "company_rules_remove" ON public.company_rules USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "company_approvals_admin" ON public.company_action_approvals USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "agent_actions_private" ON public.assistant_actions USING (((CURRENT_USER = 'gw_owner'::name) OR ((user_id = app_user_id()) AND is_member(workspace_id)))) WITH CHECK (((CURRENT_USER = 'gw_owner'::name) OR ((user_id = app_user_id()) AND is_member(workspace_id))));
ALTER POLICY "contact_names_own" ON public.contact_nicknames USING ((owner_user_id = app_user_id())) WITH CHECK (((owner_user_id = app_user_id()) AND is_member(workspace_id) AND (EXISTS ( SELECT 1
   FROM contact_people(contact_nicknames.workspace_id) p(user_id, real_name, role, staff_kind, client_kind)
  WHERE (p.user_id = contact_nicknames.target_user_id)))));
ALTER POLICY "money_admin" ON public.workspace_money USING ((my_role(workspace_id) = 'admin'::text)) WITH CHECK (((my_role(workspace_id) = 'admin'::text) AND (created_by = app_user_id())));
ALTER POLICY "job_ratings_read" ON public.job_ratings USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)))));
ALTER POLICY "job_ratings_insert" ON public.job_ratings WITH CHECK (((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)) AND (rated_by = app_user_id()) AND (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.id = job_ratings.work_order_id) AND (w.workspace_id = job_ratings.workspace_id) AND (w.client_id = job_ratings.client_id) AND (w.status = 'done'::work_order_status))))));
ALTER POLICY "job_prechecks_read" ON public.job_prechecks USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id))) OR ((my_role(workspace_id) = 'technician'::text) AND (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.id = job_prechecks.work_order_id) AND (w.assignee_id = app_user_id())))))));
ALTER POLICY "job_prechecks_write" ON public.job_prechecks WITH CHECK (((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)) AND (answered_by = app_user_id()) AND (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.id = job_prechecks.work_order_id) AND (w.workspace_id = job_prechecks.workspace_id) AND (w.client_id = job_prechecks.client_id) AND (w.status = ANY (ARRAY['open'::work_order_status, 'scheduled'::work_order_status])))))));
ALTER POLICY "job_prechecks_update" ON public.job_prechecks USING (((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)))) WITH CHECK (((my_role(workspace_id) = 'client'::text) AND (client_id = my_client(workspace_id)) AND (answered_by = app_user_id())));
ALTER POLICY "agent_questions_read" ON public.agent_questions USING ((is_staff(workspace_id) OR (asked_by = app_user_id())));
ALTER POLICY "agent_questions_insert" ON public.agent_questions WITH CHECK (((asked_by = app_user_id()) AND (my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text, 'technician'::text])) AND (status = 'open'::text)));
ALTER POLICY "agent_questions_decide" ON public.agent_questions USING (((my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text])) AND (COALESCE(my_staff_kind(workspace_id), ''::text) <> 'office'::text))) WITH CHECK ((decided_by = app_user_id()));
ALTER POLICY "assets_read" ON public.assets USING ((is_staff(workspace_id) OR ((my_role(workspace_id) = 'client'::text) AND (my_client_kind(workspace_id) = 'manager'::text) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.workspace_id = assets.workspace_id) AND (s.id = assets.site_id) AND (s.client_id = my_client(assets.workspace_id)))))) OR ((my_role(workspace_id) = 'technician'::text) AND (EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.workspace_id = assets.workspace_id) AND (w.asset_id = assets.id) AND (w.assignee_id = app_user_id())))))));
ALTER POLICY "assets_insert" ON public.assets WITH CHECK (((my_role(workspace_id) = 'admin'::text) OR ((my_role(workspace_id) = 'staff'::text) AND (my_staff_kind(workspace_id) IS DISTINCT FROM 'office'::text))));
ALTER POLICY "assets_update" ON public.assets USING (((my_role(workspace_id) = 'admin'::text) OR ((my_role(workspace_id) = 'staff'::text) AND (my_staff_kind(workspace_id) IS DISTINCT FROM 'office'::text)))) WITH CHECK (((my_role(workspace_id) = 'admin'::text) OR ((my_role(workspace_id) = 'staff'::text) AND (my_staff_kind(workspace_id) IS DISTINCT FROM 'office'::text))));
ALTER POLICY "words_personal_read" ON public.agent_words USING (((user_id = app_user_id()) AND is_member(workspace_id)));
ALTER POLICY "words_personal_add" ON public.agent_words WITH CHECK (((user_id = app_user_id()) AND is_member(workspace_id) AND (created_by = app_user_id())));
ALTER POLICY "words_personal_change" ON public.agent_words USING (((user_id = app_user_id()) AND is_member(workspace_id))) WITH CHECK (((user_id = app_user_id()) AND is_member(workspace_id) AND (created_by = app_user_id())));
ALTER POLICY "words_personal_remove" ON public.agent_words USING (((user_id = app_user_id()) AND is_member(workspace_id)));
ALTER POLICY "words_company_read" ON public.agent_words USING (((user_id IS NULL) AND (my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text, 'technician'::text]))));
ALTER POLICY "words_company_add" ON public.agent_words WITH CHECK (((user_id IS NULL) AND (my_role(workspace_id) = 'admin'::text) AND (created_by = app_user_id())));
ALTER POLICY "words_company_change" ON public.agent_words USING (((user_id IS NULL) AND (my_role(workspace_id) = 'admin'::text))) WITH CHECK (((user_id IS NULL) AND (my_role(workspace_id) = 'admin'::text) AND (created_by = app_user_id())));
ALTER POLICY "words_company_remove" ON public.agent_words USING (((user_id IS NULL) AND (my_role(workspace_id) = 'admin'::text)));
ALTER POLICY "join_requests_read" ON public.join_requests USING (((user_id = app_user_id()) OR (my_role(workspace_id) = 'admin'::text) OR ((my_role(workspace_id) = 'staff'::text) AND (my_staff_kind(workspace_id) = 'office'::text))));
ALTER POLICY "whatsapp_read" ON public.whatsapp_messages USING ((is_member(workspace_id) AND ((user_id = app_user_id()) OR ((my_role(workspace_id) = ANY (ARRAY['admin'::text, 'staff'::text])) AND (my_staff_kind(workspace_id) IS DISTINCT FROM 'office'::text)))));
ALTER POLICY "draft_read" ON public.draft_invoices USING ((my_role(workspace_id) = 'admin'::text));
ALTER POLICY "lesson_read" ON public.lesson_proposals USING ((is_member(workspace_id) AND ((proposed_by = app_user_id()) OR (my_role(workspace_id) = 'admin'::text))));
ALTER POLICY "lesson_propose" ON public.lesson_proposals WITH CHECK ((is_member(workspace_id) AND (proposed_by = app_user_id()) AND (status = 'waiting'::text) AND (decided_by IS NULL)));
DROP FUNCTION IF EXISTS public.app_memberships();
