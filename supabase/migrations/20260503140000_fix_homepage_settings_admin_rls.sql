-- Replace admin write policies that depended on editable Supabase Auth
-- metadata with trusted database membership checks.

CREATE OR REPLACE FUNCTION public.user_is_agency_admin(target_agency_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  is_global_admin boolean := false;
  is_agency_admin boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = $1)'
      INTO is_global_admin
      USING current_user_id;

    IF is_global_admin THEN
      RETURN true;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = current_user_id
      AND au.agency_id = target_agency_id
      AND au.role IN ('owner', 'admin')
  )
  INTO is_agency_admin;

  RETURN is_agency_admin;
END;
$$;

REVOKE ALL ON FUNCTION public.user_is_agency_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_agency_admin(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.user_is_agency_admin(uuid) TO service_role;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.user_is_agency_admin(uuid) IS
  'Trusted admin check for agency-scoped content. Uses admin_users and agency_users role data, never editable Auth metadata.';

ALTER TABLE public.home_page_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage homepage" ON public.home_page_content;
CREATE POLICY "Admins manage homepage"
  ON public.home_page_content
  FOR ALL
  TO authenticated
  USING (public.user_is_agency_admin(home_page_content.agency_id))
  WITH CHECK (public.user_is_agency_admin(home_page_content.agency_id));

COMMENT ON POLICY "Admins manage homepage" ON public.home_page_content IS
  'Allows trusted global admins or owning agency owners/admins to manage homepage content without relying on editable Auth metadata.';

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage settings" ON public.settings;
CREATE POLICY "Admins manage settings"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (public.user_is_agency_admin(settings.agency_id))
  WITH CHECK (public.user_is_agency_admin(settings.agency_id));

COMMENT ON POLICY "Admins manage settings" ON public.settings IS
  'Allows trusted global admins or owning agency owners/admins to manage settings without relying on editable Auth metadata.';