'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BedDouble, CheckCircle2, Maximize2, Users } from 'lucide-react';
import type { RoomType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/hooks/use-currency';
import { useLanguage } from '@/hooks/use-language';
import { BLUR_DATA_URL } from '@/lib/blur-data-url';
import { getRoomDetailHref } from '@/lib/routing/hotel-links';

interface RoomsGridProps {
  rooms: RoomType[];
  hotelSlug: string;
  singleHotelMode?: boolean | null;
  emptyLabel?: string;
  className?: string;
}

export function RoomsGrid({
  rooms,
  hotelSlug,
  singleHotelMode,
  emptyLabel,
  className,
}: RoomsGridProps) {
  const { format } = useCurrency();
  const { t } = useLanguage();

  if (!rooms || rooms.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
        {emptyLabel ?? 'No rooms available.'}
      </div>
    );
  }

  const ctx = { singleHotelMode };

  return (
    <div className={className ?? 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'}>
      {rooms.map((room) => {
        const href = getRoomDetailHref(ctx, hotelSlug, room.slug);
        const beds = room.beds && typeof room.beds === 'object' ? room.beds : null;
        const bedSummary = beds
          ? Object.entries(beds as Record<string, unknown>)
              .filter(([, count]) => typeof count === 'number' && (count as number) > 0)
              .map(([type, count]) => `${count} ${type}`)
              .join(', ')
          : '';
        const capacity = (room.maxAdults ?? 0) + (room.maxChildren ?? 0);

        return (
          <Card
            key={room.id}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <Link href={href} className="block">
              <div className="relative aspect-[16/10] w-full overflow-hidden">
                {room.images && room.images.length > 0 ? (
                  <Image
                    src={room.images[0]}
                    alt={room.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                    <BedDouble className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            </Link>

            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <h3 className="font-headline text-lg font-bold leading-snug">
                <Link
                  href={href}
                  className="line-clamp-2 transition-colors hover:text-primary"
                  title={room.name}
                >
                  {room.name}
                </Link>
              </h3>

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {capacity > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary/70" />
                    {t('home.upTo')} {capacity} {t('home.guests')}
                  </span>
                )}
                {room.sizeSqm != null && (
                  <span className="flex items-center gap-1.5">
                    <Maximize2 className="h-4 w-4 text-primary/70" />
                    {room.sizeSqm} m²
                  </span>
                )}
                {bedSummary && (
                  <span className="flex items-center gap-1.5">
                    <BedDouble className="h-4 w-4 text-primary/70" />
                    {bedSummary}
                  </span>
                )}
              </div>

              {room.highlights && room.highlights.length > 0 && (
                <ul className="space-y-1">
                  {room.highlights.slice(0, 3).map((highlight, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="line-clamp-1">{highlight}</span>
                    </li>
                  ))}
                </ul>
              )}

              {room.basePricePerNight != null && (
                <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3">
                  <span className="text-xs font-medium uppercase text-muted-foreground">From</span>
                  <span className="min-w-0 break-words text-right text-sm font-semibold text-primary">
                    {format(room.basePricePerNight)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      / {t('home.night')}
                    </span>
                  </span>
                </div>
              )}

              <Button asChild size="sm" className="mt-1 h-11 rounded-full font-semibold">
                <Link href={href}>
                  {t('hotel.viewDetails') || 'View details'}{' '}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
