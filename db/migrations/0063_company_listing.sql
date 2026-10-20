-- HOME02: companies choose whether people can find them.
ALTER TABLE workspaces ADD COLUMN listed boolean NOT NULL DEFAULT false,
 ADD COLUMN listing_area text CHECK(length(listing_area)<=120),
 ADD CONSTRAINT demo_not_listed CHECK(NOT is_demo OR NOT listed);
CREATE TABLE join_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('household','manager','office')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 phone text NOT NULL CHECK(length(phone) BETWEEN 1 AND 40),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=2000),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=300),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
 decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
 client_id uuid, reply_read_at timestamptz,
 FOREIGN KEY(workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE CASCADE,
 CHECK(kind<>'household' OR length(btrim(address))>0)
);
CREATE UNIQUE INDEX join_requests_one_pending ON join_requests(user_id,workspace_id) WHERE status='pending';
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY join_requests_read ON join_requests FOR SELECT USING(user_id=app_user_id() OR my_role(workspace_id)='admin' OR (my_role(workspace_id)='staff' AND my_staff_kind(workspace_id)='office'));
-- Writes go through narrow functions so requesters cannot decide their own requests.
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON join_requests TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE TRIGGER audit_join_requests AFTER INSERT OR UPDATE OF status OR DELETE ON join_requests FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE FUNCTION search_listed_companies(q text) RETURNS TABLE(id uuid,name text,listing_area text,trades text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.require_real_user();
 RETURN QUERY SELECT w.id,w.name,w.listing_area,w.trades FROM public.workspaces w
 WHERE public.app_user_id() IS NOT NULL AND w.listed AND NOT w.is_demo AND length(btrim(q))>=2
 AND (strpos(lower(w.name),lower(btrim(q)))>0 OR strpos(lower(w.listing_area),lower(btrim(q)))>0)
 ORDER BY w.name,w.id LIMIT 10;
END $$;
-- Close the older discovery path too: it must respect company consent.
CREATE OR REPLACE FUNCTION onboarding_find_company(search text) RETURNS TABLE(name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT c.name FROM public.search_listed_companies(search) c $$;
CREATE FUNCTION request_company_join(ws uuid,p_kind text,p_name text,p_phone text,p_address text,p_note text) RETURNS public.join_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.join_requests;
BEGIN
 PERFORM public.require_real_user();
 PERFORM 1 FROM public.workspaces WHERE id=ws AND listed AND NOT is_demo FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company is not available.' USING ERRCODE='P0404'; END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id()) THEN RAISE EXCEPTION 'You already belong to this company.' USING ERRCODE='P0409'; END IF;
 INSERT INTO public.join_requests(workspace_id,user_id,kind,name,phone,address,note)
 VALUES(ws,public.app_user_id(),p_kind,btrim(p_name),btrim(p_phone),btrim(p_address),btrim(p_note)) RETURNING * INTO r;
 RETURN r;
END $$;
CREATE FUNCTION decide_company_join(ws uuid,rid uuid,decision text) RETURNS public.join_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.join_requests; cid uuid;
BEGIN
 PERFORM public.require_real_user();
 -- Same lock order as invite acceptance and workspace removal.
 PERFORM 1 FROM public.workspaces WHERE id=ws FOR UPDATE;
 IF NOT coalesce(public.my_role(ws)='admin' OR (public.my_role(ws)='staff' AND public.my_staff_kind(ws)='office'),false) THEN RAISE EXCEPTION 'No access.' USING ERRCODE='P0403'; END IF;
 IF decision NOT IN ('accepted','declined') OR decision IS NULL THEN RAISE EXCEPTION 'Choose a decision.' USING ERRCODE='P0409'; END IF;
 SELECT * INTO r FROM public.join_requests WHERE id=rid AND workspace_id=ws FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.' USING ERRCODE='P0404'; END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'This request has already been answered.' USING ERRCODE='P0409'; END IF;
 IF decision='accepted' THEN
  IF EXISTS(SELECT 1 FROM public.members WHERE workspace_id=ws AND user_id=r.user_id) THEN RAISE EXCEPTION 'This person already belongs to the company.' USING ERRCODE='P0409'; END IF;
  INSERT INTO public.clients(workspace_id,name,contact_name,phone) VALUES(ws,r.name,r.name,r.phone) RETURNING id INTO cid;
  INSERT INTO public.sites(workspace_id,client_id,name,address,contact_name,contact_phone) VALUES(ws,cid,r.name,r.address,r.name,r.phone);
  INSERT INTO public.members(workspace_id,user_id,role,client_id,client_kind) VALUES(ws,r.user_id,'client',cid,r.kind);
  INSERT INTO public.notifications(workspace_id,user_id,kind,entity,entity_id) VALUES(ws,r.user_id,'company_join_accepted','join_requests',rid);
 END IF;
 -- A declined requester has no membership. His reply lives on his own request,
 -- rather than creating a membership just to satisfy notifications' membership key.
 UPDATE public.join_requests SET status=decision,client_id=cid,decided_at=clock_timestamp(),decided_by=public.app_user_id() WHERE id=rid RETURNING * INTO r;
 RETURN r;
END $$;
CREATE FUNCTION edit_household_address(ws uuid,sid uuid,new_address text) RETURNS public.sites
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sites;
BEGIN
 PERFORM public.require_real_user();
 PERFORM 1 FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id() AND archived_at IS NULL AND role='client' AND client_kind='household' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No access.' USING ERRCODE='P0403'; END IF;
 IF length(btrim(new_address)) NOT BETWEEN 1 AND 2000 OR new_address IS NULL THEN RAISE EXCEPTION 'Enter your home address.' USING ERRCODE='P0409'; END IF;
 UPDATE public.sites SET address=btrim(new_address) WHERE workspace_id=ws AND id=sid AND client_id=public.my_client(ws) AND archived_at IS NULL RETURNING * INTO s;
 IF NOT FOUND THEN RAISE EXCEPTION 'No access.' USING ERRCODE='P0403'; END IF;
 RETURN s;
END $$;
CREATE FUNCTION my_company_requests() RETURNS TABLE(id uuid,workspace_id uuid,company_name text,status text,created_at timestamptz,decided_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.require_real_user();
 RETURN QUERY SELECT r.id,r.workspace_id,w.name,r.status,r.created_at,r.decided_at FROM public.join_requests r JOIN public.workspaces w ON w.id=r.workspace_id WHERE r.user_id=public.app_user_id() ORDER BY r.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION search_listed_companies(text),request_company_join(uuid,text,text,text,text,text),decide_company_join(uuid,uuid,text),edit_household_address(uuid,uuid,text),my_company_requests() FROM PUBLIC;
CREATE FUNCTION read_company_replies() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.require_real_user();
 UPDATE public.join_requests SET reply_read_at=clock_timestamp() WHERE user_id=public.app_user_id() AND status<>'pending' AND reply_read_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION read_company_replies() FROM PUBLIC;
