'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listActiveTiers } from '@/lib/supabase/room-pricing-rules';
import type { RoomPricingTier } from '@/types';

type Props =
  | {
      /** Pre-fetched (server-side) tiers — preferred when available. */
      tiers: RoomPricingTier[];
      agencyId?: undefined;
      hotelId?: undefined;
      roomTypeId?: undefined;
      currentTierId?: string | null;
      className?: string;
    }
  | {
      tiers?: undefined;
      agencyId: string;
      hotelId?: string | null;
      roomTypeId?: string | null;
      currentTierId?: string | null;
      className?: string;
    };

/**
 * Renders the active stay-length pricing tiers as a compact rail. When
 * `currentTierId` matches one of the rows the row is highlighted.
 *
 * The component renders nothing when no tiers apply, so it can be dropped
 * into a layout without a guard at the call site.
 */
export function TierLadder(props: Props) {
  const [loadedTiers, setLoadedTiers] = useState<RoomPricingTier[] | null>(props.tiers ?? null);

  useEffect(() => {
    if (props.tiers !== undefined) return;
    let cancelled = false;
    void listActiveTiers({
      agencyId: props.agencyId,
      hotelId: props.hotelId ?? null,
      roomTypeId: props.roomTypeId ?? null,
    })
      .then((rows) => {
        if (!cancelled) setLoadedTiers(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadedTiers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [props.tiers, props.agencyId, props.hotelId, props.roomTypeId]);

  const tiers = loadedTiers ?? [];
  if (tiers.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground',
        props.className
      )}
      role="group"
      aria-label="Stay-length discounts"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground/70">
        <Sparkles className="h-3 w-3 text-primary" />
        Stay longer, save more
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {tiers.map((tier) => {
          const isCurrent = props.currentTierId === tier.id;
          return (
            <li
              key={tier.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                isCurrent
                  ? 'bg-green-100 text-green-700 ring-1 ring-green-500/40 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-background'
              )}
            >
              {isCurrent ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : null}
              <span className="font-medium">
                Stay {tier.minNights}+ night{tier.minNights === 1 ? '' : 's'}
              </span>
              <span aria-hidden>→</span>
              <span>save {Math.round(tier.discountPercent)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
