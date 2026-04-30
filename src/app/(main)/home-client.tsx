'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type {
  BrowseCategoryIconKey,
  BrowseCategoryItem,
  HomeContent,
  Post,
  Testimonial,
  Tour,
  Hotel,
  RoomType,
} from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TourCard } from '@/components/tour-card';
import { HotelCard } from '@/components/hotel-card';
import {
  ArrowRight,
  Plane,
  Mountain,
  Utensils,
  FerrisWheel,
  Sailboat,
  Building2,
  Quote,
  Star,
  PlayCircle,
  Calendar,
  Search,
  MapPin,
  CalendarDays,
  Users2,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  ChevronRight,
  Clock,
  BadgeCheck,
  HeartHandshake,
  HelpCircle,
  Compass,
  Camera,
  BedDouble,
  Users,
  Maximize2,
  Tag,
  Wifi,
  Droplets,
  Dumbbell,
  Car,
  Wine,
  Bus,
  Bell,
  Wind,
  Sun,
  PawPrint,
  Shirt,
  ConciergeBell,
  ShieldCheck,
  RefreshCw,
  Zap,
  Gift,
  X,
  ChevronLeft,
  ExternalLink,
  Landmark,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ExclusiveTripIcon, ProfessionalGuideIcon, SafetyFirstIcon } from '@/components/icons';
import { CountdownTimer } from '@/components/countdown-timer';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { useLanguage } from '@/hooks/use-language';
import { useCurrency } from '@/hooks/use-currency';
import { HotelSearchBox } from '@/components/hotel-search-box';
import { HotelFeaturesSection } from '@/components/hotel-features-section';
import { HotelStorySection } from '@/components/hotel-story-section';
import { BLUR_DATA_URL } from '@/lib/blur-data-url';
import { cn } from '@/lib/utils';

// Animation Variants
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8 } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const browseCategoryIcons: Record<BrowseCategoryIconKey, React.ReactNode> = {
  mountain: <Mountain className="h-8 w-8" />,
  sailboat: <Sailboat className="h-8 w-8" />,
  building2: <Building2 className="h-8 w-8" />,
  utensils: <Utensils className="h-8 w-8" />,
  ferrisWheel: <FerrisWheel className="h-8 w-8" />,
  plane: <Plane className="h-8 w-8" />,
};

function isBrowseCategoryIconKey(value: unknown): value is BrowseCategoryIconKey {
  return typeof value === 'string' && value in browseCategoryIcons;
}

function normalizeBrowseCategoryItem(value: unknown): BrowseCategoryItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;

  const label = typeof obj.label === 'string' ? obj.label : null;
  const type = typeof obj.type === 'string' ? obj.type : null;
  if (!label || !type) return null;

  const icon = isBrowseCategoryIconKey(obj.icon) ? obj.icon : 'mountain';
  return { label, type, icon };
}

function LastMinuteOfferCard({ tour }: { tour: Tour }) {
  const { format } = useCurrency();
  const { t } = useLanguage();
  if (!tour || !tour.images || tour.images.length === 0) return null;
  const startingPrice =
    tour.priceTiers?.[0]?.pricePerAdult ?? tour.packages?.[0]?.priceTiers?.[0]?.pricePerAdult;
  return (
    <Link
      href={`/tours/${tour.slug}`}
      className="block group relative rounded-lg overflow-hidden shadow-lg text-white h-full"
    >
      <div className="relative h-64 w-full overflow-hidden">
        <Image
          src={tour.images[0]}
          alt={tour.name}
          fill
          className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-110"
          sizes="(max-width: 768px) 100vw, 50vw"
          data-ai-hint={`${tour.destination} travel`}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 p-4 w-full">
        <h3 className="font-bold text-xl mb-1 font-headline">{tour.destination}</h3>
        <p className="text-sm font-medium opacity-90">
          {startingPrice != null ? format(startingPrice) : t('tour.contactUs')}
        </p>
      </div>
    </Link>
  );
}

import { AgencySettingsData } from '@/lib/supabase/agency-content';

// ─── H2.4 Amenities Map ───────────────────────────────────────────────────────
type AmenityDef = { labelKey: string; icon: React.ElementType };
const AMENITIES_MAP: Record<string, AmenityDef> = {
  wifi: { labelKey: 'amenity.wifi', icon: Wifi },
  pool: { labelKey: 'amenity.pool', icon: Droplets },
  spa: { labelKey: 'amenity.spa', icon: Sparkles },
  restaurant: { labelKey: 'amenity.restaurant', icon: Utensils },
  gym: { labelKey: 'amenity.gym', icon: Dumbbell },
  parking: { labelKey: 'amenity.parking', icon: Car },
  bar: { labelKey: 'amenity.bar', icon: Wine },
  shuttle: { labelKey: 'amenity.shuttle', icon: Bus },
  roomService: { labelKey: 'amenity.roomService', icon: Bell },
  pets: { labelKey: 'amenity.pets', icon: PawPrint },
  kids: { labelKey: 'amenity.kids', icon: Users },
  meetings: { labelKey: 'amenity.meetings', icon: Users2 },
  ac: { labelKey: 'amenity.ac', icon: Wind },
  beach: { labelKey: 'amenity.beach', icon: Sun },
  laundry: { labelKey: 'amenity.laundry', icon: Shirt },
  concierge: { labelKey: 'amenity.concierge', icon: ConciergeBell },
};

// ─── H2.6 Why Book Direct Icon Map ────────────────────────────────────────────
const WHY_ICON_MAP: Record<string, React.ElementType> = {
  ShieldCheck: ShieldCheck,
  RefreshCw: RefreshCw,
  Zap: Zap,
  Gift: Gift,
  Star: Star,
  BadgeCheck: BadgeCheck,
  HeartHandshake: HeartHandshake,
  CheckCircle2: CheckCircle2,
};

interface HomePageClientProps {
  initialTours: Tour[];
  hotels?: Hotel[];
  roomTypes?: RoomType[];
  homeContent: HomeContent | null;
  articles: Post[];
  tourDestinations: string[];
  tourCategories: string[];
  settings?: AgencySettingsData | null;
}

export default function HomePageClient({
  initialTours,
  hotels = [],
  roomTypes = [],
  homeContent,
  articles = [],
  tourDestinations,
  tourCategories,
  settings,
}: HomePageClientProps) {
  const { t, dir } = useLanguage();
  const { format } = useCurrency();
  const isRtl = dir === 'rtl';
  const [testimonials, setTestimonials] = React.useState<Testimonial[]>([]);
  const tours = initialTours;

  React.useEffect(() => {
    if (homeContent?.testimonials && Array.isArray(homeContent.testimonials)) {
      const count =
        typeof homeContent.testimonialCount === 'number' &&
        Number.isFinite(homeContent.testimonialCount) &&
        homeContent.testimonialCount > 0
          ? homeContent.testimonialCount
          : homeContent.testimonials.length;
      setTestimonials(
        homeContent.testimonials.slice(0, count).map((t) => ({
          ...t,
          content: t.content ?? t.text ?? '',
          rating: 5,
        }))
      );
    }
  }, [homeContent]);

  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [tourType, setTourType] = React.useState('');
  const [heroSearchTab, setHeroSearchTab] = React.useState<'find' | 'custom'>('find');

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('q', searchQuery);
    if (destination) params.append('destination', destination);
    if (tourType) params.append('type', tourType);
    router.push(`/tours?${params.toString()}`);
  };

  const [destinationFilter, setDestinationFilter] = React.useState('all');

  const hero = homeContent?.hero;
  const heroImages = React.useMemo(() => {
    const fromArray = Array.isArray(hero?.imageUrls)
      ? hero.imageUrls.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      : [];
    if (fromArray.length > 0) return fromArray;
    const single = typeof hero?.imageUrl === 'string' ? hero.imageUrl.trim() : '';
    return single ? [single] : [];
  }, [hero]);

  const [activeHeroImageIndex, setActiveHeroImageIndex] = React.useState(0);

  React.useEffect(() => {
    setActiveHeroImageIndex(0);
  }, [heroImages]);

  React.useEffect(() => {
    if (heroImages.length <= 1) return;
    const interval = setInterval(() => {
      setActiveHeroImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 6500);
    return () => clearInterval(interval);
  }, [heroImages.length]);

  const isHotelOnly = settings?.modules?.hotels && !settings?.modules?.tours;
  const isSingleHotel = settings?.singleHotelMode;

  // Compute cheapest room price for H1.2 "Starting From" display
  const cheapestRoomPrice = React.useMemo(() => {
    if (!isSingleHotel || roomTypes.length === 0) return null;
    const prices = roomTypes
      .filter((r) => r.isActive && r.basePricePerNight != null)
      .map((r) => r.basePricePerNight as number);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, [roomTypes, isSingleHotel]);

  // Gallery lightbox state (H2.5)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  if (!homeContent) return null;
  const browseCategoriesFromContent = homeContent.browseCategory?.categories;
  const browseCategories =
    Array.isArray(browseCategoriesFromContent) && browseCategoriesFromContent.length > 0
      ? browseCategoriesFromContent
          .map((category) => normalizeBrowseCategoryItem(category))
          .filter((v): v is BrowseCategoryItem => v != null)
      : [];

  const galleryImages = homeContent.gallerySection?.images ?? [];

  // Force search type based on business mode
  const effectiveSearchType = isHotelOnly ? 'hotels' : homeContent.hero.searchType;

  const popularToursCount =
    typeof homeContent.popularDestinations?.count === 'number' &&
    Number.isFinite(homeContent.popularDestinations.count) &&
    homeContent.popularDestinations.count > 0
      ? homeContent.popularDestinations.count
      : tours.length;

  const lastMinuteToursCount =
    typeof homeContent.lastMinuteOffers?.count === 'number' &&
    Number.isFinite(homeContent.lastMinuteOffers.count) &&
    homeContent.lastMinuteOffers.count > 0
      ? homeContent.lastMinuteOffers.count
      : tours.length;

  return (
    <div className={cn('overflow-x-clip', isSingleHotel && 'pb-20 lg:pb-0')}>
      {/* Hero Section */}
      {homeContent.visibility?.hero !== false && (
        <motion.section
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="relative min-h-[92vh] flex flex-col items-center justify-center overflow-hidden w-[100dvw] ml-[calc(50%-50dvw)] -mt-[84px] md:-mt-[134px]"
        >
          {/* Background: Video (H2.1) or Image Crossfade Slider */}
          {homeContent.hero.videoUrl ? (
            <video
              key={homeContent.hero.videoUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              poster={heroImages[0]}
            >
              <source src={homeContent.hero.videoUrl} type="video/mp4" />
            </video>
          ) : heroImages.length > 0 ? (
            <AnimatePresence initial={false}>
              <motion.div
                key={heroImages[activeHeroImageIndex]}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              >
                <Image
                  src={heroImages[activeHeroImageIndex]}
                  alt={homeContent.hero.imageAlt || ''}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  priority
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                  data-ai-hint="Egypt travel"
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-700" />
          )}

          {/* Gradient overlays */}
          <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/55 via-black/25 to-black/70" />
          <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/20 via-transparent to-black/20" />

          {/* Main Content */}
          <div className="relative z-20 container mx-auto px-4 pt-24 md:pt-40 pb-16 flex flex-col items-center text-center text-white">
            {/* Eyebrow badge */}
            <motion.div variants={fadeInUp} className="mb-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-md px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/90 shadow">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {isSingleHotel ? t('home.luxuryStays') : t('hero.discover')}
              </span>
            </motion.div>

            {/* Title */}
            <motion.h1
              variants={fadeInUp}
              className={cn(
                'text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-extrabold mb-5 drop-shadow-2xl max-w-5xl',
                isRtl
                  ? 'font-sans leading-[1.22] tracking-normal'
                  : 'font-headline leading-[1.08] tracking-tight'
              )}
              dangerouslySetInnerHTML={{ __html: homeContent.hero?.title ?? '' }}
            />

            {/* Subtitle */}
            <motion.p
              variants={fadeInUp}
              className="mb-10 max-w-2xl text-base md:text-xl font-medium text-white/85 leading-relaxed drop-shadow"
            >
              {homeContent.hero?.subtitle}
            </motion.p>

            {/* H1.2 — Starting From price (hotel mode only) */}
            {isSingleHotel && cheapestRoomPrice != null && (
              <motion.p
                variants={fadeInUp}
                className="-mt-7 mb-8 text-sm font-semibold text-white/70 tracking-wide"
              >
                {t('home.startingFrom')}{' '}
                <span className="text-white font-bold text-base">{format(cheapestRoomPrice)}</span>{' '}
                / {t('home.perNight')}
              </motion.p>
            )}

            {/* ─── SEARCH WIDGET ─── */}
            <motion.div id="hero-search" variants={fadeInUp} className="w-full max-w-4xl">
              {isSingleHotel || effectiveSearchType === 'hotels' ? (
                /* ── Hotel Mode Search ── */
                <div className="rounded-2xl overflow-hidden shadow-2xl">
                  <div className="bg-primary px-6 py-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-white/80" />
                    <span className="text-sm font-semibold text-white tracking-wide uppercase">
                      {t('hero.checkAvailability')}
                    </span>
                  </div>
                  <div className="bg-white p-4">
                    <HotelSearchBox maxGuests={settings?.hotelSearchConfig?.maxAdults || 10} />
                  </div>
                </div>
              ) : (
                /* ── Tours Mode Tabbed Search ── */
                <div className="rounded-2xl overflow-visible shadow-2xl">
                  {/* Tabs */}
                  <div className="flex rounded-t-2xl overflow-hidden">
                    <button
                      onClick={() => setHeroSearchTab('find')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3.5 px-5 text-sm font-bold transition-all',
                        heroSearchTab === 'find'
                          ? 'bg-white text-primary shadow-sm'
                          : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                      )}
                    >
                      <Search className="h-4 w-4" />
                      {t('hero.findATour')}
                    </button>
                    <button
                      onClick={() => setHeroSearchTab('custom')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3.5 px-5 text-sm font-bold transition-all',
                        heroSearchTab === 'custom'
                          ? 'bg-white text-primary shadow-sm'
                          : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                      )}
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('hero.customTrip')}
                    </button>
                  </div>

                  {/* Tab Panels */}
                  <AnimatePresence mode="wait">
                    {heroSearchTab === 'find' ? (
                      <motion.div
                        key="find"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                        className="bg-white rounded-b-2xl p-4"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          {/* Keyword */}
                          <div className="sm:col-span-4 relative">
                            <Search
                              className={cn(
                                'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none',
                                isRtl ? 'right-3' : 'left-3'
                              )}
                            />
                            <Input
                              placeholder={t('hero.searchTours')}
                              className={cn(
                                'h-13 border-muted bg-gray-50 hover:bg-gray-100 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-primary transition-colors text-foreground',
                                isRtl ? 'pr-9' : 'pl-9'
                              )}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                          </div>
                          {/* Destination */}
                          <div className="sm:col-span-3 relative">
                            <MapPin
                              className={cn(
                                'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10',
                                isRtl ? 'right-3' : 'left-3'
                              )}
                            />
                            <Select value={destination} onValueChange={setDestination}>
                              <SelectTrigger
                                className={cn(
                                  'h-13 border-muted bg-gray-50 hover:bg-gray-100 text-foreground focus:ring-primary transition-colors',
                                  isRtl ? 'pr-9' : 'pl-9'
                                )}
                              >
                                <SelectValue placeholder={t('nav.destination')} />
                              </SelectTrigger>
                              <SelectContent>
                                {tourDestinations.length > 0 ? (
                                  tourDestinations.map((dest) => (
                                    <SelectItem key={dest} value={dest}>
                                      {dest}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="p-2 text-sm text-muted-foreground text-center">
                                    {t('hero.noDestinations')}
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Tour Type */}
                          <div className="sm:col-span-3 relative">
                            <ChevronDown
                              className={cn(
                                'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10',
                                isRtl ? 'left-8' : 'right-8'
                              )}
                            />
                            <Select value={tourType} onValueChange={setTourType}>
                              <SelectTrigger className="h-13 border-muted bg-gray-50 hover:bg-gray-100 text-foreground focus:ring-primary transition-colors">
                                <SelectValue placeholder={t('hero.type')} />
                              </SelectTrigger>
                              <SelectContent>
                                {tourCategories.length > 0 ? (
                                  tourCategories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                      {cat}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="p-2 text-sm text-muted-foreground text-center">
                                    {t('hero.noCategories')}
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Search Button */}
                          <div className="sm:col-span-2">
                            <Button
                              size="lg"
                              className="w-full h-13 font-bold shadow-md hover:scale-105 transition-transform rounded-lg text-base"
                              onClick={handleSearch}
                            >
                              <Search className={cn('h-4 w-4', isRtl ? 'ml-1.5' : 'mr-1.5')} />
                              {t('hero.search')}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="custom"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                        className="bg-white rounded-b-2xl p-6 flex flex-col sm:flex-row items-center gap-5"
                      >
                        <div className={cn('flex-1', isRtl ? 'text-right' : 'text-left')}>
                          <p className="font-bold text-foreground text-base mb-1">
                            {t('hero.customTripTitle')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t('hero.customTripDesc')}
                          </p>
                        </div>
                        <Button
                          size="lg"
                          className="shrink-0 font-bold rounded-full px-8 shadow-md hover:scale-105 transition-transform"
                          onClick={() => router.push('/tailor-made')}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          {t('hero.customize')}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>

            {/* H1.4 — Book Direct & Save badge (hotel mode, configurable) */}
            {isSingleHotel && homeContent.hero.bookDirectBadge && (
              <motion.div variants={fadeInUp} className="mt-4 mb-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/90 backdrop-blur-sm text-primary-foreground text-xs font-bold px-4 py-2 shadow-lg shadow-primary/30">
                  <Tag className="h-3.5 w-3.5" />
                  {homeContent.hero.bookDirectBadge}
                </span>
              </motion.div>
            )}

            {/* Stats bar */}
            <motion.div
              variants={fadeInUp}
              className="mt-10 flex flex-wrap items-center justify-center gap-6 md:gap-10"
            >
              {[
                { value: '500+', label: t('hero.statTours') },
                { value: '50+', label: t('hero.statDestinations') },
                { value: '10K+', label: t('hero.statTravelers') },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center gap-0.5">
                  <span className="text-2xl md:text-3xl font-extrabold text-white drop-shadow">
                    {stat.value}
                  </span>
                  <span className="text-xs md:text-sm font-medium text-white/75 uppercase tracking-widest">
                    {stat.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Slideshow dots */}
          {heroImages.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
              {heroImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveHeroImageIndex(i)}
                  className={cn(
                    'rounded-full transition-all duration-300',
                    i === activeHeroImageIndex
                      ? 'w-6 h-2.5 bg-white'
                      : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/70'
                  )}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Hotel Story Section */}
      {isSingleHotel && homeContent.hotelStory && homeContent.visibility?.hotelStory !== false && (
        <HotelStorySection data={homeContent.hotelStory} />
      )}

      {/* ─── H1.1 Our Rooms Section ─── */}
      {isSingleHotel && homeContent.visibility?.roomsSection !== false && roomTypes.length > 0 && (
        <section className="container mx-auto px-4 py-12 md:py-20" id="rooms">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
              <motion.div variants={fadeInUp}>
                <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                  {homeContent.roomsSection?.subtitle ?? t('home.accommodation')}
                </p>
                <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                  {homeContent.roomsSection?.title ?? t('home.ourRooms')}
                </h2>
              </motion.div>
              <motion.div variants={fadeInUp}>
                <Button
                  variant="outline"
                  className="border-primary/20 hover:border-primary text-foreground hover:text-primary hover:bg-primary/5 rounded-full"
                  asChild
                >
                  <Link href="/hotels/default">
                    {t('home.viewAllRooms')} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>
            </div>

            <Carousel opts={{ align: 'start', loop: false }} className="w-full">
              <CarouselContent className="-ml-4">
                {roomTypes
                  .slice()
                  .sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0))
                  .slice(0, homeContent.roomsSection?.count || roomTypes.length)
                  .map((room) => (
                    <CarouselItem
                      key={room.id}
                      className="pl-4 basis-[85%] sm:basis-1/2 lg:basis-1/3"
                    >
                      <motion.div variants={fadeInUp} className="h-full">
                        <Link href={`/hotels/default#rooms`} className="group block h-full">
                          <Card className="overflow-hidden h-full border-border/40 shadow-lg hover:shadow-2xl transition-all duration-300">
                            {/* Image */}
                            <div className="relative h-52 overflow-hidden">
                              {room.images && room.images.length > 0 ? (
                                <Image
                                  src={room.images[0]}
                                  alt={room.name}
                                  fill
                                  style={{ objectFit: 'cover' }}
                                  className="transition-transform duration-700 group-hover:scale-110"
                                  sizes="(max-width: 768px) 100vw, 33vw"
                                  placeholder="blur"
                                  blurDataURL={BLUR_DATA_URL}
                                />
                              ) : (
                                <div className="h-full w-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                                  <BedDouble className="h-12 w-12 text-muted-foreground/40" />
                                </div>
                              )}
                              {/* Price badge */}
                              {room.basePricePerNight != null && (
                                <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                  {format(room.basePricePerNight)}
                                  <span className="font-normal opacity-80">
                                    {' '}
                                    / {t('home.night')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <CardContent className="p-5">
                              <h3 className="font-headline text-lg font-bold text-foreground group-hover:text-primary transition-colors mb-3">
                                {room.name}
                              </h3>

                              {/* Quick stats */}
                              <div className="flex flex-wrap gap-3 mb-4 text-sm text-muted-foreground">
                                {room.maxAdults > 0 && (
                                  <span className="flex items-center gap-1.5">
                                    <Users className="h-4 w-4 text-primary/70" />
                                    {t('home.upTo')} {room.maxAdults + (room.maxChildren ?? 0)}{' '}
                                    {t('home.guests')}
                                  </span>
                                )}
                                {room.sizeSqm != null && (
                                  <span className="flex items-center gap-1.5">
                                    <Maximize2 className="h-4 w-4 text-primary/70" />
                                    {room.sizeSqm} m²
                                  </span>
                                )}
                                {room.beds && Object.keys(room.beds).length > 0 && (
                                  <span className="flex items-center gap-1.5">
                                    <BedDouble className="h-4 w-4 text-primary/70" />
                                    {Object.entries(room.beds as Record<string, number>)
                                      .map(([type, count]) => `${count} ${type}`)
                                      .join(', ')}
                                  </span>
                                )}
                              </div>

                              {/* Highlights */}
                              {room.highlights && room.highlights.length > 0 && (
                                <ul className="space-y-1 mb-4">
                                  {room.highlights.slice(0, 3).map((h, idx) => (
                                    <li
                                      key={idx}
                                      className="flex items-center gap-2 text-sm text-muted-foreground"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                      {h}
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <Button
                                className="w-full rounded-full font-bold mt-1"
                                size="sm"
                                asChild
                              >
                                <Link href="/hotels/default">
                                  {t('home.bookNow')} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </CardContent>
                          </Card>
                        </Link>
                      </motion.div>
                    </CarouselItem>
                  ))}
              </CarouselContent>
              {roomTypes.length > 3 && (
                <div className="flex justify-end gap-3 mt-6">
                  <CarouselPrevious className="static translate-y-0 h-11 w-11 border-primary/20 hover:bg-primary/5 hover:border-primary hover:text-primary transition-all rounded-full" />
                  <CarouselNext className="static translate-y-0 h-11 w-11 border-primary/20 hover:bg-primary/5 hover:border-primary hover:text-primary transition-all rounded-full" />
                </div>
              )}
            </Carousel>
          </motion.div>
        </section>
      )}

      {/* ─── H2.4 Amenities Showcase ─── */}
      {isSingleHotel &&
        homeContent.visibility?.amenitiesSection !== false &&
        homeContent.amenitiesSection?.items &&
        homeContent.amenitiesSection.items.length > 0 && (
          <section id="amenities" className="py-16 md:py-20 bg-muted/30">
            <div className="container mx-auto px-4">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
              >
                <motion.div variants={fadeInUp} className="text-center mb-12">
                  <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                    {homeContent.amenitiesSection.subtitle ?? t('home.amenitiesPretitle')}
                  </p>
                  <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                    {homeContent.amenitiesSection.title ?? t('home.amenitiesTitle')}
                  </h2>
                </motion.div>
                <motion.div
                  variants={fadeInUp}
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
                >
                  {homeContent.amenitiesSection.items.map((id) => {
                    const amenity = AMENITIES_MAP[id];
                    if (!amenity) return null;
                    const Icon = amenity.icon;
                    return (
                      <div
                        key={id}
                        className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-background border border-border/40 shadow-sm hover:border-primary/40 hover:shadow-md transition-all group"
                      >
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-foreground text-center leading-tight">
                          {t(amenity.labelKey)}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
              </motion.div>
            </div>
          </section>
        )}

      {/* ─── H2.5 Photo Gallery ─── */}
      {isSingleHotel &&
        homeContent.visibility?.gallerySection !== false &&
        galleryImages.length > 0 && (
          <section id="gallery" className="py-16 md:py-20">
            <div className="container mx-auto px-4">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
              >
                <motion.div variants={fadeInUp} className="text-center mb-12">
                  <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                    {homeContent.gallerySection?.subtitle ?? t('home.galleryPretitle')}
                  </p>
                  <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                    {homeContent.gallerySection?.title ?? t('home.galleryTitle')}
                  </h2>
                </motion.div>
                <motion.div
                  variants={fadeInUp}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-[200px]"
                >
                  {galleryImages.map((src, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'relative cursor-pointer overflow-hidden rounded-2xl group',
                        idx === 0 && 'col-span-2 row-span-2'
                      )}
                      onClick={() => setLightboxIndex(idx)}
                    >
                      <Image
                        src={src}
                        alt={`${homeContent.gallerySection?.title ?? 'Gallery'} ${idx + 1}`}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="(max-width: 768px) 50vw, 33vw"
                        className="transition-transform duration-500 group-hover:scale-105"
                        placeholder="blur"
                        blurDataURL={BLUR_DATA_URL}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Camera className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            </div>

            {/* Lightbox */}
            <AnimatePresence>
              {lightboxIndex !== null && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
                  onClick={() => setLightboxIndex(null)}
                >
                  <button
                    className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2 rounded-full hover:bg-white/10 transition-colors"
                    onClick={() => setLightboxIndex(null)}
                  >
                    <X className="h-7 w-7" />
                  </button>
                  {lightboxIndex > 0 && (
                    <button
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10 p-3 rounded-full hover:bg-white/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex((i) => (i as number) - 1);
                      }}
                    >
                      <ChevronLeft className="h-8 w-8" />
                    </button>
                  )}
                  {lightboxIndex < galleryImages.length - 1 && (
                    <button
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10 p-3 rounded-full hover:bg-white/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex((i) => (i as number) + 1);
                      }}
                    >
                      <ChevronRight className="h-8 w-8" />
                    </button>
                  )}
                  <motion.div
                    key={lightboxIndex}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="relative w-full max-w-5xl mx-16 max-h-[85vh] aspect-video"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Image
                      src={galleryImages[lightboxIndex]}
                      alt=""
                      fill
                      style={{ objectFit: 'contain' }}
                      sizes="100vw"
                    />
                  </motion.div>
                  <p className="absolute bottom-4 text-white/40 text-sm">
                    {lightboxIndex + 1} / {galleryImages.length}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

      {/* ─── H2.6 Why Book Direct ─── */}
      {isSingleHotel &&
        homeContent.visibility?.whyBookDirect !== false &&
        homeContent.whyBookDirect?.benefits &&
        homeContent.whyBookDirect.benefits.length > 0 && (
          <section
            id="why-book-direct"
            className="py-16 md:py-20 bg-primary text-primary-foreground overflow-hidden"
          >
            <div className="container mx-auto px-4">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
              >
                <motion.div variants={fadeInUp} className="text-center mb-12">
                  <p className="font-bold tracking-wide uppercase text-xs md:text-sm opacity-70">
                    {homeContent.whyBookDirect.subtitle ?? t('home.whyBookDirectPretitle')}
                  </p>
                  <h2 className="font-headline text-3xl md:text-5xl font-bold mt-2">
                    {homeContent.whyBookDirect.title ?? t('home.whyBookDirectTitle')}
                  </h2>
                </motion.div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {homeContent.whyBookDirect.benefits.map((benefit, idx) => {
                    const Icon = WHY_ICON_MAP[benefit.icon ?? ''] ?? ShieldCheck;
                    return (
                      <motion.div
                        key={idx}
                        variants={fadeInUp}
                        className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors border border-white/10"
                      >
                        <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center mb-5">
                          <Icon className="h-7 w-7" />
                        </div>
                        <h3 className="font-headline text-lg font-bold mb-2">{benefit.title}</h3>
                        <p className="text-sm opacity-75 leading-relaxed">{benefit.description}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </section>
        )}

      {/* ─── H2.7 Location / Map ─── */}
      {isSingleHotel &&
        homeContent.visibility?.locationSection !== false &&
        homeContent.locationSection &&
        (homeContent.locationSection.mapEmbedUrl || homeContent.locationSection.address) && (
          <section id="location" className="py-16 md:py-20">
            <div className="container mx-auto px-4">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
              >
                <motion.div variants={fadeInUp} className="text-center mb-12">
                  <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                    {homeContent.locationSection.subtitle ?? t('home.locationPretitle')}
                  </p>
                  <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                    {homeContent.locationSection.title ?? t('home.locationTitle')}
                  </h2>
                </motion.div>
                <motion.div
                  variants={fadeInUp}
                  className="flex flex-col lg:flex-row gap-8 items-stretch rounded-2xl overflow-hidden shadow-xl border border-border/40"
                >
                  {homeContent.locationSection.mapEmbedUrl && (
                    <div className="flex-1 min-h-[350px]">
                      <iframe
                        src={homeContent.locationSection.mapEmbedUrl}
                        className="w-full h-full min-h-[350px]"
                        style={{ border: 0 }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title={homeContent.locationSection.title ?? 'Hotel Location'}
                      />
                    </div>
                  )}
                  <div className="lg:w-80 flex flex-col justify-center gap-6 p-8 bg-card">
                    <div>
                      <p className="text-primary font-bold tracking-wide uppercase text-xs mb-4">
                        {homeContent.locationSection.subtitle ?? t('home.locationPretitle')}
                      </p>
                      <h3 className="font-headline text-2xl font-bold text-foreground mb-4">
                        {homeContent.locationSection.title ?? t('home.locationTitle')}
                      </h3>
                    </div>
                    {homeContent.locationSection.address && (
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                          {homeContent.locationSection.address}
                        </p>
                      </div>
                    )}
                    {homeContent.locationSection.directionsUrl && (
                      <Button className="rounded-full font-bold self-start mt-2" asChild>
                        <Link
                          href={homeContent.locationSection.directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('home.getDirections')}
                        </Link>
                      </Button>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </section>
        )}

      {/* ─── H2.8 Social Feed / Instagram Grid ─── */}
      {isSingleHotel &&
        homeContent.visibility?.socialSection !== false &&
        homeContent.socialSection &&
        (homeContent.socialSection.images?.length ?? 0) > 0 && (
          <section id="social" className="py-16 md:py-20 bg-muted/30">
            <div className="container mx-auto px-4">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
              >
                <motion.div
                  variants={fadeInUp}
                  className="flex flex-col md:flex-row items-center justify-between mb-10 gap-4"
                >
                  <div className="text-center md:text-left">
                    <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                      {homeContent.socialSection.subtitle ?? t('home.socialPretitle')}
                    </p>
                    <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                      {homeContent.socialSection.title ?? t('home.socialTitle')}
                    </h2>
                  </div>
                  {homeContent.socialSection.profileUrl && (
                    <Button
                      variant="outline"
                      className="rounded-full border-primary/30 hover:border-primary hover:text-primary shrink-0"
                      asChild
                    >
                      <Link
                        href={homeContent.socialSection.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {homeContent.socialSection.handle
                          ? homeContent.socialSection.handle
                          : t('home.socialFollow')}
                      </Link>
                    </Button>
                  )}
                </motion.div>

                <motion.div
                  variants={fadeInUp}
                  className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3"
                >
                  {homeContent.socialSection.images!.slice(0, 9).map((src, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
                    >
                      <Image
                        src={src}
                        alt={`${homeContent.socialSection?.handle ?? 'social'} ${idx + 1}`}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="(max-width: 640px) 33vw, 16vw"
                        className="transition-transform duration-500 group-hover:scale-110"
                        placeholder="blur"
                        blurDataURL={BLUR_DATA_URL}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}

                  {/* CTA tile — only if <=6 photos so last cell is the CTA */}
                  {homeContent.socialSection.profileUrl &&
                    homeContent.socialSection.images!.length <= 8 && (
                      <Link
                        href={homeContent.socialSection.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary/60 flex flex-col items-center justify-center gap-2 text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        <ExternalLink className="h-7 w-7" />
                        <span className="text-xs font-bold px-2 text-center leading-tight">
                          {homeContent.socialSection.handle ?? t('home.socialFollow')}
                        </span>
                      </Link>
                    )}
                </motion.div>
              </motion.div>
            </div>
          </section>
        )}

      {/* ─── H3.8 Nearby Attractions ─── */}
      {isSingleHotel &&
        homeContent.visibility?.nearbyAttractions !== false &&
        homeContent.nearbyAttractionsSection?.attractions &&
        homeContent.nearbyAttractionsSection.attractions.length > 0 && (
          <section className="container mx-auto px-4 py-12 md:py-20">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <motion.div variants={fadeInUp} className="text-center mb-10">
                <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                  {homeContent.nearbyAttractionsSection.subtitle ??
                    t('home.nearbyAttractionsPretitle')}
                </p>
                <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                  {homeContent.nearbyAttractionsSection.title ?? t('home.nearbyAttractionsTitle')}
                </h2>
              </motion.div>
              <motion.div
                variants={staggerContainer}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              >
                {homeContent.nearbyAttractionsSection.attractions.map((attraction, i) => (
                  <motion.div
                    key={i}
                    variants={fadeInUp}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Landmark className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">
                        {attraction.name}
                      </p>
                      <p className="text-xs text-primary font-bold mt-0.5">{attraction.distance}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </section>
        )}

      {/* ─── H3.7 Seasonal Packages ─── */}
      {isSingleHotel &&
        homeContent.visibility?.seasonalPackages !== false &&
        homeContent.seasonalPackagesSection?.packages &&
        homeContent.seasonalPackagesSection.packages.length > 0 && (
          <section className="py-12 md:py-20 w-[100dvw] ml-[calc(50%-50dvw)] bg-gradient-to-b from-background to-primary/5">
            <div className="container mx-auto px-4">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
              >
                <motion.div variants={fadeInUp} className="text-center mb-12">
                  <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                    {homeContent.seasonalPackagesSection.subtitle ??
                      t('home.seasonalPackagesPretitle')}
                  </p>
                  <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                    {homeContent.seasonalPackagesSection.title ?? t('home.seasonalPackagesTitle')}
                  </h2>
                </motion.div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {homeContent.seasonalPackagesSection.packages.map((pkg) => (
                    <motion.div key={pkg.id} variants={fadeInUp} className="h-full">
                      <Card className="overflow-hidden h-full border-border/40 shadow-lg hover:shadow-2xl transition-all duration-300 group flex flex-col">
                        {pkg.imageUrl && (
                          <div className="relative h-48 overflow-hidden shrink-0">
                            <Image
                              src={pkg.imageUrl}
                              alt={pkg.title}
                              fill
                              style={{ objectFit: 'cover' }}
                              sizes="(max-width: 768px) 100vw, 33vw"
                              className="transition-transform duration-700 group-hover:scale-110"
                              placeholder="blur"
                              blurDataURL={BLUR_DATA_URL}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                            {pkg.nights && (
                              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full">
                                {pkg.nights} {t('home.nights')}
                              </div>
                            )}
                          </div>
                        )}
                        <CardContent className="p-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex flex-col flex-1">
                          <h3 className="font-headline text-xl font-bold mb-2">{pkg.title}</h3>
                          {pkg.description && (
                            <p className="text-primary-foreground/80 text-sm mb-4 flex-1">
                              {pkg.description}
                            </p>
                          )}
                          {pkg.includes && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {pkg.includes.split(',').map((item, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 text-xs bg-white/20 rounded-full px-3 py-1 font-medium"
                                >
                                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                                  {item.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-end justify-between mt-auto pt-2">
                            <div>
                              <p className="text-xs text-primary-foreground/60">
                                {t('home.packageFrom')}
                              </p>
                              <p className="text-2xl font-bold">{format(pkg.price)}</p>
                            </div>
                            {pkg.buttonLink && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="rounded-full font-bold"
                                asChild
                              >
                                <Link href={pkg.buttonLink}>
                                  {pkg.buttonText || t('home.viewPackage')}
                                </Link>
                              </Button>
                            )}
                          </div>
                          {pkg.expiresAt && (
                            <div className="mt-4 pt-4 border-t border-white/20">
                              <p className="text-xs text-primary-foreground/70 mb-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {t('home.offerEndsIn')}
                              </p>
                              <CountdownTimer targetDate={pkg.expiresAt} />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>
        )}

      {/* Categories Section - Only show if not in Hotel Only mode */}
      {homeContent.visibility?.browseCategory !== false &&
      !isHotelOnly &&
      !isSingleHotel &&
      (browseCategories.length > 0 || homeContent.browseCategory?.title) ? (
        <section className="container mx-auto px-4 -mt-6 md:-mt-10 pb-12 md:pb-20 relative z-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeInUp}
            className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-card/95 via-card to-muted/20 p-6 shadow-xl shadow-black/5 backdrop-blur-sm md:rounded-2xl md:p-10 md:shadow-2xl md:shadow-black/10"
          >
            <div className="text-center mb-6 md:mb-10">
              {homeContent.browseCategory?.title ? (
                <h2 className="font-headline text-2xl md:text-4xl font-bold text-foreground">
                  {homeContent.browseCategory.title}
                </h2>
              ) : null}
              {homeContent.browseCategory?.subtitle ? (
                <p className="text-muted-foreground mt-2 md:mt-3 text-base md:text-lg">
                  {homeContent.browseCategory.subtitle}
                </p>
              ) : null}
            </div>
            <motion.div
              variants={staggerContainer}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-8"
            >
              {browseCategories.map((category, index) => (
                <motion.div
                  key={`${category.type}-${index}`}
                  variants={fadeInUp}
                  whileHover={{ y: -5 }}
                  className="flex"
                >
                  <Link
                    href={`/tours?type=${encodeURIComponent(category.type)}`}
                    className="group flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-transparent bg-background/40 px-2 py-3 text-center transition-all duration-300 hover:border-primary/20 hover:bg-primary/5 hover:shadow-md focus-visible:border-primary/30 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:shadow-md md:gap-4 md:rounded-2xl md:px-3"
                    aria-label={`Browse ${category.label} tours`}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/15 bg-primary/5 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-focus-visible:bg-primary group-focus-visible:text-primary-foreground group-focus-visible:shadow-lg md:h-20 md:w-20">
                      <div className="scale-75 md:scale-100">
                        {browseCategoryIcons[category.icon]}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground transition-colors duration-300 group-hover:text-primary group-focus-visible:text-primary md:text-base">
                      {category.label}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </section>
      ) : null}

      {/* Hotel Features Section - Replaces Why Choose Us for Single Hotel */}
      {isSingleHotel &&
      homeContent.hotelFeatures &&
      homeContent.visibility?.hotelFeatures !== false ? (
        <HotelFeaturesSection data={homeContent.hotelFeatures} />
      ) : homeContent.visibility?.whyChooseUs !== false && homeContent.whyChooseUs ? (
        <section className="container mx-auto px-4 py-14 md:py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
          >
            <motion.div variants={fadeInUp} className="order-2 md:order-1">
              {homeContent.whyChooseUs?.pretitle ? (
                <p className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary md:text-sm">
                  {homeContent.whyChooseUs.pretitle}
                </p>
              ) : null}
              <h2 className="mt-3 mb-6 whitespace-pre-line font-headline text-3xl font-bold leading-[1.15] text-foreground md:mb-8 md:text-5xl">
                {homeContent.whyChooseUs?.title ?? ''}
              </h2>
              <div className="mt-6 space-y-4 md:mt-8 md:space-y-5">
                {[
                  {
                    icon: <SafetyFirstIcon className="w-6 h-6 md:w-8 md:h-8" />,
                    feat: homeContent.whyChooseUs.feature1,
                  },
                  {
                    icon: <ProfessionalGuideIcon className="w-6 h-6 md:w-8 md:h-8" />,
                    feat: homeContent.whyChooseUs.feature2,
                  },
                  {
                    icon: <ExclusiveTripIcon className="w-6 h-6 md:w-8 md:h-8" />,
                    feat: homeContent.whyChooseUs.feature3,
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    variants={fadeInUp}
                    whileHover={{ y: -2 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="group flex items-start gap-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm transition-colors duration-300 hover:border-primary/30 hover:bg-primary/[0.04] md:gap-5 md:p-5"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-105 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      {item.icon}
                    </div>
                    <div className="text-start">
                      <h3 className="mb-1 text-lg font-bold text-foreground md:mb-2 md:text-xl">
                        {item.feat.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                        {item.feat.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeInUp} className="relative order-1 md:order-2">
              <div className="group relative isolate overflow-hidden rounded-2xl border border-border/50 bg-muted/10 shadow-2xl md:rounded-3xl">
                <div className="relative min-h-[320px] md:min-h-[520px]">
                  {homeContent.whyChooseUs.imageUrl ? (
                    <Image
                      src={homeContent.whyChooseUs.imageUrl}
                      alt={homeContent.whyChooseUs.imageAlt || ''}
                      fill
                      style={{ objectFit: 'cover' }}
                      className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                      data-ai-hint="adventure travel"
                    />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent" />
              </div>
              {homeContent.whyChooseUs.badgeValue && homeContent.whyChooseUs.badgeLabel ? (
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.45, duration: 0.5, ease: 'easeOut' }}
                  className={cn(
                    'absolute bottom-4 z-10 w-44 rounded-2xl border border-white/25 bg-background/90 p-4 text-center shadow-2xl backdrop-blur md:bottom-6 md:w-56 md:p-5',
                    isRtl ? 'left-4 md:left-6' : 'right-4 md:right-6'
                  )}
                >
                  <p className="mb-1 font-headline text-3xl font-bold leading-none text-foreground md:text-5xl">
                    {homeContent.whyChooseUs.badgeValue}
                  </p>
                  <p className="text-sm font-medium text-muted-foreground md:text-base">
                    {homeContent.whyChooseUs.badgeLabel}
                  </p>
                </motion.div>
              ) : null}
            </motion.div>
          </motion.div>
        </section>
      ) : null}

      {/* Popular Destinations Section - Only show if Tours are enabled */}
      {homeContent.visibility?.popularDestinations !== false && !isHotelOnly && (
        <section
          className="container relative mx-auto overflow-hidden px-4 py-12 md:py-20"
          id="tours"
        >
          <div className="pointer-events-none absolute inset-x-0 top-16 h-48 rounded-[2rem] bg-gradient-to-r from-primary/10 via-primary/[0.07] to-transparent blur-3xl" />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="relative"
          >
            {/* Header */}
            <div className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between">
              <motion.div variants={fadeInUp} className="max-w-3xl space-y-3">
                {homeContent.popularDestinations?.pretitle ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary md:text-xs">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{homeContent.popularDestinations.pretitle}</span>
                  </div>
                ) : null}
                {homeContent.popularDestinations?.title ? (
                  <h2 className="mt-1 max-w-2xl font-headline text-3xl font-bold leading-tight text-foreground md:text-5xl md:leading-[1.08]">
                    {homeContent.popularDestinations.title}
                  </h2>
                ) : null}
              </motion.div>
              <motion.div variants={fadeInUp} className="w-full md:w-auto">
                <Button
                  variant="outline"
                  className="group w-full rounded-full border-primary/30 bg-background/90 px-6 text-foreground shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
                  asChild
                >
                  <Link href="/tours">
                    {t('home.viewAllTours')}{' '}
                    <ArrowRight
                      className={cn(
                        'h-4 w-4 transition-transform duration-300',
                        isRtl
                          ? 'mr-2 group-hover:-translate-x-0.5'
                          : 'ml-2 group-hover:translate-x-0.5'
                      )}
                    />
                  </Link>
                </Button>
              </motion.div>
            </div>

            {/* Category Filter Tabs */}
            {tourDestinations.length > 0 && (
              <motion.div variants={fadeInUp} className="mb-8 md:mb-10">
                <div className="-mx-4 px-4 md:mx-0 md:px-0">
                  <div className="flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:pb-0">
                    <button
                      onClick={() => setDestinationFilter('all')}
                      className={cn(
                        'snap-start shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        destinationFilter === 'all'
                          ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_hsl(var(--primary))]'
                          : 'border-border/80 bg-background/90 text-muted-foreground hover:border-primary/60 hover:bg-primary/5 hover:text-primary'
                      )}
                    >
                      {t('home.filterAll')}
                    </button>
                    {tourDestinations.slice(0, 6).map((dest) => (
                      <button
                        key={dest}
                        onClick={() => setDestinationFilter(dest)}
                        className={cn(
                          'snap-start shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          destinationFilter === dest
                            ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_hsl(var(--primary))]'
                            : 'border-border/80 bg-background/90 text-muted-foreground hover:border-primary/60 hover:bg-primary/5 hover:text-primary'
                        )}
                      >
                        {dest}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tours Carousel */}
            {tours.length > 0 ? (
              <motion.div variants={fadeInUp}>
                <div className="rounded-3xl border border-primary/15 bg-gradient-to-b from-primary/[0.08] via-background to-background/95 p-4 shadow-[0_24px_64px_-48px_hsl(var(--foreground))] md:p-6 lg:p-8">
                  <Carousel opts={{ align: 'start', loop: false }} className="w-full">
                    <CarouselContent className="-ml-4">
                      {tours
                        .filter(
                          (t) => destinationFilter === 'all' || t.destination === destinationFilter
                        )
                        .slice(0, popularToursCount)
                        .map((tour) => (
                          <CarouselItem
                            key={tour.id}
                            className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
                          >
                            <TourCard tour={tour} />
                          </CarouselItem>
                        ))}
                    </CarouselContent>
                    <div className="mt-7 flex items-center justify-end gap-3">
                      <CarouselPrevious className="static h-11 w-11 translate-y-0 rounded-full border border-primary/30 bg-background/95 text-foreground shadow-sm transition-all duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-primary/30 disabled:hover:bg-background/95 disabled:hover:text-foreground" />
                      <CarouselNext className="static h-11 w-11 translate-y-0 rounded-full border border-primary/30 bg-background/95 text-foreground shadow-sm transition-all duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-primary/30 disabled:hover:bg-background/95 disabled:hover:text-foreground" />
                    </div>
                  </Carousel>
                </div>
              </motion.div>
            ) : (
              <div className="text-center py-16 bg-muted/30 rounded-3xl border-2 border-dashed border-muted">
                <h3 className="text-xl font-semibold text-muted-foreground">
                  {t('common.noTours')}
                </h3>
                <p className="text-muted-foreground mt-2">{t('common.checkBack')}</p>
              </div>
            )}
          </motion.div>
        </section>
      )}

      {/* Featured Hotels Section - Show if Hotels enabled */}
      {hotels.length > 0 && settings?.modules?.hotels !== false && (
        <section className="container mx-auto px-4 py-12 md:py-20" id="hotels">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-10 gap-4">
              <motion.div variants={fadeInUp}>
                <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                  {isSingleHotel ? t('home.accommodation') : t('home.luxuryStays')}
                </p>
                <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                  {isSingleHotel ? t('home.ourRooms') : t('home.topHotels')}
                </h2>
              </motion.div>
              <motion.div variants={fadeInUp}>
                <Button
                  variant="outline"
                  className="border-primary/20 hover:border-primary text-foreground hover:text-primary hover:bg-primary/5"
                  asChild
                >
                  <Link href={isSingleHotel ? '/hotels/default' : '/hotels'}>
                    {isSingleHotel ? t('home.viewAllRooms') : t('home.viewAllHotels')}{' '}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {hotels.slice(0, 6).map((hotel, i) => (
                <motion.div key={hotel.id} variants={fadeInUp} custom={i}>
                  <HotelCard hotel={hotel} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ─── How It Works ─── */}
      {!isHotelOnly && (
        <section className="w-[100dvw] ml-[calc(50%-50dvw)] bg-gradient-to-b from-background via-muted/35 to-background py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-background/90 px-6 py-10 shadow-xl shadow-primary/5 md:px-10 md:py-14">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="relative z-10 mx-auto mb-12 max-w-3xl text-center md:mb-14"
              >
                <motion.p
                  variants={fadeInUp}
                  className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm"
                >
                  {t('howItWorks.pretitle')}
                </motion.p>
                <motion.h2
                  variants={fadeInUp}
                  className="font-headline mt-2 text-3xl font-bold text-foreground md:text-5xl"
                >
                  {t('howItWorks.title')}
                </motion.h2>
                <motion.p
                  variants={fadeInUp}
                  className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg"
                >
                  {t('howItWorks.subtitle')}
                </motion.p>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="relative z-10 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6"
              >
                {/* Connecting line (desktop only) */}
                <div className="pointer-events-none absolute inset-x-[11%] top-[3.4rem] z-0 hidden h-px bg-gradient-to-r from-primary/0 via-primary/35 to-primary/0 md:block" />

                {[
                  {
                    step: '01',
                    icon: <Compass className="h-8 w-8" />,
                    title: t('howItWorks.step1Title'),
                    desc: t('howItWorks.step1Desc'),
                  },
                  {
                    step: '02',
                    icon: <BadgeCheck className="h-8 w-8" />,
                    title: t('howItWorks.step2Title'),
                    desc: t('howItWorks.step2Desc'),
                  },
                  {
                    step: '03',
                    icon: <Camera className="h-8 w-8" />,
                    title: t('howItWorks.step3Title'),
                    desc: t('howItWorks.step3Desc'),
                  },
                ].map((item) => (
                  <motion.div
                    key={item.step}
                    variants={fadeInUp}
                    whileHover={{ y: -4 }}
                    className="group relative z-10 rounded-3xl border border-primary/15 bg-background/85 p-6 text-start shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/10"
                  >
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/20">
                        {item.icon}
                      </div>
                      <span className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-primary/20 bg-background px-3 text-xs font-bold tracking-[0.2em] text-primary transition-colors duration-300 group-hover:border-primary/35 group-hover:bg-primary/10">
                        {item.step}
                      </span>
                    </div>
                    <h3 className="font-headline text-xl font-bold text-foreground md:text-2xl">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                      {item.desc}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>
      )}

      {/* Discount Banners */}
      {homeContent.visibility?.discountBanners !== false && (
        <section className="container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className="bg-accent/10 border border-accent/20 rounded-2xl p-6 md:p-10 flex flex-col-reverse md:flex-row items-center justify-between overflow-hidden relative group gap-6 md:gap-0"
            >
              <div className="relative z-10 max-w-[60%]">
                <h3 className="text-2xl md:text-3xl font-bold text-foreground font-headline mb-2 md:mb-3">
                  {homeContent.discountBanners?.banner1?.title}
                </h3>
                <p className="text-base md:text-lg text-muted-foreground mb-4 md:mb-6">
                  {homeContent.discountBanners?.banner1?.description}
                </p>
                {homeContent.discountBanners?.banner1?.buttonLink &&
                homeContent.discountBanners?.banner1?.buttonText ? (
                  <Button className="shadow-lg group-hover:scale-105 transition-transform" asChild>
                    <Link href={homeContent.discountBanners.banner1.buttonLink}>
                      {homeContent.discountBanners.banner1.buttonText}{' '}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="relative w-40 h-40 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2 md:w-48 md:h-48 lg:w-64 lg:h-64 opacity-90 md:opacity-80 group-hover:scale-110 transition-transform duration-500">
                {homeContent.discountBanners.banner1.imageUrl ? (
                  <Image
                    src={homeContent.discountBanners.banner1.imageUrl}
                    alt={homeContent.discountBanners.banner1.title}
                    fill
                    style={{ objectFit: 'contain' }}
                    sizes="(max-width: 768px) 160px, 256px"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                ) : null}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className="bg-primary text-primary-foreground rounded-2xl p-6 md:p-10 flex flex-col-reverse md:flex-row items-center justify-between overflow-hidden relative group shadow-xl gap-6 md:gap-0"
            >
              <div className="relative z-10 max-w-[60%]">
                <h3 className="text-2xl md:text-3xl font-bold font-headline mb-2 md:mb-3">
                  {homeContent.discountBanners?.banner2?.title}
                </h3>
                <p className="text-base md:text-lg text-primary-foreground/80 mb-4 md:mb-6">
                  {homeContent.discountBanners?.banner2?.description}
                </p>
                {homeContent.discountBanners?.banner2?.buttonLink &&
                homeContent.discountBanners?.banner2?.buttonText ? (
                  <Button
                    variant="secondary"
                    className="shadow-lg group-hover:scale-105 transition-transform"
                    asChild
                  >
                    <Link href={homeContent.discountBanners.banner2.buttonLink}>
                      {homeContent.discountBanners.banner2.buttonText}{' '}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="relative w-40 h-40 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2 md:w-48 md:h-48 lg:w-64 lg:h-64 opacity-90 md:opacity-80 group-hover:scale-110 transition-transform duration-500">
                {homeContent.discountBanners.banner2.imageUrl ? (
                  <Image
                    src={homeContent.discountBanners.banner2.imageUrl}
                    alt={homeContent.discountBanners.banner2.title}
                    fill
                    style={{ objectFit: 'contain' }}
                    sizes="(max-width: 768px) 160px, 256px"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                ) : null}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Last Minute Offers */}
      {homeContent.visibility?.lastMinuteOffers !== false && (
        <section className="container mx-auto px-4 py-12 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="grid grid-cols-1 lg:grid-cols-3 bg-gradient-to-br from-primary to-accent rounded-2xl md:rounded-3xl overflow-hidden text-white shadow-2xl"
          >
            <div className="bg-black/20 backdrop-blur-sm p-8 md:p-14 flex flex-col justify-center items-center text-center border-b lg:border-b-0 lg:border-r border-white/10">
              <h2 className="text-6xl md:text-7xl lg:text-9xl font-bold font-headline mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                {homeContent.lastMinuteOffers.discount}
                <span className="text-3xl md:text-5xl align-top text-white">%</span>
              </h2>
              <div className="text-lg md:text-2xl font-light tracking-widest mb-6 md:mb-8 uppercase">
                {t('home.off')}
              </div>
              <CountdownTimer />
            </div>
            <div className="lg:col-span-2 p-8 lg:p-12 relative">
              <Plane className="absolute top-8 right-8 text-white/10 h-24 w-24 -rotate-45" />
              <p className="font-semibold text-white/80 uppercase tracking-wider text-sm mb-2">
                {homeContent.lastMinuteOffers.pretitle}
              </p>
              <h2 className="font-headline text-4xl md:text-5xl font-bold text-white mb-8">
                {homeContent.lastMinuteOffers.title}
              </h2>
              <div className="relative z-10">
                {tours.length > 0 ? (
                  <Carousel
                    opts={{
                      align: 'start',
                      loop: true,
                    }}
                    className="w-full"
                  >
                    <CarouselContent>
                      {tours.slice(0, lastMinuteToursCount).map((tour, index) => (
                        <CarouselItem key={index} className="md:basis-1/2 pl-4">
                          <div className="p-1 h-full">
                            <LastMinuteOfferCard tour={tour} />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <div className="flex gap-3 mt-6">
                      <CarouselPrevious className="static translate-y-0 bg-white/20 hover:bg-white/40 text-white border-0 h-10 w-10" />
                      <CarouselNext className="static translate-y-0 bg-white/20 hover:bg-white/40 text-white border-0 h-10 w-10" />
                    </div>
                  </Carousel>
                ) : (
                  <div className="text-white/80 text-center py-8">{t('common.noOffers')}</div>
                )}
              </div>
            </div>
          </motion.div>
        </section>
      )}

      {/* Testimonials Section */}
      {homeContent.visibility?.testimonials !== false && (
        <section className="w-[100dvw] ml-[calc(50%-50dvw)] bg-muted/30 py-20 md:py-28">
          <div className="container mx-auto px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              {/* Review stats header */}
              <motion.div
                variants={fadeInUp}
                className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6"
              >
                <div>
                  <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
                    {t('testimonials.badge')}
                  </p>
                  <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
                    {t('testimonials.title')}
                  </h2>
                </div>
                <div className="flex items-center gap-6 bg-card rounded-2xl px-6 py-4 border border-border/40 shadow-sm shrink-0">
                  <div className="text-center">
                    <p className="font-headline text-3xl font-bold text-foreground">4.9</p>
                    <div className="flex mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('testimonials.overallRating')}
                    </p>
                  </div>
                  <div className="w-px h-12 bg-border" />
                  <div className="text-center">
                    <p className="font-headline text-3xl font-bold text-foreground">2k+</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('testimonials.reviewCount')}
                    </p>
                  </div>
                  <div className="w-px h-12 bg-border" />
                  <div className="text-center">
                    <p className="font-headline text-3xl font-bold text-foreground">98%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('testimonials.satisfaction')}
                    </p>
                  </div>
                </div>
              </motion.div>

              {testimonials.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8 }}
                >
                  <Carousel
                    opts={{
                      align: 'start',
                      loop: true,
                    }}
                    className="w-full"
                  >
                    <CarouselContent className="-ml-4 pb-4">
                      {testimonials.map((testimonial, index) => (
                        <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3 pl-4">
                          <div className="p-1 h-full">
                            <Card className="p-8 h-full relative border-border/40 shadow-lg hover:shadow-xl transition-shadow duration-300 bg-card">
                              <CardContent className="p-0 h-full flex flex-col">
                                <div className="flex mb-6">
                                  {[...Array(testimonial.rating)].map((_, i) => (
                                    <Star
                                      key={i}
                                      className="h-5 w-5 text-amber-400 fill-amber-400"
                                    />
                                  ))}
                                </div>
                                <p className="text-muted-foreground mb-8 flex-grow italic text-lg leading-relaxed">
                                  &ldquo;{testimonial.content}&rdquo;
                                </p>
                                <div className="flex items-center gap-4 mt-auto pt-6 border-t border-border/30">
                                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                                    <AvatarImage
                                      src={testimonial.avatar}
                                      alt={testimonial.name}
                                      data-ai-hint="person portrait"
                                    />
                                    <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-bold text-foreground">{testimonial.name}</p>
                                    <p className="text-sm text-primary font-medium">
                                      {testimonial.role}
                                    </p>
                                  </div>
                                </div>
                                <Quote className="absolute top-8 right-8 h-12 w-12 text-primary/5 rotate-180" />
                              </CardContent>
                            </Card>
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <div className="flex justify-center gap-4 mt-10">
                      <CarouselPrevious className="static translate-y-0 h-12 w-12 border-primary/20 hover:bg-primary/5 hover:border-primary hover:text-primary transition-all" />
                      <CarouselNext className="static translate-y-0 h-12 w-12 border-primary/20 hover:bg-primary/5 hover:border-primary hover:text-primary transition-all" />
                    </div>
                  </Carousel>
                </motion.div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {t('common.noTestimonials')}
                </div>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* Video Section */}
      {homeContent.visibility?.videoSection !== false && (
        <section className="relative py-24 md:py-40 text-white overflow-hidden">
          <div className="absolute inset-0 bg-black/50 z-10" />
          <motion.div
            initial={{ scale: 1.1 }}
            whileInView={{ scale: 1 }}
            transition={{ duration: 10, ease: 'linear' }}
            className="absolute inset-0"
          >
            <Image
              src={
                homeContent.videoSection.backgroundImageUrl ||
                'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'
              }
              alt={homeContent.videoSection.title}
              fill
              style={{ objectFit: 'cover' }}
              className="object-cover"
              sizes="100vw"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              data-ai-hint="video section background"
            />
          </motion.div>

          <div className="container mx-auto px-4 relative z-20 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <motion.p
                variants={fadeInUp}
                className="text-primary font-bold tracking-widest uppercase text-sm"
              >
                {homeContent.videoSection.pretitle}
              </motion.p>
              <motion.h2
                variants={fadeInUp}
                className="font-headline text-4xl md:text-6xl font-bold mb-10 leading-tight max-w-4xl mx-auto drop-shadow-xl"
              >
                {homeContent.videoSection.title}
              </motion.h2>
              <motion.div
                variants={fadeInUp}
                className="flex flex-col sm:flex-row justify-center items-center gap-6"
              >
                {homeContent.videoSection.button1Text && (
                  <Button
                    size="lg"
                    className="h-14 px-8 text-lg rounded-full shadow-xl hover:scale-105 transition-transform"
                    asChild={!!homeContent.videoSection.button1Link}
                  >
                    {homeContent.videoSection.button1Link ? (
                      <Link href={homeContent.videoSection.button1Link}>
                        {homeContent.videoSection.button1Text}{' '}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    ) : (
                      <span>
                        {homeContent.videoSection.button1Text}{' '}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </span>
                    )}
                  </Button>
                )}
                {homeContent.videoSection.button2Text && (
                  <Button
                    variant="ghost"
                    className="text-white text-lg font-semibold hover:text-primary hover:bg-white/10 h-14 px-8 rounded-full group transition-all"
                    asChild={!!homeContent.videoSection.button2Link}
                  >
                    {homeContent.videoSection.button2Link ? (
                      <Link href={homeContent.videoSection.button2Link}>
                        <PlayCircle className="mr-3 h-10 w-10 text-primary group-hover:scale-110 transition-transform" />
                        {homeContent.videoSection.button2Text}
                      </Link>
                    ) : (
                      <span>
                        <PlayCircle className="mr-3 h-10 w-10 text-primary group-hover:scale-110 transition-transform" />
                        {homeContent.videoSection.button2Text}
                      </span>
                    )}
                  </Button>
                )}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* News & Articles Section */}
      {homeContent.visibility?.newsSection !== false && (
        <section className="container mx-auto px-4 py-12 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
              <div>
                <motion.p
                  variants={fadeInUp}
                  className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm"
                >
                  {homeContent.newsSection.pretitle}
                </motion.p>
                <motion.h2
                  variants={fadeInUp}
                  className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2"
                >
                  {homeContent.newsSection.title}
                </motion.h2>
              </div>
              <motion.div variants={fadeInUp}>
                <Button
                  variant="outline"
                  className="border-primary/20 hover:border-primary text-foreground hover:text-primary hover:bg-primary/5 rounded-full"
                  asChild
                >
                  <Link href="/blog">
                    {t('news.viewAll')} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>
            </div>

            {articles.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Featured article - takes 3 cols */}
                {articles[0] && (
                  <motion.div variants={fadeInUp} className="lg:col-span-3">
                    <Link href={`/blog/${articles[0].slug}`} className="group block h-full">
                      <Card className="overflow-hidden h-full border-border/40 shadow-lg hover:shadow-2xl transition-all duration-300">
                        <div className="relative h-64 md:h-80 overflow-hidden">
                          {articles[0].featuredImage ? (
                            <Image
                              src={articles[0].featuredImage}
                              alt={articles[0].title}
                              fill
                              style={{ objectFit: 'cover' }}
                              className="transition-transform duration-700 group-hover:scale-110"
                              sizes="(max-width: 768px) 100vw, 60vw"
                              placeholder="blur"
                              blurDataURL={BLUR_DATA_URL}
                            />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-muted to-muted/40" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                          <div className="absolute bottom-0 left-0 p-6">
                            {articles[0].tags && articles[0].tags.length > 0 && (
                              <span className="inline-block bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full mb-3">
                                {articles[0].tags[0]}
                              </span>
                            )}
                            <h3 className="font-headline text-2xl font-bold text-white group-hover:text-primary/90 transition-colors line-clamp-2">
                              {articles[0].title}
                            </h3>
                            <div className="flex items-center gap-2 text-white/70 text-xs mt-2">
                              <Calendar className="h-3 w-3" />
                              {new Date(articles[0].createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                )}

                {/* Smaller articles - takes 2 cols */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  {articles.slice(1, homeContent.newsSection.count || 3).map((article, index) => (
                    <motion.div key={article.id || index} variants={fadeInUp} className="flex-1">
                      <Link href={`/blog/${article.slug}`} className="group block h-full">
                        <Card className="overflow-hidden h-full border-border/40 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-row md:flex-col lg:flex-row">
                          <div className="relative w-36 md:w-full md:h-44 lg:w-36 lg:h-auto shrink-0 overflow-hidden rounded-l-lg md:rounded-t-lg md:rounded-bl-none lg:rounded-l-lg lg:rounded-tr-none">
                            {article.featuredImage ? (
                              <Image
                                src={article.featuredImage}
                                alt={article.title}
                                fill
                                style={{ objectFit: 'cover' }}
                                className="transition-transform duration-700 group-hover:scale-110"
                                sizes="144px"
                                placeholder="blur"
                                blurDataURL={BLUR_DATA_URL}
                              />
                            ) : (
                              <div className="h-full w-full bg-gradient-to-br from-muted to-muted/40" />
                            )}
                          </div>
                          <CardContent className="p-4 flex flex-col justify-between flex-1">
                            <div>
                              {article.tags && article.tags.length > 0 && (
                                <span className="inline-block bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full mb-2">
                                  {article.tags[0]}
                                </span>
                              )}
                              <h3 className="font-headline text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                {article.title}
                              </h3>
                            </div>
                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                                <Calendar className="h-3 w-3" />
                                {new Date(article.createdAt).toLocaleDateString()}
                              </div>
                              <span className="text-primary text-xs font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                {t('news.readMore')} <ChevronRight className="h-3 w-3" />
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                {t('common.noArticles')}
              </div>
            )}
          </motion.div>
        </section>
      )}

      {/* ─── Highlights Gallery ─── */}
      {tours.length > 0 && !isHotelOnly && (
        <section className="container mx-auto px-4 py-12 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-10"
          >
            <motion.p
              variants={fadeInUp}
              className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm"
            >
              {t('gallery.pretitle')}
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2"
            >
              {t('gallery.title')}
            </motion.h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            {tours
              .flatMap((tour) => tour.images)
              .filter(Boolean)
              .slice(0, 7)
              .map((img, i) => (
                <motion.div
                  key={i}
                  variants={fadeInUp}
                  className={cn(
                    'relative rounded-2xl overflow-hidden group cursor-pointer',
                    i === 0 ? 'col-span-2 row-span-2 h-80 md:h-auto' : 'h-40 md:h-48'
                  )}
                >
                  <Image
                    src={img}
                    alt={`Gallery ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    style={{ objectFit: 'cover' }}
                    className="transition-transform duration-700 group-hover:scale-110"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-white drop-shadow-lg" />
                  </div>
                </motion.div>
              ))}
          </motion.div>
        </section>
      )}

      {/* ─── FAQ ─── */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-3xl mx-auto"
        >
          <motion.div variants={fadeInUp} className="text-center mb-10">
            <p className="text-primary font-bold tracking-wide uppercase text-xs md:text-sm">
              {t('faq.pretitle')}
            </p>
            <h2 className="font-headline text-3xl md:text-5xl font-bold text-foreground mt-2">
              {t('faq.title')}
            </h2>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Accordion type="single" collapsible className="space-y-4">
              {[
                { q: t('faq.q1'), a: t('faq.a1') },
                { q: t('faq.q2'), a: t('faq.a2') },
                { q: t('faq.q3'), a: t('faq.a3') },
                { q: t('faq.q4'), a: t('faq.a4') },
                { q: t('faq.q5'), a: t('faq.a5') },
              ].map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border border-border/40 rounded-2xl px-6 bg-card shadow-sm hover:shadow-md transition-shadow"
                >
                  <AccordionTrigger className="font-semibold text-foreground text-left py-5 hover:no-underline hover:text-primary transition-colors">
                    <span className="flex items-center gap-3">
                      <HelpCircle className="h-5 w-5 text-primary shrink-0" />
                      {item.q}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed pb-5 pl-8">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Help CTA Banner ─── */}
      <section className="w-[100dvw] ml-[calc(50%-50dvw)] bg-gradient-to-r from-primary via-primary/90 to-accent py-16 md:py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <motion.div variants={fadeInUp} className="text-center md:text-left">
            <p className="text-primary-foreground/80 font-semibold uppercase tracking-wider text-sm mb-2">
              {t('cta.pretitle')}
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold text-primary-foreground leading-tight">
              {t('cta.title')}
            </h2>
            <p className="text-primary-foreground/80 mt-3 max-w-md">{t('cta.subtitle')}</p>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row gap-3 w-full md:w-auto min-w-[320px]"
          >
            <Input
              placeholder={t('cta.inputPlaceholder')}
              className="bg-white/15 border-white/30 text-primary-foreground placeholder:text-primary-foreground/60 focus-visible:ring-white rounded-full h-12"
            />
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full h-12 px-8 font-bold shadow-lg shrink-0"
              onClick={() => router.push('/contact')}
            >
              {t('cta.button')}
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Partner Logos ─── */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-center mb-8"
        >
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
            {t('partners.title')}
          </p>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="flex flex-wrap items-center justify-center gap-8 md:gap-12"
        >
          {['TripAdvisor', 'Viator', 'Booking.com', 'Airbnb', 'Expedia', 'GetYourGuide'].map(
            (partner, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="flex items-center justify-center px-6 py-3 rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 group"
              >
                <span className="font-bold text-lg text-muted-foreground group-hover:text-primary transition-colors tracking-tight">
                  {partner}
                </span>
              </motion.div>
            )
          )}
        </motion.div>
      </section>

      {/* H4.1 — Floating Check Availability bottom bar (mobile, hotel mode only) */}
      {isSingleHotel && homeContent.visibility?.hero !== false && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex items-center gap-3">
          <Button
            className="flex-1 rounded-full font-bold shadow-lg"
            onClick={() =>
              document.getElementById('hero-search')?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            {t('hero.checkAvailability')}
          </Button>
        </div>
      )}
    </div>
  );
}
