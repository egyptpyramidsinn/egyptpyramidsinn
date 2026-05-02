-- UNAPPLIED — extends `hotel_bookings` to capture full room cart fidelity
-- (addons, nightly breakdown, currency, parent booking link, idempotency
-- key) and link rows back to the parent `bookings` row created from a
-- mixed cart checkout.
--
-- This migration is forward-compatible with existing data; all new columns
-- are nullable / have safe defaults. The application code (createBooking →
-- persistRoomBookings) inserts with the extended payload first and falls
-- back to the base column set on Postgres 42703 (undefined column),
-- so deployments that have not yet applied this migration continue to
-- function with a degraded (no addons, no idempotency) persistence.

ALTER TABLE public.hotel_bookings
  ADD COLUMN IF NOT EXISTS bookings_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nights integer,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS base_price_per_night numeric,
  ADD COLUMN IF NOT EXISTS price_per_night_avg numeric,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_bookings_idempotency_key_uidx
  ON public.hotel_bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS hotel_bookings_bookings_id_idx
  ON public.hotel_bookings (bookings_id);
