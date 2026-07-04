-- Prevent recursive profiles RLS evaluation when resolving the current user's
-- organization and application role. These helpers accept no caller input and
-- return only authorization attributes for auth.uid().

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id
  FROM public.profiles
  WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.user_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, service_role;
