import { getTours } from '@/lib/supabase/tours';
import { ToursPageClient } from './tours-page-client';
import type { Metadata } from 'next';
import { getAgencySettings, getPageMetadata } from '@/lib/supabase/agency-content';
import {
  getToursAvailableOnDate,
  getTourDateStatusMap,
  type TourDateStatus,
} from '@/lib/supabase/tour-availability';
import { cookies } from 'next/headers';
import type { Tour } from '@/types';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const resolved = await searchParams;
  const destination = typeof resolved?.destination === 'string' ? resolved.destination : '';
  const type = typeof resolved?.type === 'string' ? resolved.type : '';

  let agencyName = '';
  try {
    const settings = await getAgencySettings();
    agencyName = settings?.data?.agencyName || '';
  } catch {
    agencyName = '';
  }
  const brand = agencyName.trim() || 'our agency';

  if (destination || type) {
    let title = 'All Tours';
    let description = 'Browse our selection of tours and travel experiences.';

    if (destination) {
      title = `${destination} Tours`;
      description = `Find the best tours in ${destination}. Book your perfect ${destination} adventure with ${brand}.`;
    } else if (type) {
      title = `${type} Tours`;
      description = `Explore our ${type} tours. Unforgettable experiences await.`;
    }

    return { title, description };
  }

  return getPageMetadata('tours', {
    title: 'Tours',
    description: 'Browse our selection of tours and travel experiences.',
  });
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

function getMinAdultPrice(tour: Tour): number {
  const prices: number[] = [];
  for (const tier of tour.priceTiers ?? []) {
    if (typeof tier?.pricePerAdult === 'number') prices.push(tier.pricePerAdult);
  }
  for (const pkg of tour.packages ?? []) {
    for (const tier of pkg.priceTiers ?? []) {
      if (typeof tier?.pricePerAdult === 'number') prices.push(tier.pricePerAdult);
    }
  }
  if (prices.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...prices);
}

function scoreTours(tours: Tour[], context: { country: string }): Tour[] {
  const country = context.country.trim().toLowerCase();
  const scored = tours.map((tour) => {
    const ratingNormalized = Math.max(0, Math.min(1, (tour.rating ?? 0) / 5));
    const popularity = 0; // reviewCount unavailable on Tour type
    const localeAffinity =
      country &&
      typeof tour.destination === 'string' &&
      tour.destination.toLowerCase().includes(country)
        ? 0.2
        : 0;
    const score = ratingNormalized * 0.6 + popularity * 0.3 + localeAffinity * 0.1;
    return { tour, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.tour);
}

function applySort(tours: Tour[], sort: string, country: string): Tour[] {
  const list = [...tours];
  switch (sort) {
    case 'price_asc':
      list.sort((a, b) => getMinAdultPrice(a) - getMinAdultPrice(b));
      return list;
    case 'price_desc':
      list.sort((a, b) => getMinAdultPrice(b) - getMinAdultPrice(a));
      return list;
    case 'duration_asc':
      list.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
      return list;
    case 'duration_desc':
      list.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
      return list;
    case 'rating_desc':
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      return list;
    case 'name_asc':
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    case 'best_value':
      list.sort((a, b) => {
        const ratioA = getMinAdultPrice(a) / Math.max(a.duration ?? 1, 1);
        const ratioB = getMinAdultPrice(b) / Math.max(b.duration ?? 1, 1);
        return ratioA - ratioB;
      });
      return list;
    case 'recommended':
    case '':
    default:
      return scoreTours(list, { country });
  }
}

export default async function AllToursPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const q = typeof resolvedSearchParams?.q === 'string' ? resolvedSearchParams.q : '';
  const destination =
    typeof resolvedSearchParams?.destination === 'string' ? resolvedSearchParams.destination : '';
  const type = typeof resolvedSearchParams?.type === 'string' ? resolvedSearchParams.type : '';
  const sort = typeof resolvedSearchParams?.sort === 'string' ? resolvedSearchParams.sort : '';
  const travelDate =
    typeof resolvedSearchParams?.travelDate === 'string' ? resolvedSearchParams.travelDate : '';

  const rawPage = Number.parseInt(
    typeof resolvedSearchParams?.page === 'string' ? resolvedSearchParams.page : '1',
    10
  );
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawPageSize = Number.parseInt(
    typeof resolvedSearchParams?.pageSize === 'string' ? resolvedSearchParams.pageSize : '',
    10
  );
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const settings = await getAgencySettings();
  const destinationOptions = settings?.data?.tourDestinations ?? [];
  const typeOptions = settings?.data?.tourCategories ?? [];

  let country = '';
  try {
    const cookieStore = await cookies();
    country = cookieStore.get('NEXT_COUNTRY')?.value ?? '';
  } catch {
    country = '';
  }

  let filteredTours: Tour[] = [];
  let hasLoadError = false;
  try {
    filteredTours = await getTours({ q, destination, type });
  } catch {
    filteredTours = [];
    hasLoadError = true;
  }

  if (travelDate && filteredTours.length > 0) {
    try {
      const availableTourIds = await getToursAvailableOnDate(
        travelDate,
        filteredTours.map((t) => t.id)
      );
      if (availableTourIds !== null) {
        const allowed = new Set(availableTourIds);
        filteredTours = filteredTours.filter((t) => allowed.has(t.id));
      }
    } catch {
      // ignore — show all
    }
  }

  let allTours: Tour[] = filteredTours;
  let suggestionTourNames: string[] = [];
  try {
    const everyTour = await getTours({ skipTranslation: true });
    allTours = everyTour;
    suggestionTourNames = everyTour
      .map((t) => t.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .slice(0, 200);
  } catch {
    allTours = filteredTours;
    suggestionTourNames = filteredTours.map((t) => t.name);
  }

  const sortedTours = applySort(filteredTours, sort, country);
  const total = sortedTours.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pagedTours = sortedTours.slice(startIdx, startIdx + pageSize);

  let availabilityStatusByTourId: Record<string, TourDateStatus> = {};
  if (travelDate && pagedTours.length > 0) {
    try {
      availabilityStatusByTourId = await getTourDateStatusMap(
        travelDate,
        pagedTours.map((t) => t.id)
      );
    } catch {
      availabilityStatusByTourId = {};
    }
  }

  return (
    <ToursPageClient
      sortedTours={pagedTours}
      total={total}
      page={safePage}
      pageSize={pageSize}
      totalPages={totalPages}
      allTours={allTours}
      q={q}
      destination={destination}
      type={type}
      sort={sort}
      travelDate={travelDate}
      destinationOptions={destinationOptions}
      typeOptions={typeOptions}
      hasLoadError={hasLoadError}
      availabilityStatusByTourId={availabilityStatusByTourId}
      suggestionTourNames={suggestionTourNames}
    />
  );
}
