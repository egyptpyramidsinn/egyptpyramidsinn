/**
 * Routing helpers for hotel-related links.
 *
 * In single-hotel mode the agency website represents one hotel, so we collapse
 * deep `/hotels/[slug]` URLs into a flat `/hotel` (and `/rooms/[slug]`) layout.
 * In multi-hotel mode the canonical `/hotels` and `/hotels/[slug]` URLs are
 * preserved, and rooms live under `/hotels/[hotelSlug]/rooms/[roomSlug]`.
 */

export type HotelLinkContext =
  | {
      singleHotelMode?: boolean | null;
    }
  | null
  | undefined;

function isSingle(ctx: HotelLinkContext): boolean {
  return Boolean(ctx?.singleHotelMode);
}

/** Hub link: hotels listing in multi-hotel mode, the single hotel page otherwise. */
export function getHotelHubHref(ctx: HotelLinkContext): string {
  return isSingle(ctx) ? '/hotel' : '/hotels';
}

/** Detail link for a specific hotel; collapses to `/hotel` in single-hotel mode. */
export function getHotelDetailHref(ctx: HotelLinkContext, hotelSlug: string): string {
  return isSingle(ctx) ? '/hotel' : `/hotels/${hotelSlug}`;
}

/** Detail link for a specific room. */
export function getRoomDetailHref(
  ctx: HotelLinkContext,
  hotelSlug: string,
  roomSlug: string
): string {
  return isSingle(ctx) ? `/rooms/${roomSlug}` : `/hotels/${hotelSlug}/rooms/${roomSlug}`;
}
