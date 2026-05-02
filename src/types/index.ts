export * from './agency';
export * from './hotel';

import type { RoomCartItem } from './hotel';

export type Review = {
  id: string;
  agencyId: string;
  tourId?: string | null;
  hotelId?: string | null;
  customerName: string;
  customerEmail: string;
  rating: number;
  content: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  // Joined relations (from admin queries)
  tours?: { name: string; slug: string } | null;
  hotels?: { name: string; slug: string } | null;
};

export type PriceTier = {
  minPeople: number;
  maxPeople: number | null; // null for 'and up'
  pricePerAdult: number;
  pricePerChild: number;
};

export type TourPackage = {
  id: string;
  name: string; // e.g., "Standard", "Luxury"
  description?: string; // e.g., "Includes entry fees and lunch"
  priceTiers: PriceTier[];
};

export type Tour = {
  id: string;
  slug: string;
  name: string;
  destination: string;
  type: string[];
  duration: number; // in days
  description: string;
  itinerary: { day: number; activity: string }[];
  availability: boolean;
  images: string[];
  rating: number;
  priceTiers: PriceTier[]; // Keeping for backward compatibility or default
  packages?: TourPackage[]; // New field for multi-package support
  price?: never; // Ensure old price field is not used

  // Detailed tour information
  durationText?: string;
  tourType?: string;
  availabilityDescription?: string;
  pickupAndDropoff?: string;
  highlights?: string[];
  includes?: string[];
  excludes?: string[];
  cancellationPolicy?: string;
};

export type UpsellVariant = {
  id?: string;
  name: string;
  price: number;
};

export type UpsellTargeting = {
  match?: 'any' | 'all';
  destinations?: string[];
  tourIds?: string[];
};

export type UpsellItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  variants?: UpsellVariant[];
  targeting?: UpsellTargeting | null;
  type: 'service' | 'tour_addon';
  relatedTourId?: string | null; // uuid
  imageUrl?: string; // New: URL for the upsell item image
  isActive: boolean;
  createdAt: string;
};

export type TourDateAvailability = {
  id: string;
  agencyId: string;
  tourId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  availableSpots: number | null; // null = unlimited
  isBlocked: boolean;
  createdAt: string;
};

export type BookingItem = {
  id: string;
  bookingId: string;
  tourId?: string; // Now optional
  upsellItemId?: string; // New: link to upsell item
  packageId?: string; // New: selected package ID
  packageName?: string; // New: selected package name
  adults: number;
  children: number;
  price: number;
  itemDate?: string;
  tours?: {
    // from the join
    name: string;
    slug: string;
    packages?: TourPackage[];
  };
  upsellItems?: {
    // New: from the join
    name: string;
    price: number;
  };
};

/**
 * Discriminated cart item union. The discriminator is `productType`.
 *
 * Tour and upsell variants preserve the legacy shape exactly; existing
 * callers that branch on `item.productType === 'tour' | 'upsell'` continue
 * to work unchanged.
 *
 * The room variant (`RoomCartItem` from `./hotel`) carries hotel-specific
 * pricing/date data and a stable `lineId` so multiple distinct stays of the
 * same room type can coexist in the cart.
 */
export type TourCartItem = {
  productType: 'tour';
  product: Tour;
  packageId?: string;
  packageName?: string;
  adults?: number;
  children?: number;
  date?: Date;
  quantity?: never;
};

export type UpsellCartItem = {
  productType: 'upsell';
  product: UpsellItem;
  packageId?: string;
  packageName?: string;
  quantity?: number;
  adults?: never;
  children?: never;
  date?: never;
};

export type CartItem = TourCartItem | UpsellCartItem | RoomCartItem;

export type Booking = {
  id: string;
  customerName: string;
  customerEmail: string;
  phoneNumber?: string;
  nationality?: string;
  bookingDate: string; // ISO string format for dates
  totalPrice: number;
  status: 'Confirmed' | 'Pending' | 'Cancelled';
  paymentMethod?: 'cash' | 'online';
  bookingItems: BookingItem[];
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  source: 'Booking' | 'Newsletter' | 'Contact';
  status?: 'active' | 'inactive';
  totalBookings: number;
  totalSpent: number;
  createdAt: string; // ISO string format for dates
  lastActive?: string;
  bookings: Booking[];
  posts?: Post[];
  avatarUrl?: string;
  phone?: string;
  nationality?: string;
};

export type Post = {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  status: 'Published' | 'Draft';
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  featuredImage: string;
  tags: string[];
  isFeatured: boolean;
  views: number;
};

export const browseCategoryIconKeys = [
  'mountain',
  'sailboat',
  'building2',
  'utensils',
  'ferrisWheel',
  'plane',
] as const;

export type BrowseCategoryIconKey = (typeof browseCategoryIconKeys)[number];

export type BrowseCategoryItem = {
  label: string;
  type: string;
  icon: BrowseCategoryIconKey;
};

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  content?: string;
  text?: string;
  avatar: string;
  rating?: number;
};

export type HeroSection = {
  imageUrl?: string;
  imageUrls?: string[];
  imageAlt?: string;
  videoUrl?: string; // H2.1 — looping background video URL
  title: string;
  subtitle: string;
  searchType?: 'tours' | 'hotels';
  bookDirectBadge?: string;
};

export type RoomsSectionContent = {
  title?: string;
  subtitle?: string;
  count?: number;
};

export type Feature = {
  title: string;
  description: string;
};

export type BrowseCategorySection = {
  title: string;
  subtitle: string;
  categories?: BrowseCategoryItem[];
};

export type WhyChooseUsSection = {
  pretitle: string;
  title: string;
  imageUrl?: string;
  imageAlt?: string;
  badgeValue?: string;
  badgeLabel?: string;
  feature1: Feature;
  feature2: Feature;
  feature3: Feature;
};

export type PopularDestinationsSection = {
  pretitle: string;
  title: string;
  count?: number;
};

export type DiscountBanner = {
  title: string;
  description: string;
  imageUrl?: string;
  buttonText?: string;
  buttonLink?: string;
};

export type DiscountBannersSection = {
  banner1: DiscountBanner;
  banner2: DiscountBanner;
};

export type LastMinuteOffersSection = {
  discount: string;
  pretitle: string;
  title: string;
  count?: number;
};

export type VideoSection = {
  pretitle: string;
  title: string;
  backgroundImageUrl?: string;
  button1Text?: string;
  button1Link?: string;
  button2Text?: string;
  button2Link?: string;
};

export type NewsSection = {
  pretitle: string;
  title: string;
  count?: number;
};

export type HotelFeature = {
  icon: string;
  title: string;
  description: string;
};

export type HotelFeaturesSection = {
  title: string;
  subtitle: string;
  features: HotelFeature[];
};

export type FeaturedRoomsSection = {
  title: string;
  subtitle: string;
  roomIds: string[];
};

export type HotelStorySection = {
  title: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  buttonText?: string;
  buttonLink?: string;
};

export type AmenitiesSectionContent = {
  title?: string;
  subtitle?: string;
  items?: string[]; // array of amenity IDs, e.g. ["wifi", "pool", "spa"]
};

export type GallerySectionContent = {
  title?: string;
  subtitle?: string;
  images?: string[];
};

export type WhyBookDirectBenefit = {
  icon?: string; // lucide icon name
  title: string;
  description: string;
};

export type WhyBookDirectSection = {
  title?: string;
  subtitle?: string;
  benefits?: WhyBookDirectBenefit[];
};

export type LocationSectionContent = {
  title?: string;
  subtitle?: string;
  address?: string;
  mapEmbedUrl?: string;
  directionsUrl?: string;
};

export type SocialSectionContent = {
  title?: string;
  subtitle?: string;
  handle?: string; // e.g. "@myhotel"
  profileUrl?: string; // link to profile
  platform?: string; // e.g. "Instagram", "TikTok"
  images?: string[]; // up to 9 uploaded photos
};

// H3.7 — Seasonal Packages
export type SeasonalPackage = {
  id: string;
  title: string;
  description?: string;
  price: number;
  nights?: number;
  expiresAt?: string; // ISO date string for countdown timer
  imageUrl?: string;
  buttonText?: string;
  buttonLink?: string;
  includes?: string; // comma-separated, e.g. "3 Nights, Breakfast, Airport Transfer"
};

export type SeasonalPackagesSection = {
  title?: string;
  subtitle?: string;
  packages?: SeasonalPackage[];
};

// H3.8 — Nearby Attractions
export type NearbyAttraction = {
  name: string;
  distance: string; // e.g. "12 km"
  category?: string; // e.g. "landmark", "transport", "dining"
};

export type NearbyAttractionsSection = {
  title?: string;
  subtitle?: string;
  attractions?: NearbyAttraction[];
};

export type HomeContent = {
  testimonials?: Testimonial[];
  testimonialCount?: number;
  hero: HeroSection;
  browseCategory?: BrowseCategorySection;
  whyChooseUs: WhyChooseUsSection;
  popularDestinations?: PopularDestinationsSection;
  discountBanners: DiscountBannersSection;
  lastMinuteOffers: LastMinuteOffersSection;
  videoSection: VideoSection;
  newsSection: NewsSection;
  // Hotel Specific Sections
  hotelFeatures?: HotelFeaturesSection;
  featuredRooms?: FeaturedRoomsSection;
  hotelStory?: HotelStorySection;
  roomsSection?: RoomsSectionContent;
  amenitiesSection?: AmenitiesSectionContent;
  gallerySection?: GallerySectionContent;
  whyBookDirect?: WhyBookDirectSection;
  locationSection?: LocationSectionContent;
  socialSection?: SocialSectionContent;
  seasonalPackagesSection?: SeasonalPackagesSection;
  nearbyAttractionsSection?: NearbyAttractionsSection;
  visibility?: {
    hero?: boolean;
    browseCategory?: boolean;
    whyChooseUs?: boolean;
    popularDestinations?: boolean;
    discountBanners?: boolean;
    lastMinuteOffers?: boolean;
    testimonials?: boolean;
    videoSection?: boolean;
    newsSection?: boolean;
    // Hotel visibility
    hotelFeatures?: boolean;
    featuredRooms?: boolean;
    hotelStory?: boolean;
    roomsSection?: boolean;
    amenitiesSection?: boolean;
    gallerySection?: boolean;
    whyBookDirect?: boolean;
    locationSection?: boolean;
    socialSection?: boolean;
    seasonalPackages?: boolean;
    nearbyAttractions?: boolean;
  };
};

export type ContactMessageStatus = 'new' | 'read' | 'archived';

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  status: ContactMessageStatus;
  createdAt: string;
};

export type PromoCode = {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  startsAt?: string;
  expiresAt?: string;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
};
