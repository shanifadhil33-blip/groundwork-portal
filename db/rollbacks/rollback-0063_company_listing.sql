DROP FUNCTION IF EXISTS read_company_replies(),my_company_requests(),edit_household_address(uuid,uuid,text),decide_company_join(uuid,uuid,text),request_company_join(uuid,text,text,text,text,text);
CREATE OR REPLACE FUNCTION onboarding_find_company(search text) RETURNS TABLE(name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT name FROM public.workspaces WHERE NOT is_demo AND public.app_user_id() IS NOT NULL AND length(trim(search))>=3 AND name ILIKE '%'||search||'%' ORDER BY name LIMIT 10
$$;
DROP FUNCTION IF EXISTS search_listed_companies(text);
DROP TABLE IF EXISTS join_requests;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS demo_not_listed, DROP COLUMN IF EXISTS listed, DROP COLUMN IF EXISTS listing_area;
