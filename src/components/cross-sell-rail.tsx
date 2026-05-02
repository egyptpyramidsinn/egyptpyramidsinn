'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/hooks/use-currency';
import { getRoomDetailHref, type HotelLinkContext } from '@/lib/routing/hotel-links';
import {
  getRelatedRooms,
  getRoomsForTourDate,
  getToursOverlappingStay,
} from '@/lib/supabase/cross-sell';
import type { RoomType, Tour } from '@/types';

export type CrossSellContext =
  | {
      kind: 'room-stay';
      agencyId: string;
      hotelId?: string;
      hotelSlug?: string;
      checkIn: string;
      checkOut: string;
    }
  | {
      kind: 'tour-date';
      agencyId: string;
      hotelId?: string;
      date: string;
      hotelLinkContext?: HotelLinkContext;
      hotelSlugLookup?: Record<string, string>;
    }
  | {
      kind: 'room-related';
      agencyId: string;
      hotelId: string;
      hotelSlug?: string;
      excludeRoomTypeId: string;
      hotelLinkContext?: HotelLinkContext;
    };

type Card =
  | {
      kind: 'tour';
      id: string;
      name: string;
      image: string | null;
      price: number | null;
      href: string;
    }
  | {
      kind: 'room';
      id: string;
      name: string;
      image: string | null;
      price: number | null;
      href: string;
    };

const HEADINGS: Record<CrossSellContext['kind'], string> = {
  'room-stay': 'Complete your trip',
  'tour-date': 'Where to stay',
  'room-related': 'You may also like',
};

function tourMinPrice(tour: Tour): number | null {
  const tiers = tour.priceTiers ?? [];
  if (tiers.length === 0) return null;
  const mins = tiers.map((t) => t.pricePerAdult).filter((n) => Number.isFinite(n) && n > 0);
  return mins.length === 0 ? null : Math.min(...mins);
}

function tourCard(tour: Tour): Card {
  return {
    kind: 'tour',
    id: tour.id,
    name: tour.name,
    image: tour.images?.[0] ?? null,
    price: tourMinPrice(tour),
    href: `/tours/${tour.slug}`,
  };
}

function roomCard(room: RoomType, hotelSlug: string | null, ctx: HotelLinkContext): Card {
  const href = hotelSlug ? getRoomDetailHref(ctx, hotelSlug, room.slug) : `/rooms/${room.slug}`;
  return {
    kind: 'room',
    id: room.id,
    name: room.name,
    image: room.images?.[0] ?? null,
    price: room.basePricePerNight ?? null,
    href,
  };
}

export function CrossSellRail({ context }: { context: CrossSellContext }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const { format: formatPrice } = useCurrency();

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<Card[]> {
      if (context.kind === 'room-stay') {
        const tours = await getToursOverlappingStay({
          agencyId: context.agencyId,
          checkIn: context.checkIn,
          checkOut: context.checkOut,
          limit: 6,
        });
        return tours.map(tourCard);
      }
      if (context.kind === 'tour-date') {
        const rooms = await getRoomsForTourDate({
          agencyId: context.agencyId,
          hotelId: context.hotelId,
          date: context.date,
          limit: 6,
        });
        return rooms.map((r) =>
          roomCard(
            r,
            context.hotelSlugLookup?.[r.hotelId] ?? null,
            context.hotelLinkContext ?? null
          )
        );
      }
      const rooms = await getRelatedRooms({
        agencyId: context.agencyId,
        hotelId: context.hotelId,
        excludeRoomTypeId: context.excludeRoomTypeId,
        limit: 4,
      });
      return rooms.map((r) =>
        roomCard(r, context.hotelSlug ?? null, context.hotelLinkContext ?? null)
      );
    }

    void load()
      .then((rows) => {
        if (!cancelled) setCards(rows);
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });

    return () => {
      cancelled = true;
    };
    // Stringify context to keep effect stable across re-renders.
  }, [context]);

  if (cards === null) return null;
  if (cards.length === 0) return null;

  const heading = HEADINGS[context.kind];

  return (
    <section aria-labelledby="cross-sell-heading" className="space-y-3">
      <h2 id="cross-sell-heading" className="text-base font-semibold tracking-tight">
        {heading}
      </h2>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {cards.map((card) => (
          <article
            key={`${card.kind}-${card.id}`}
            className="snap-start shrink-0 basis-64 overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
          >
            <Link href={card.href} className="block">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                {card.image ? (
                  <Image
                    src={card.image}
                    alt={card.name}
                    fill
                    sizes="256px"
                    className="object-cover transition-transform duration-300 hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
            <div className="space-y-2 p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{card.name}</p>
              <div className="grid gap-2">
                <span className="min-h-5 break-words text-sm text-muted-foreground">
                  {card.price != null
                    ? `${card.kind === 'room' ? 'From ' : ''}${formatPrice(card.price)}${
                        card.kind === 'room' ? ' / night' : ''
                      }`
                    : ''}
                </span>
                <Button asChild size="sm" variant="secondary" className="h-11 w-full px-2 text-xs">
                  <Link href={card.href}>
                    {card.kind === 'tour' ? 'Add tour' : 'View'}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
