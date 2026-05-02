-- Backfill missing canonical room type prices from existing inventory prices.
--
-- Room pricing now reads room_types.base_price_per_night as the source of
-- truth. Some active room types were imported with prices only on
-- room_inventory rows, so copy the newest non-null inventory price onto the
-- room type before quote/reservation flows depend on it.

WITH ranked_inventory_prices AS (
  SELECT
    ri.room_type_id,
    ri.price_per_night,
    ri.currency,
    row_number() OVER (
      PARTITION BY ri.room_type_id
      ORDER BY ri.date DESC, ri.id ASC
    ) AS price_rank
  FROM public.room_inventory ri
  WHERE ri.price_per_night IS NOT NULL
),
selected_inventory_prices AS (
  SELECT
    room_type_id,
    price_per_night,
    currency
  FROM ranked_inventory_prices
  WHERE price_rank = 1
)
UPDATE public.room_types rt
SET
  base_price_per_night = sip.price_per_night,
  currency = coalesce(nullif(btrim(rt.currency), ''), nullif(btrim(sip.currency), ''), 'USD'),
  updated_at = now()
FROM selected_inventory_prices sip
WHERE rt.id = sip.room_type_id
  AND rt.is_active = true
  AND rt.base_price_per_night IS NULL
  AND sip.price_per_night IS NOT NULL;