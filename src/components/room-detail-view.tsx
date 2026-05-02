'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import type { DateRange, DayContentProps } from 'react-day-picker';
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
  View as ViewIcon,
} from 'lucide-react';

import type {
  Hotel,
  RoomAddon,
  RoomAvailabilityNight,
  RoomAvailabilityNightStatus,
  RoomCartAddon,
  RoomPriceQuote,
  RoomType,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BLUR_DATA_URL } from '@/lib/blur-data-url';
import { cn } from '@/lib/utils';
import { getHotelDetailHref } from '@/lib/routing/hotel-links';
import { getRoomAvailabilityRange, getRoomPriceQuoteAction } from '@/lib/supabase/room-pricing';
import { useCart } from '@/hooks/use-cart';
import { useCurrency } from '@/hooks/use-currency';
import { TierLadder } from '@/components/tier-ladder';
import { HoldTimer } from '@/components/hold-timer';
import { CrossSellRail, type CrossSellContext } from '@/components/cross-sell-rail';

interface RoomDetailViewProps {
  room: RoomType;
  hotel: Hotel;
  addons: RoomAddon[];
  singleHotelMode?: boolean | null;
}

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quote: RoomPriceQuote }
  | { status: 'unavailable'; quote: RoomPriceQuote }
  | { status: 'error'; code: string; message: string };

const QUOTE_DEBOUNCE_MS = 300;
const AVAILABILITY_DEBOUNCE_MS = 200;
const AVAILABILITY_CACHE_TTL_MS = 60_000;
const AVAILABILITY_WINDOW_DAYS = 90;
const PRICE_CHIP_DELTA_PCT = 0.01;

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffNights(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function describeQuoteError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    const maybeCode = (err as Error & { code?: unknown }).code;
    const code = typeof maybeCode === 'string' ? maybeCode : 'UNKNOWN';
    return { code, message: err.message };
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return {
      code: (err as { code: string }).code,
      message: (err as { message: string }).message,
    };
  }
  return { code: 'UNKNOWN', message: 'Could not load price for the selected dates.' };
}

export function RoomDetailView({ room, hotel, addons, singleHotelMode }: RoomDetailViewProps) {
  const { addRoomItem, cartSessionId, refreshRoomHold, items: cartItemsAll } = useCart();
  const { format: formatMoney } = useCurrency();

  const ctx = { singleHotelMode };
  const backHref = getHotelDetailHref(ctx, hotel.slug);

  const beds = room.beds && typeof room.beds === 'object' ? room.beds : null;
  const bedSummary = beds
    ? Object.entries(beds as Record<string, unknown>)
        .filter(([, count]) => typeof count === 'number' && (count as number) > 0)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ')
    : '';

  const images = useMemo(
    () => (Array.isArray(room.images) ? room.images.filter(Boolean) : []),
    [room.images]
  );

  const maxUnits = Math.max(1, room.defaultUnits ?? 1);

  // ── Booking inputs ──
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [adults, setAdults] = useState<number>(1);
  const [childrenCount, setChildrenCount] = useState<number>(0);
  const [units, setUnits] = useState<number>(1);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Coerce guest counts down when units decrease.
  useEffect(() => {
    setAdults((a) => Math.min(Math.max(1, a), Math.max(1, room.maxAdults * units)));
    setChildrenCount((c) => Math.min(Math.max(0, c), Math.max(0, room.maxChildren * units)));
  }, [units, room.maxAdults, room.maxChildren]);

  const checkInStr = range?.from ? toLocalDateStr(range.from) : null;
  const checkOutStr = range?.to ? toLocalDateStr(range.to) : null;
  const nightsRequested = range?.from && range?.to ? diffNights(range.from, range.to) : 0;

  // ── Live price quote ──
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!checkInStr || !checkOutStr || nightsRequested < 1) {
      setQuote({ status: 'idle' });
      return;
    }
    const myReqId = ++reqIdRef.current;
    setQuote({ status: 'loading' });

    const handle = setTimeout(() => {
      void getRoomPriceQuoteAction({
        roomTypeId: room.id,
        checkIn: checkInStr,
        checkOut: checkOutStr,
        adults,
        children: childrenCount,
        units,
        excludeSessionId: cartSessionId !== 'ssr' ? cartSessionId : undefined,
      })
        .then((q) => {
          if (reqIdRef.current !== myReqId) return;
          setQuote(
            q.isAvailable ? { status: 'ok', quote: q } : { status: 'unavailable', quote: q }
          );
        })
        .catch((err: unknown) => {
          if (reqIdRef.current !== myReqId) return;
          setQuote({ status: 'error', ...describeQuoteError(err) });
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [
    room.id,
    checkInStr,
    checkOutStr,
    adults,
    childrenCount,
    units,
    nightsRequested,
    cartSessionId,
  ]);

  // ── Addons ──
  const selectedAddons: RoomCartAddon[] = useMemo(
    () =>
      addons
        .map((a) => ({
          id: a.id,
          name: a.name,
          unitPrice: Number(a.price),
          quantity: addonQty[a.id] ?? 0,
          currency: a.currency,
        }))
        .filter((a) => a.quantity > 0),
    [addons, addonQty]
  );

  const addonsTotal = useMemo(
    () => selectedAddons.reduce((acc, a) => acc + a.unitPrice * a.quantity, 0),
    [selectedAddons]
  );

  const stayQuote = quote.status === 'ok' || quote.status === 'unavailable' ? quote.quote : null;
  const total = (stayQuote?.subtotal ?? 0) + addonsTotal;
  const maxAdultsForUnits = Math.max(1, room.maxAdults * units);
  const maxChildrenForUnits = Math.max(0, room.maxChildren * units);
  const availabilityHelper = `${maxUnits} room${maxUnits === 1 ? '' : 's'} available`;
  const capacityHelper =
    maxChildrenForUnits > 0
      ? `Capacity for ${maxAdultsForUnits} adult${maxAdultsForUnits === 1 ? '' : 's'} and ${maxChildrenForUnits} child${maxChildrenForUnits === 1 ? '' : 'ren'}.`
      : `Capacity for ${maxAdultsForUnits} adult${maxAdultsForUnits === 1 ? '' : 's'}.`;

  const errorMessage = useMemo<string | null>(() => {
    if (quote.status === 'error') {
      switch (quote.code) {
        case 'OVER_CAPACITY':
          return 'Selected guest count exceeds this room\u2019s capacity.';
        case 'INACTIVE':
          return 'This room is not currently bookable.';
        case 'NOT_FOUND':
          return 'This room is no longer available.';
        case 'INVALID_INPUT':
          return quote.message || 'Please review your dates.';
        default:
          return quote.message || 'Could not load price for the selected dates.';
      }
    }
    if (quote.status === 'unavailable') {
      const q = quote.quote;
      if (q.minNightsViolations.length > 0) {
        const max = q.minNightsViolations.reduce((m, v) => Math.max(m, v.minNights), 0);
        return `Selected dates require a minimum stay of ${max} night${max === 1 ? '' : 's'}.`;
      }
      if (q.unavailableDates.length > 0) {
        return `${q.unavailableDates.length} night${
          q.unavailableDates.length === 1 ? '' : 's'
        } in your selection are sold out.`;
      }
      return 'This room is not available for the selected dates.';
    }
    return null;
  }, [quote]);

  const canAddToCart = quote.status === 'ok' && stayQuote != null && nightsRequested >= 1;

  const [lastAddedLineId, setLastAddedLineId] = useState<string | null>(null);

  const handleAddToCart = useCallback(() => {
    if (!canAddToCart || !stayQuote || !checkInStr || !checkOutStr) return;
    const lineId = addRoomItem({
      roomTypeId: room.id,
      hotelId: hotel.id,
      agencyId: hotel.agencyId,
      roomSlug: room.slug,
      name: room.name,
      image: images[0] ?? null,
      checkInDate: checkInStr,
      checkOutDate: checkOutStr,
      nights: stayQuote.nights,
      adults,
      children: childrenCount,
      unitsBooked: units,
      currency: stayQuote.currency,
      basePricePerNight: stayQuote.basePricePerNight,
      pricePerNightAvg: stayQuote.pricePerNightAvg,
      subtotal: stayQuote.subtotal + addonsTotal,
      subtotalBeforeTier: stayQuote.subtotalBeforeTier,
      tier: stayQuote.tier
        ? {
            id: stayQuote.tier.id,
            minNights: stayQuote.tier.minNights,
            discountPercent: stayQuote.tier.discountPercent,
            amount: stayQuote.tierDiscountAmount,
          }
        : undefined,
      addons: selectedAddons,
    });
    setLastAddedLineId(lineId);
  }, [
    canAddToCart,
    stayQuote,
    checkInStr,
    checkOutStr,
    addRoomItem,
    room.id,
    room.slug,
    room.name,
    hotel.id,
    hotel.agencyId,
    images,
    adults,
    childrenCount,
    units,
    addonsTotal,
    selectedAddons,
  ]);

  const dateLabel =
    range?.from && range?.to
      ? `${format(range.from, 'LLL dd')} – ${format(range.to, 'LLL dd, yyyy')}`
      : range?.from
        ? `${format(range.from, 'LLL dd, yyyy')} – Pick checkout`
        : 'Select dates';

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // ── Smart availability calendar ──
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(today));
  const [availability, setAvailability] = useState<Map<string, RoomAvailabilityNight>>(
    () => new Map()
  );
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const monthCacheRef = useRef<Map<string, number>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());

  const mergeAvailability = useCallback((nights: RoomAvailabilityNight[]) => {
    setAvailability((prev) => {
      const next = new Map(prev);
      for (const n of nights) next.set(n.date, n);
      return next;
    });
  }, []);

  // Fetch a 90-day window starting at the visible month's first day,
  // debounced and cached for 60s per month key.
  useEffect(() => {
    if (!calendarOpen) return;
    const key = monthKey(visibleMonth);
    const lastFetched = monthCacheRef.current.get(key);
    if (lastFetched && Date.now() - lastFetched < AVAILABILITY_CACHE_TTL_MS) return;
    if (inflightRef.current.has(key)) return;

    const handle = setTimeout(() => {
      const fromDate = startOfMonth(visibleMonth);
      const toDate = addDays(fromDate, AVAILABILITY_WINDOW_DAYS);
      inflightRef.current.add(key);
      void getRoomAvailabilityRange({
        roomTypeId: room.id,
        from: toLocalDateStr(fromDate),
        to: toLocalDateStr(toDate),
      })
        .then((res) => {
          monthCacheRef.current.set(key, Date.now());
          mergeAvailability(res.nights);
        })
        .catch((err: unknown) => {
          // Graceful degradation: log and let the dumb calendar carry on.
          // eslint-disable-next-line no-console
          console.error('[room-detail] availability fetch failed', err);
        })
        .finally(() => {
          inflightRef.current.delete(key);
        });
    }, AVAILABILITY_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [calendarOpen, visibleMonth, room.id, mergeAvailability]);

  const baseRoomPrice = room.basePricePerNight ?? null;

  const calendarModifiers = useMemo(() => {
    const soldOut: Date[] = [];
    const stopSell: Date[] = [];
    const low: Date[] = [];
    for (const night of availability.values()) {
      const [y, m, d] = night.date.split('-').map(Number);
      if (!y || !m || !d) continue;
      const date = new Date(y, m - 1, d);
      if (night.status === 'sold_out') soldOut.push(date);
      else if (night.status === 'stop_sell') stopSell.push(date);
      else if (night.status === 'low') low.push(date);
    }
    return { soldOut, stopSell, low };
  }, [availability]);

  const disabledMatchers = useMemo(
    () => [{ before: today }, ...calendarModifiers.soldOut, ...calendarModifiers.stopSell],
    [today, calendarModifiers]
  );

  const isBlockedNight = useCallback(
    (dateStr: string): RoomAvailabilityNightStatus | null => {
      const night = availability.get(dateStr);
      if (!night) return null;
      if (night.status === 'sold_out' || night.status === 'stop_sell') return night.status;
      return null;
    },
    [availability]
  );

  const handleSelectRange = useCallback(
    (next: DateRange | undefined) => {
      setCalendarError(null);
      if (!next?.from) {
        setRange(next);
        return;
      }

      // When picking a checkout, ensure no night in [from, to) is blocked.
      if (next.to) {
        const checkout = diffNights(next.from, next.to);
        const cursor = new Date(next.from);
        for (let i = 0; i < checkout; i += 1) {
          const blocked = isBlockedNight(toLocalDateStr(cursor));
          if (blocked) {
            setCalendarError(
              blocked === 'stop_sell'
                ? 'Selected range crosses a date that is not bookable. Please pick different dates.'
                : 'Selected range includes a sold-out date. Please pick different dates.'
            );
            setRange(undefined);
            return;
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        // Enforce min_nights from the first night of the stay.
        const firstNight = availability.get(toLocalDateStr(next.from));
        const requiredMin = firstNight?.minNights ?? null;
        if (typeof requiredMin === 'number' && requiredMin > 0 && checkout < requiredMin) {
          const snapped = addDays(next.from, requiredMin);
          setCalendarError(`Minimum stay ${requiredMin} nights — checkout adjusted.`);
          setRange({ from: next.from, to: snapped });
          return;
        }
      }

      setRange(next);
    },
    [availability, isBlockedNight]
  );

  const renderDayContent = useCallback(
    (props: DayContentProps) => (
      <SmartDayContent
        {...props}
        night={availability.get(toLocalDateStr(props.date))}
        basePrice={baseRoomPrice}
      />
    ),
    [availability, baseRoomPrice]
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-28 lg:pb-10">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {hotel.name}
      </Link>

      <div className="mt-4 flex flex-col gap-1">
        <h1 className="font-headline text-3xl font-bold md:text-4xl">{room.name}</h1>
        <p className="text-sm text-muted-foreground">{hotel.name}</p>
      </div>

      {/* Gallery */}
      {images.length > 0 && (
        <div className="mt-6">
          <div className="md:hidden">
            <Carousel className="w-full">
              <CarouselContent>
                {images.map((src, idx) => (
                  <CarouselItem key={`${src}-${idx}`}>
                    <div className="relative h-64 w-full overflow-hidden rounded-2xl">
                      <Image
                        src={src}
                        alt={`${room.name} ${idx + 1}`}
                        fill
                        sizes="100vw"
                        className="object-cover"
                        placeholder="blur"
                        blurDataURL={BLUR_DATA_URL}
                        priority={idx === 0}
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {images.length > 1 && (
                <>
                  <CarouselPrevious className="left-2" />
                  <CarouselNext className="right-2" />
                </>
              )}
            </Carousel>
          </div>

          <div className="hidden grid-cols-3 gap-3 md:grid">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="relative col-span-2 row-span-2 aspect-[16/10] w-full overflow-hidden rounded-2xl md:aspect-auto md:h-full"
                  aria-label="Open image gallery"
                >
                  <Image
                    src={images[0]}
                    alt={room.name}
                    fill
                    sizes="(max-width: 1024px) 66vw, 50vw"
                    className="object-cover transition-transform duration-300 hover:scale-[1.02]"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    priority
                  />
                </button>
              </DialogTrigger>
              <RoomGalleryDialog images={images} roomName={room.name} />
            </Dialog>
            {images.slice(1, 5).map((src, idx) => (
              <Dialog key={`${src}-${idx}`}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl"
                    aria-label={`Open image ${idx + 2}`}
                  >
                    <Image
                      src={src}
                      alt={`${room.name} ${idx + 2}`}
                      fill
                      sizes="33vw"
                      className="object-cover transition-transform duration-300 hover:scale-[1.02]"
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                    />
                    {idx === 3 && images.length > 5 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white">
                        <Maximize2 className="mr-1.5 h-4 w-4" /> +{images.length - 5} more
                      </div>
                    )}
                  </button>
                </DialogTrigger>
                <RoomGalleryDialog images={images} roomName={room.name} initialIndex={idx + 1} />
              </Dialog>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6 lg:col-span-2">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(room.maxAdults || room.maxChildren) > 0 && (
              <FactTile
                icon={<Users className="h-4 w-4 text-primary" />}
                label="Max guests"
                value={`${room.maxAdults} adults${
                  room.maxChildren ? ` + ${room.maxChildren} children` : ''
                }`}
              />
            )}
            {bedSummary && (
              <FactTile
                icon={<BedDouble className="h-4 w-4 text-primary" />}
                label="Beds"
                value={bedSummary}
              />
            )}
            {room.sizeSqm ? (
              <FactTile
                icon={<Maximize2 className="h-4 w-4 text-primary" />}
                label="Size"
                value={`${room.sizeSqm} m²`}
              />
            ) : null}
            {room.view ? (
              <FactTile
                icon={<ViewIcon className="h-4 w-4 text-primary" />}
                label="View"
                value={room.view}
              />
            ) : null}
          </section>

          {room.description ? (
            <section>
              <h2 className="font-headline text-xl font-semibold">About this room</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {room.description}
              </p>
            </section>
          ) : null}

          {Array.isArray(room.highlights) && room.highlights.length > 0 && (
            <section>
              <h2 className="font-headline text-xl font-semibold">Highlights</h2>
              <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {room.highlights.map((h, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(room.amenities) && room.amenities.length > 0 && (
            <section>
              <h2 className="font-headline text-xl font-semibold">Amenities</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                {room.amenities.map((a, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(room.services) && room.services.length > 0 && (
            <section>
              <h2 className="font-headline text-xl font-semibold">Services</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                {room.services.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {room.cancellationPolicy ? (
            <section>
              <h2 className="font-headline text-xl font-semibold">Cancellation policy</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {room.cancellationPolicy}
              </p>
            </section>
          ) : null}
        </div>

        {/* Right: booking panel */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {room.basePricePerNight != null ? (
                    <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                      <span className="text-sm font-normal text-muted-foreground">From</span>
                      <span className="break-words text-xl font-bold text-primary">
                        {formatMoney(Number(room.basePricePerNight))}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">/ night</span>
                    </span>
                  ) : (
                    <span>Book this room</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-1.5 block text-sm font-semibold">Dates</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !range?.from && 'text-muted-foreground'
                        )}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {dateLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <TooltipProvider delayDuration={150}>
                        <Calendar
                          mode="range"
                          selected={range}
                          onSelect={handleSelectRange}
                          numberOfMonths={1}
                          month={visibleMonth}
                          onMonthChange={setVisibleMonth}
                          defaultMonth={range?.from ?? today}
                          disabled={disabledMatchers}
                          modifiers={{
                            soldOut: calendarModifiers.soldOut,
                            stopSell: calendarModifiers.stopSell,
                            lowAvailability: calendarModifiers.low,
                          }}
                          modifiersClassNames={{
                            soldOut: 'line-through text-destructive/80 aria-disabled:opacity-100',
                            stopSell:
                              'text-muted-foreground bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,hsl(var(--muted))_3px,hsl(var(--muted))_5px)]',
                            lowAvailability:
                              'relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-amber-500',
                          }}
                          components={{ DayContent: renderDayContent }}
                          initialFocus
                        />
                      </TooltipProvider>
                      <CalendarLegend />
                    </PopoverContent>
                  </Popover>
                  {calendarError && (
                    <p
                      className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
                      role="alert"
                    >
                      {calendarError}
                    </p>
                  )}
                  {nightsRequested > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nightsRequested} night{nightsRequested === 1 ? '' : 's'}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/30 p-3">
                  <Stepper
                    label="Room quantity"
                    value={units}
                    min={1}
                    max={maxUnits}
                    onChange={setUnits}
                  />
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {availabilityHelper}. {capacityHelper}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Stepper
                    label="Adults"
                    value={adults}
                    min={1}
                    max={maxAdultsForUnits}
                    onChange={setAdults}
                  />
                  <Stepper
                    label="Children"
                    value={childrenCount}
                    min={0}
                    max={maxChildrenForUnits}
                    onChange={setChildrenCount}
                  />
                </div>

                {addons.length > 0 && (
                  <div>
                    <Label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Optional extras
                    </Label>
                    <ul className="space-y-2">
                      {addons.map((a) => {
                        const qty = addonQty[a.id] ?? 0;
                        return (
                          <li
                            key={a.id}
                            className="flex items-start justify-between gap-3 rounded-lg border p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{a.name}</p>
                              {a.description ? (
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {a.description}
                                </p>
                              ) : null}
                              <p className="mt-1 text-xs font-medium text-primary">
                                {formatMoney(Number(a.price))} {a.currency}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10"
                                onClick={() =>
                                  setAddonQty((prev) => ({
                                    ...prev,
                                    [a.id]: Math.max(0, (prev[a.id] ?? 0) - 1),
                                  }))
                                }
                                aria-label={`Decrease ${a.name}`}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-5 text-center text-sm tabular-nums">{qty}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10"
                                onClick={() =>
                                  setAddonQty((prev) => ({
                                    ...prev,
                                    [a.id]: (prev[a.id] ?? 0) + 1,
                                  }))
                                }
                                aria-label={`Increase ${a.name}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <Separator />

                <div className="space-y-1.5 text-sm">
                  {quote.status === 'loading' && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating price…
                    </p>
                  )}
                  {stayQuote && (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-muted-foreground">
                        <span className="min-w-0 flex-1 break-words">
                          {formatMoney(stayQuote.pricePerNightAvg)} × {stayQuote.nights} night
                          {stayQuote.nights === 1 ? '' : 's'}
                          {units > 1 ? ` × ${units} rooms` : ''}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-right break-words',
                            stayQuote.tier && stayQuote.subtotalBeforeTier > stayQuote.subtotal
                              ? 'line-through opacity-70'
                              : null
                          )}
                        >
                          {formatMoney(
                            stayQuote.tier ? stayQuote.subtotalBeforeTier : stayQuote.subtotal
                          )}
                        </span>
                      </div>
                      {stayQuote.tier && stayQuote.tierDiscountAmount > 0 ? (
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-green-600 dark:text-green-400">
                          <span className="min-w-0 flex-1 break-words">
                            Save {Math.round(stayQuote.tier.discountPercent)}% on your stay
                          </span>
                          <span className="shrink-0 text-right break-words">
                            −{formatMoney(stayQuote.tierDiscountAmount)}
                          </span>
                        </div>
                      ) : null}
                      {addonsTotal > 0 && (
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-muted-foreground">
                          <span className="min-w-0 flex-1">Extras</span>
                          <span className="shrink-0 text-right break-words">
                            {formatMoney(addonsTotal)}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-1 font-bold">
                        <span>Total</span>
                        <span className="break-words text-right text-lg">{formatMoney(total)}</span>
                      </div>
                      {stayQuote.perNightBreakdown.length > 0 && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setBreakdownOpen((v) => !v)}
                          aria-expanded={breakdownOpen}
                        >
                          {breakdownOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          Per-night breakdown
                        </button>
                      )}
                      {breakdownOpen && (
                        <ul className="mt-1 space-y-0.5 rounded-md bg-muted/40 p-2 text-xs">
                          {stayQuote.perNightBreakdown.map((n) => (
                            <li
                              key={n.date}
                              className={cn(
                                'grid grid-cols-[minmax(0,1fr)_auto] gap-3',
                                !n.available && 'text-destructive'
                              )}
                            >
                              <span className="min-w-0 break-words">{n.date}</span>
                              <span className="text-right break-words">
                                {formatMoney(n.price)}
                                {!n.available ? ' · sold out' : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {errorMessage && (
                    <p
                      className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                      role="alert"
                    >
                      {errorMessage}
                    </p>
                  )}
                  {quote.status === 'idle' && (
                    <p className="text-xs text-muted-foreground">
                      Pick check-in and check-out dates to see pricing.
                    </p>
                  )}
                </div>

                <TierLadder
                  agencyId={hotel.agencyId}
                  hotelId={hotel.id}
                  roomTypeId={room.id}
                  currentTierId={stayQuote?.tier?.id ?? null}
                />

                <Button
                  className="w-full rounded-full"
                  size="lg"
                  disabled={!canAddToCart}
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {canAddToCart ? 'Add to cart' : 'Select valid dates'}
                </Button>

                {lastAddedLineId
                  ? (() => {
                      const added = cartItemsAll.find(
                        (i) => i.productType === 'room' && i.lineId === lastAddedLineId
                      );
                      if (!added || added.productType !== 'room') return null;
                      return (
                        <div className="flex items-center justify-between gap-2 rounded-2xl border bg-muted/30 px-3 py-2 text-xs">
                          <span className="font-medium text-foreground">Added to cart</span>
                          <HoldTimer
                            expiresAt={added.holdExpiresAt ?? null}
                            onRefresh={() => refreshRoomHold(added.lineId)}
                            compact
                          />
                        </div>
                      );
                    })()
                  : null}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {/* Cross-sell rail: tours overlapping the chosen stay, or related rooms. */}
      <div className="mt-10">
        {(() => {
          const ctx: CrossSellContext =
            checkInStr && checkOutStr && nightsRequested >= 1
              ? {
                  kind: 'room-stay',
                  agencyId: hotel.agencyId,
                  hotelId: hotel.id,
                  checkIn: checkInStr,
                  checkOut: checkOutStr,
                }
              : {
                  kind: 'room-related',
                  agencyId: hotel.agencyId,
                  hotelId: hotel.id,
                  hotelSlug: hotel.slug,
                  excludeRoomTypeId: room.id,
                  hotelLinkContext: { singleHotelMode },
                };
          return <CrossSellRail context={ctx} />;
        })()}
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {stayQuote ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Total · {stayQuote.nights} night{stayQuote.nights === 1 ? '' : 's'}
                </p>
                <p className="truncate text-base font-bold text-primary">{formatMoney(total)}</p>
              </>
            ) : room.basePricePerNight != null ? (
              <>
                <p className="text-xs text-muted-foreground">From</p>
                <p className="truncate text-base font-bold text-primary">
                  {formatMoney(Number(room.basePricePerNight))}{' '}
                  <span className="text-xs font-normal text-muted-foreground">/ night</span>
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Pick dates to see price</p>
            )}
          </div>
          <Button onClick={handleAddToCart} size="lg" disabled={!canAddToCart} className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            {canAddToCart ? 'Add to cart' : 'Select dates'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SmartDayContent({
  date,
  displayMonth,
  night,
  basePrice,
}: DayContentProps & {
  night: RoomAvailabilityNight | undefined;
  basePrice: number | null;
}) {
  const dayLabel = format(date, 'd');
  const isOutside = date.getMonth() !== displayMonth.getMonth();

  let ariaLabel: string | undefined;
  if (night?.status === 'sold_out') ariaLabel = `${format(date, 'PPP')} — Sold out`;
  else if (night?.status === 'stop_sell') ariaLabel = `${format(date, 'PPP')} — Not available`;
  else if (night?.status === 'low') ariaLabel = `${format(date, 'PPP')} — Low availability`;

  // Show price chip in tooltip when an inventory override differs from base
  // by > 1%. This avoids cramming chips into 36px cells while still surfacing
  // per-night pricing on hover/focus.
  const override = night?.pricePerNight ?? null;
  const showPriceTooltip =
    override != null &&
    basePrice != null &&
    basePrice > 0 &&
    Math.abs(override - basePrice) / basePrice > PRICE_CHIP_DELTA_PCT;

  const tooltipParts: string[] = [];
  if (showPriceTooltip && override != null) {
    const cur = night?.currency ?? '';
    tooltipParts.push(`${cur ? `${cur} ` : ''}${override.toLocaleString()} / night`);
  }
  if (night?.minNights && night.minNights > 1) {
    tooltipParts.push(`Min ${night.minNights} nights`);
  }
  if (night?.status === 'low' && typeof night.availableUnits === 'number') {
    tooltipParts.push(
      `Only ${night.availableUnits} unit${night.availableUnits === 1 ? '' : 's'} left`
    );
  }

  const inner = (
    <span
      aria-label={ariaLabel}
      className={cn('inline-flex h-full w-full items-center justify-center', {
        'opacity-60': isOutside,
      })}
    >
      {dayLabel}
    </span>
  );

  if (tooltipParts.length === 0) return inner;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">{format(date, 'PPP')}</div>
        {tooltipParts.map((p) => (
          <div key={p} className="text-muted-foreground">
            {p}
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
      <LegendChip swatchClassName="bg-foreground/10" label="Available" />
      <LegendChip
        swatchClassName="bg-amber-500/20 ring-1 ring-amber-500/40"
        label="Low availability"
      />
      <LegendChip
        swatchClassName="bg-destructive/15 ring-1 ring-destructive/40"
        label="Sold out"
        labelClassName="line-through"
      />
      <LegendChip
        swatchClassName="bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,hsl(var(--muted))_2px,hsl(var(--muted))_4px)]"
        label="Not bookable"
      />
    </div>
  );
}

function LegendChip({
  swatchClassName,
  label,
  labelClassName,
}: {
  swatchClassName: string;
  label: string;
  labelClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded-sm', swatchClassName)} aria-hidden />
      <span className={labelClassName}>{label}</span>
    </span>
  );
}

function FactTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-semibold">{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={dec}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center text-sm tabular-nums">{value}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={inc}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function RoomGalleryDialog({
  images,
  roomName,
  initialIndex = 0,
}: {
  images: string[];
  roomName: string;
  initialIndex?: number;
}) {
  return (
    <DialogContent className="max-w-4xl p-2 sm:p-4">
      <DialogTitle className="sr-only">{roomName} gallery</DialogTitle>
      <Carousel opts={{ startIndex: initialIndex }} className="w-full">
        <CarouselContent>
          {images.map((src, idx) => (
            <CarouselItem key={`${src}-${idx}`}>
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg">
                <Image
                  src={src}
                  alt={`${roomName} ${idx + 1}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 80vw"
                  className="object-contain"
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {images.length > 1 && (
          <>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
          </>
        )}
      </Carousel>
    </DialogContent>
  );
}
