-- Room inventory reservation primitives.
--
-- The app stores room prices in the base currency expected by useCurrency
-- (USD) and uses room_types.default_units as the fallback capacity whenever
-- a date has no explicit room_inventory row yet.

ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS default_units integer;

UPDATE public.room_types
SET default_units = 1
WHERE default_units IS NULL OR default_units < 1;

ALTER TABLE public.room_types
  ALTER COLUMN default_units SET DEFAULT 1,
  ALTER COLUMN default_units SET NOT NULL;

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_default_units_positive;

ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_default_units_positive CHECK (default_units >= 1);

DO $$
DECLARE
  egp_per_usd constant numeric := 47.5;
BEGIN
  UPDATE public.room_types
  SET
    base_price_per_night = round(base_price_per_night::numeric / egp_per_usd, 2),
    currency = 'USD'
  WHERE upper(coalesce(currency, '')) = 'EGP'
    AND base_price_per_night IS NOT NULL;

  UPDATE public.room_inventory
  SET
    price_per_night = round(price_per_night::numeric / egp_per_usd, 2),
    currency = 'USD'
  WHERE upper(coalesce(currency, '')) = 'EGP'
    AND price_per_night IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_room_inventory(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_date_to_reserve date;
  room_default_units integer;
  room_base_price numeric;
  room_currency text;
  inventory_id uuid;
  inventory_available_units integer;
  inventory_stop_sell boolean;
BEGIN
  IF p_room_type_id IS NULL THEN
    RAISE EXCEPTION 'room_type_id is required.' USING ERRCODE = '22023';
  END IF;

  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in.' USING ERRCODE = '22023';
  END IF;

  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'units must be >= 1.' USING ERRCODE = '22023';
  END IF;

  SELECT default_units, base_price_per_night, currency
  INTO room_default_units, room_base_price, room_currency
  FROM public.room_types
  WHERE id = p_room_type_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room type % was not found.', p_room_type_id USING ERRCODE = 'P0002';
  END IF;

  room_default_units := greatest(coalesce(room_default_units, 1), 1);
  room_currency := coalesce(nullif(btrim(room_currency), ''), 'USD');
  current_date_to_reserve := p_check_in;

  WHILE current_date_to_reserve < p_check_out LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext(p_room_type_id::text),
      hashtext(current_date_to_reserve::text)
    );

    SELECT id, available_units, stop_sell
    INTO inventory_id, inventory_available_units, inventory_stop_sell
    FROM public.room_inventory
    WHERE room_type_id = p_room_type_id
      AND date = current_date_to_reserve
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.room_inventory (
        room_type_id,
        date,
        available_units,
        price_per_night,
        currency,
        stop_sell
      )
      VALUES (
        p_room_type_id,
        current_date_to_reserve,
        room_default_units,
        coalesce(room_base_price, 0),
        room_currency,
        false
      )
      RETURNING id, available_units, stop_sell
      INTO inventory_id, inventory_available_units, inventory_stop_sell;
    END IF;

    IF coalesce(inventory_stop_sell, false) THEN
      RAISE EXCEPTION 'Room type % is stop-sell on %.', p_room_type_id, current_date_to_reserve
        USING ERRCODE = 'P0001';
    END IF;

    IF coalesce(inventory_available_units, 0) < p_units THEN
      RAISE EXCEPTION 'Insufficient room inventory for room type % on %: requested %, available %.',
        p_room_type_id,
        current_date_to_reserve,
        p_units,
        coalesce(inventory_available_units, 0)
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.room_inventory
    SET
      available_units = inventory_available_units - p_units,
      updated_at = now()
    WHERE id = inventory_id;

    current_date_to_reserve := current_date_to_reserve + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_room_inventory(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_date_to_release date;
  room_default_units integer;
  room_base_price numeric;
  room_currency text;
  inventory_id uuid;
  inventory_available_units integer;
BEGIN
  IF p_room_type_id IS NULL THEN
    RAISE EXCEPTION 'room_type_id is required.' USING ERRCODE = '22023';
  END IF;

  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in.' USING ERRCODE = '22023';
  END IF;

  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'units must be >= 1.' USING ERRCODE = '22023';
  END IF;

  SELECT default_units, base_price_per_night, currency
  INTO room_default_units, room_base_price, room_currency
  FROM public.room_types
  WHERE id = p_room_type_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room type % was not found.', p_room_type_id USING ERRCODE = 'P0002';
  END IF;

  room_default_units := greatest(coalesce(room_default_units, 1), 1);
  room_currency := coalesce(nullif(btrim(room_currency), ''), 'USD');
  current_date_to_release := p_check_in;

  WHILE current_date_to_release < p_check_out LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext(p_room_type_id::text),
      hashtext(current_date_to_release::text)
    );

    SELECT id, available_units
    INTO inventory_id, inventory_available_units
    FROM public.room_inventory
    WHERE room_type_id = p_room_type_id
      AND date = current_date_to_release
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.room_inventory
      SET
        available_units = greatest(coalesce(inventory_available_units, 0), 0) + p_units,
        updated_at = now()
      WHERE id = inventory_id;
    ELSE
      INSERT INTO public.room_inventory (
        room_type_id,
        date,
        available_units,
        price_per_night,
        currency,
        stop_sell
      )
      VALUES (
        p_room_type_id,
        current_date_to_release,
        room_default_units,
        coalesce(room_base_price, 0),
        room_currency,
        false
      );
    END IF;

    current_date_to_release := current_date_to_release + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_room_inventory(uuid, date, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_room_inventory(uuid, date, date, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.reserve_room_inventory(uuid, date, date, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.release_room_inventory(uuid, date, date, integer) TO service_role;
  END IF;
END $$;