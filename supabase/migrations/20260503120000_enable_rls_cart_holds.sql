-- Enable RLS on cart_holds for databases where
-- 20260503100000_create_cart_holds.sql was already applied before RLS was
-- required. Direct anon/authenticated access remains service-role-only; the
-- following policy migration makes the deny-all posture explicit for Supabase
-- Advisor.

ALTER TABLE public.cart_holds ENABLE ROW LEVEL SECURITY;