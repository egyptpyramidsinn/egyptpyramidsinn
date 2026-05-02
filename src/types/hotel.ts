export type Hotel = {
  id: string;
  agencyId: string;
  slug: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  timezone?: string | null;
  starRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  policies: Record<string, unknown>;
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoomType = {
  id: string;
  hotelId: string;
  slug: string;
  name: string;
  description?: string | null;
  maxAdults: number;
  maxChildren: number;
  beds: Record<string, unknown>;
  amenities: string[];
  services: string[];
  highlights: string[];
  sizeSqm?: number | null;
  view?: string | null;
  bathrooms?: number | null;
  floor?: number | null;
  basePricePerNight?: number | null;
  currency?: string | null;
  defaultUnits?: number | null;
  smokingAllowed: boolean;
  refundable: boolean;
  breakfastIncluded: boolean;
  petsAllowed: boolean;
  extraBedAllowed: boolean;
  extraBedFee?: number | null;
  cancellationPolicy?: string | null;
  accessibility: Record<string, unknown>;
  images: string[];
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoomInventory = {
  id: string;
  roomTypeId: string;
  date: string;
  availableUnits: number;
  pricePerNight: number;
  currency?: string | null;
  minNights?: number | null;
  stopSell: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoomAddon = {
  id: string;
  roomTypeId: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RoomCartAddon = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  currency: string;
};

export type RoomCartItem = {
  productType: 'room';
  /** Stable per-line id, generated at insert time. Used by update/remove helpers. */
  lineId: string;
  /** Minimal `product` shape so universal cart accessors (e.g. `item.product.id`) keep working. */
  product: { id: string; name: string };
  roomTypeId: string;
  hotelId: string;
  /** Agency that owns this room. Captured at add-to-cart time so server-side
   * cart-hold helpers can scope the row without an extra hotel lookup. */
  agencyId?: string;
  roomSlug: string;
  name: string;
  image?: string | null;
  /** ISO date `YYYY-MM-DD`. Inclusive. */
  checkInDate: string;
  /** ISO date `YYYY-MM-DD`. Exclusive (the morning of checkout). */
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;
  unitsBooked: number;
  currency: string;
  basePricePerNight: number;
  /** Average nightly base rate before stay-length tier discounts. */
  pricePerNightAvg: number;
  /** Final room stay subtotal after stay-length tier discounts plus addon totals. */
  subtotal: number;
  addons: RoomCartAddon[];
  /** Optional stay-length tier metadata captured at quote time. Persisted
   * into `hotel_bookings.addons` jsonb under a reserved sentinel entry. */
  tier?: {
    id: string;
    minNights: number;
    discountPercent: number;
    /** Currency amount discounted by the tier (always >= 0). */
    amount: number;
  };
  /** Per-stay subtotal BEFORE the stay-length tier discount, captured at
   * add-to-cart time. Used by the cart UI to render strike-through pricing. */
  subtotalBeforeTier?: number;
  /** ISO timestamp when this line's best-effort cart hold expires. Refreshed
   * on cart load and on add. Absent when the hold could not be placed. */
  holdExpiresAt?: string;
  /** Stable client session id that owns this line's cart hold. Used so the
   * user's own quote re-runs do not block their own selection. */
  holdSessionId?: string;
  /** Always undefined for room items. Present so universal cart accessors
   * (e.g. `item.packageId ?? null`) compile across the union without forcing
   * every caller to first narrow on `productType`. */
  packageId?: undefined;
  packageName?: undefined;
  date?: undefined;
  quantity?: undefined;
};

export type RoomPriceQuoteNight = {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** Effective price for this night (per unit). */
  price: number;
  /** False when stop_sell or available_units < requested units. */
  available: boolean;
  /** From inventory row, when present. */
  minNights: number | null;
  /** From inventory row, when present. */
  availableUnits: number | null;
  /** Legacy compatibility flag; base-price-only quotes always return false. */
  usedInventoryOverride: boolean;
};

export type RoomPricingTierSummary = {
  id: string;
  minNights: number;
  discountPercent: number;
};

export type RoomPricingTier = RoomPricingTierSummary & {
  agencyId: string;
  hotelId: string | null;
  roomTypeId: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type RoomPriceQuote = {
  roomTypeId: string;
  hotelId: string;
  roomSlug: string;
  name: string;
  currency: string;
  /** Echoed input. */
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  units: number;
  nights: number;
  basePricePerNight: number;
  pricePerNightAvg: number;
  /** Per-unit subtotal: sum of nightly prices over the stay × units, BEFORE
   * any stay-length tier discount and BEFORE addons. */
  subtotalBeforeTier: number;
  /** Currency amount subtracted from the per-night portion by the active
   * stay-length tier (0 when no tier matched). */
  tierDiscountAmount: number;
  /** Active tier applied to this quote, if any. */
  tier: RoomPricingTierSummary | null;
  /** Final per-stay subtotal (post-tier, addons NOT included). */
  subtotal: number;
  perNightBreakdown: RoomPriceQuoteNight[];
  isAvailable: boolean;
  unavailableDates: string[];
  minNightsViolations: Array<{ date: string; minNights: number }>;
};

export type RoomAvailabilityNightStatus =
  | 'available'
  | 'low'
  | 'sold_out'
  | 'stop_sell'
  | 'unknown';

export type RoomAvailabilityNight = {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  status: RoomAvailabilityNightStatus;
  availableUnits: number | null;
  pricePerNight: number | null;
  currency: string | null;
  minNights: number | null;
};

export type RoomAvailabilityRange = {
  /** Per-night rows from `from` (inclusive) to `to` (exclusive). */
  nights: RoomAvailabilityNight[];
  roomDefaults: {
    basePricePerNight: number | null;
    currency: string;
    defaultUnits: number | null;
    maxAdults: number;
    maxChildren: number;
    isActive: boolean;
  };
  from: string;
  to: string;
};

export type RoomPricingErrorCode =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'INVALID_INPUT'
  | 'OVER_CAPACITY'
  | 'RANGE_TOO_LARGE';

export class RoomPricingError extends Error {
  readonly code: RoomPricingErrorCode;
  constructor(code: RoomPricingErrorCode, message: string) {
    super(message);
    this.name = 'RoomPricingError';
    this.code = code;
  }
}

export type HotelBookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

export type HotelBooking = {
  id: string;
  agencyId: string;
  hotelId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  units: number;
  guestsAdults: number;
  guestsChildren: number;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  status: HotelBookingStatus;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  subtotal: number;
  tax: number;
  fees: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminHotelBooking = HotelBooking & {
  hotelName: string | null;
  hotelSlug: string | null;
  roomTypeName: string | null;
  roomTypeSlug: string | null;
};

export type HotelDashboardOperationsSummary = {
  totalBookings: number;
  activeBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  paidBookings: number;
  cancelledBookings: number;
  upcomingCheckIns: number;
  revenueTotal: number;
};
