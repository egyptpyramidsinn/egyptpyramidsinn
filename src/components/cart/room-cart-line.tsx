'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/hooks/use-currency';
import { getRoomDetailHref, type HotelLinkContext } from '@/lib/routing/hotel-links';
import type { RoomCartItem } from '@/types';

type Variant = 'cart' | 'summary';

export type RoomCartLineProps = {
  item: RoomCartItem;
  /** Hotel display name resolved by the parent (optional). */
  hotelName?: string;
  /** Hotel slug used to build the edit href. */
  hotelSlug?: string;
  /** Routing context (single-hotel mode flag). */
  linkContext?: HotelLinkContext;
  variant?: Variant;
  onRemove?: (lineId: string) => void;
};

function formatRange(checkIn: string, checkOut: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(checkIn)} → ${fmt(checkOut)}`;
}

function describeGuests(item: RoomCartItem): string {
  const parts = [`${item.adults} adult${item.adults === 1 ? '' : 's'}`];
  if (item.children > 0) {
    parts.push(`${item.children} child${item.children === 1 ? '' : 'ren'}`);
  }
  if (item.unitsBooked > 1) {
    parts.push(`${item.unitsBooked} rooms`);
  }
  return parts.join(' · ');
}

export function RoomCartLine({
  item,
  hotelName,
  hotelSlug,
  linkContext,
  variant = 'cart',
  onRemove,
}: RoomCartLineProps) {
  const { format: formatPrice } = useCurrency();
  const imageSrc = item.image || '/placeholder.png';
  const stayCost = item.pricePerNightAvg * item.nights * item.unitsBooked;
  const addonsTotal = item.addons.reduce((acc, a) => acc + a.unitPrice * a.quantity, 0);
  const editHref = hotelSlug ? getRoomDetailHref(linkContext, hotelSlug, item.roomSlug) : null;

  if (variant === 'summary') {
    return (
      <div className="rounded-2xl border bg-background p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border">
            <Image src={imageSrc} alt={item.name} fill className="object-cover" sizes="48px" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-semibold leading-snug">{item.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatRange(item.checkInDate, item.checkOutDate)} · {item.nights} night
              {item.nights === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-muted-foreground">{describeGuests(item)}</p>
            {item.addons.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                + {item.addons.length} add-on{item.addons.length === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 break-words text-right font-semibold text-primary">
          {formatPrice(item.subtotal)}
        </p>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-lg">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-stretch sm:gap-5">
        <div className="relative h-44 w-full overflow-hidden rounded-2xl border sm:h-32 sm:w-44">
          <Image
            src={imageSrc}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 176px"
          />
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-lg font-semibold leading-snug">{item.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Room</Badge>
                {hotelName ? <Badge variant="outline">{hotelName}</Badge> : null}
                {item.unitsBooked > 1 ? (
                  <Badge variant="outline">{item.unitsBooked} rooms</Badge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-start">
              <p className="break-words text-lg font-semibold text-primary">
                {formatPrice(item.subtotal)}
              </p>
              {onRemove ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(item.lineId)}
                  aria-label="Remove room"
                >
                  <Trash2 className="h-5 w-5 text-destructive" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">Stay</p>
              <p className="text-sm font-medium">
                {formatRange(item.checkInDate, item.checkOutDate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.nights} night{item.nights === 1 ? '' : 's'}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">Guests</p>
              <p className="text-sm font-medium">{describeGuests(item)}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-background/50 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 break-words text-muted-foreground">
                {formatPrice(item.pricePerNightAvg)} × {item.nights} night
                {item.nights === 1 ? '' : 's'}
                {item.unitsBooked > 1 ? ` × ${item.unitsBooked} rooms` : ''}
              </span>
              <span className="shrink-0 break-words text-right font-medium">
                {formatPrice(stayCost)}
              </span>
            </div>
            {item.tier && item.tier.amount > 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <Badge
                  variant="outline"
                  className="border-green-500/40 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                >
                  −{Math.round(item.tier.discountPercent)}% stay-length
                </Badge>
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  −{formatPrice(item.tier.amount)}
                </span>
              </div>
            ) : null}
            {item.addons.length > 0 ? (
              <div className="mt-2 space-y-1 border-t pt-2">
                {item.addons.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs"
                  >
                    <span className="min-w-0 flex-1 break-words text-muted-foreground">
                      {a.name} · {a.quantity} × {formatPrice(a.unitPrice)}
                    </span>
                    <span className="shrink-0 break-words text-right font-medium">
                      {formatPrice(a.unitPrice * a.quantity)}
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs font-medium">
                  <span className="min-w-0 flex-1 text-muted-foreground">Add-ons subtotal</span>
                  <span className="shrink-0 break-words text-right">
                    {formatPrice(addonsTotal)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {editHref ? (
            <div className="flex items-center justify-end">
              <Button asChild variant="outline" size="sm">
                <Link href={editHref}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit dates &amp; guests
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
