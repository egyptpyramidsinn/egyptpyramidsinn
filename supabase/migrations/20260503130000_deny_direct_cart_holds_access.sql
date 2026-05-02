-- Cart holds are service-role-only. Add explicit deny-all RLS policies for
-- anon/authenticated direct Supabase access so RLS intent is visible to
-- Supabase Advisor while service-role server helpers continue to bypass RLS.

ALTER TABLE public.cart_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cart_holds_direct_access_deny_all" ON public.cart_holds;
DROP POLICY IF EXISTS "cart_holds_anon_direct_access_deny_all" ON public.cart_holds;
CREATE POLICY "cart_holds_anon_direct_access_deny_all"
  ON public.cart_holds
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY "cart_holds_anon_direct_access_deny_all" ON public.cart_holds IS
  'Deny direct anon cart_holds access; service-role server helpers bypass RLS.';

DROP POLICY IF EXISTS "cart_holds_authenticated_direct_access_deny_all" ON public.cart_holds;
CREATE POLICY "cart_holds_authenticated_direct_access_deny_all"
  ON public.cart_holds
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY "cart_holds_authenticated_direct_access_deny_all" ON public.cart_holds IS
  'Deny direct authenticated cart_holds access; service-role server helpers bypass RLS.';