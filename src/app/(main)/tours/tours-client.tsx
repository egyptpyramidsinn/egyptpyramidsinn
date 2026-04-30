'use client';

import type { Tour } from '@/types';
import { TourCard, type TourAvailabilityStatus } from '@/components/tour-card';

interface ToursClientProps {
  tours: Tour[];
  availabilityStatusByTourId?: Record<string, TourAvailabilityStatus>;
  compareEnabled?: boolean;
  selectedCompareIds?: string[];
  onToggleCompare?: (tourId: string) => void;
  compareLimit?: number;
}

export function ToursClient({
  tours,
  availabilityStatusByTourId,
  compareEnabled = false,
  selectedCompareIds = [],
  onToggleCompare,
  compareLimit = 3,
}: ToursClientProps) {
  const limitReached = selectedCompareIds.length >= compareLimit;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {tours.map((tour) => {
        const selected = selectedCompareIds.includes(tour.id);
        return (
          <TourCard
            key={tour.id}
            tour={tour}
            availabilityStatus={availabilityStatusByTourId?.[tour.id]}
            compareEnabled={compareEnabled}
            compareSelected={selected}
            onToggleCompare={onToggleCompare}
            compareDisabled={limitReached}
          />
        );
      })}
    </div>
  );
}
