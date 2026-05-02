-- Cart holds (Batch D / C). Best-effort, short-lived inventory holds taken
-- when a customer places a room item into their cart. Used by the pricing
-- helper to subtract held units from `room_inventory.available_units` so two
-- concurrent carts cannot both quote the last unit at the same price.
--
-- These rows are NOT a security boundary — they are best-effort UX. The
-- authoritative inventory check still happens at booking time inside
-- persistRoomBookings. Holds expire automatically (expires_at) and stale
-- rows are purged opportunistically by the helper module.
--
-- The table stores anon session identifiers and is not meant for direct
-- anon/authenticated access. Application access goes through service-role
-- server helpers. A follow-up migration adds explicit deny-all policies for
-- direct anon/authenticated roles so the service-role-only posture is visible
-- to Supabase Advisor.

CREATE TABLE IF NOT EXISTS public.cart_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  check_in date NOT NULL,
  check_out date NOT NULL,
  units integer NOT NULL CHECK (units >= 1),
  line_id text NOT NULL,
  session_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_holds_dates_chk CHECK (check_out > check_in),
  CONSTRAINT cart_holds_line_id_unique UNIQUE (line_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_holds_room_expiry
  ON public.cart_holds (room_type_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_cart_holds_session
  ON public.cart_holds (session_id);

ALTER TABLE public.cart_holds ENABLE ROW LEVEL SECURITY;
-- Direct anon/authenticated access is denied explicitly by a follow-up policy
-- migration; service-role helpers bypass RLS.
