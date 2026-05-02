-- Stay-length pricing tiers (Batch D / A).
--
-- A rule applies to a stay whose night count is >= min_nights. Rules can be
-- scoped at three levels of specificity:
--   * room_type_id (most specific)
--   * hotel_id
--   * agency_id only (least specific, applies to all hotels in the agency)
--
-- Selection logic (server-side helper): the most-specific active rule with
-- min_nights <= nights and the highest min_nights wins.
--
-- The application code in src/lib/supabase/room-pricing-rules.ts gracefully
-- degrades (returns null / []) on PG_UNDEFINED_TABLE so deployments that
-- have not yet applied this migration continue to function with no tier
-- discount.

CREATE TABLE IF NOT EXISTS public.room_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  hotel_id uuid NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id uuid NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  min_nights integer NOT NULL CHECK (min_nights >= 2),
  discount_percent numeric(5, 2) NOT NULL CHECK (discount_percent > 0 AND discount_percent < 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_pricing_rules_lookup
  ON public.room_pricing_rules (agency_id, hotel_id, room_type_id, min_nights DESC);

CREATE OR REPLACE FUNCTION public.set_room_pricing_rules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_pricing_rules_updated_at ON public.room_pricing_rules;
CREATE TRIGGER trg_room_pricing_rules_updated_at
  BEFORE UPDATE ON public.room_pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_room_pricing_rules_updated_at();

ALTER TABLE public.room_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_pricing_rules_public_select" ON public.room_pricing_rules;
CREATE POLICY "room_pricing_rules_public_select"
  ON public.room_pricing_rules
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "room_pricing_rules_agency_all" ON public.room_pricing_rules;
CREATE POLICY "room_pricing_rules_agency_all"
  ON public.room_pricing_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.agency_id = room_pricing_rules.agency_id
        AND au.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.agency_id = room_pricing_rules.agency_id
        AND au.user_id = auth.uid()
    )
  );
