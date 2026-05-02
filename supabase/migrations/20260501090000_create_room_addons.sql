-- Optional, unapplied: creates a per-room-type addons table that the cart UI
-- can surface alongside a room booking (e.g. airport transfer, breakfast,
-- early check-in fee). The codebase already degrades gracefully when this
-- table is missing (`getRoomAddons` returns []), so applying this migration
-- is safe to defer until product wants to expose addons.
--
-- Filename timestamp follows the existing convention (next slot after
-- 20260428100000_bookings_payment_method_and_idempotency.sql).

CREATE TABLE IF NOT EXISTS public.room_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_addons_room_type
  ON public.room_addons (room_type_id, is_active, sort_order);

-- Maintain updated_at on UPDATE.
CREATE OR REPLACE FUNCTION public.set_room_addons_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_addons_updated_at ON public.room_addons;
CREATE TRIGGER trg_room_addons_updated_at
  BEFORE UPDATE ON public.room_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_room_addons_updated_at();

-- RLS: mirror the read-public / agency-write pattern used by sibling room
-- tables. Public anon clients can read active rows for active room types;
-- mutations are gated to the owning agency via room_types -> hotels.
ALTER TABLE public.room_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_addons_public_select" ON public.room_addons;
CREATE POLICY "room_addons_public_select"
  ON public.room_addons
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_addons.room_type_id
        AND rt.is_active = true
    )
  );

DROP POLICY IF EXISTS "room_addons_agency_all" ON public.room_addons;
CREATE POLICY "room_addons_agency_all"
  ON public.room_addons
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_types rt
      JOIN public.hotels h ON h.id = rt.hotel_id
      JOIN public.agency_users au ON au.agency_id = h.agency_id
      WHERE rt.id = room_addons.room_type_id
        AND au.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.room_types rt
      JOIN public.hotels h ON h.id = rt.hotel_id
      JOIN public.agency_users au ON au.agency_id = h.agency_id
      WHERE rt.id = room_addons.room_type_id
        AND au.user_id = auth.uid()
    )
  );
