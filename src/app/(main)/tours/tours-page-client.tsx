'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X, SlidersHorizontal, Filter, Star } from 'lucide-react';
import { ToursClient } from './tours-client';
import { useLanguage } from '@/hooks/use-language';
import { useCurrency } from '@/hooks/use-currency';
import type { Tour } from '@/types';
import type { TourAvailabilityStatus } from '@/components/tour-card';
import { cn } from '@/lib/utils';

interface ToursPageClientProps {
  sortedTours: Tour[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  allTours: Tour[];
  q: string;
  destination: string;
  type: string;
  sort: string;
  travelDate: string;
  destinationOptions: string[];
  typeOptions: string[];
  hasLoadError: boolean;
  availabilityStatusByTourId: Record<string, TourAvailabilityStatus>;
  suggestionTourNames: string[];
}

const SORT_PRESETS = [
  { value: '', tKey: 'tours.sortRecommended' },
  { value: 'best_value', tKey: 'tours.sortBestValue' },
  { value: 'rating_desc', tKey: 'tours.sortTopRated' },
  { value: 'duration_asc', tKey: 'tours.sortDurAsc' },
  { value: 'price_asc', tKey: 'tours.sortPriceAsc' },
  { value: 'price_desc', tKey: 'tours.sortPriceDesc' },
] as const;

function getSortLabel(value: string, t: (key: string) => string): string {
  switch (value) {
    case 'rating_desc':
      return t('tours.sortTopRated');
    case 'price_asc':
      return t('tours.sortPriceAsc');
    case 'price_desc':
      return t('tours.sortPriceDesc');
    case 'duration_asc':
      return t('tours.sortDurAsc');
    case 'duration_desc':
      return t('tours.sortDurDesc');
    case 'name_asc':
      return t('tours.sortNameAsc');
    case 'best_value':
      return t('tours.sortBestValue');
    case '':
    case 'recommended':
      return t('tours.sortRecommended');
    default:
      return value;
  }
}

const COMPARE_STORAGE_KEY = 'tourista:compare';
const MAX_COMPARE = 3;

export function ToursPageClient({
  sortedTours,
  total,
  page,
  pageSize: _pageSize,
  totalPages,
  allTours,
  q,
  destination,
  type,
  sort,
  travelDate,
  destinationOptions,
  typeOptions,
  hasLoadError,
  availabilityStatusByTourId,
  suggestionTourNames,
}: ToursPageClientProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildHref = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') params.delete(k);
        else params.set(k, v);
      }
      // Reset page on any non-page change
      if (Object.keys(changes).some((k) => k !== 'page')) {
        params.delete('page');
      }
      const qs = params.toString();
      return `${pathname || '/tours'}${qs ? `?${qs}` : ''}`;
    },
    [pathname, searchParams]
  );

  const navigate = useCallback(
    (changes: Record<string, string | null>) => {
      router.push(buildHref(changes));
    },
    [router, buildHref]
  );

  // ─── Compare state ────────────────────────────────────────────────────────
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(COMPARE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setSelectedCompareIds(parsed.filter((x): x is string => typeof x === 'string'));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(selectedCompareIds));
    } catch {
      // ignore
    }
  }, [selectedCompareIds]);

  const compareLookup = useMemo(() => {
    const map = new Map<string, Tour>();
    for (const tour of allTours) map.set(tour.id, tour);
    for (const tour of sortedTours) map.set(tour.id, tour);
    return map;
  }, [allTours, sortedTours]);

  const toggleCompare = useCallback((tourId: string) => {
    setSelectedCompareIds((prev) => {
      if (prev.includes(tourId)) return prev.filter((id) => id !== tourId);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, tourId];
    });
  }, []);

  const removeCompare = useCallback((tourId: string) => {
    setSelectedCompareIds((prev) => prev.filter((id) => id !== tourId));
  }, []);

  const clearCompare = useCallback(() => setSelectedCompareIds([]), []);

  // ─── Active filter chips ──────────────────────────────────────────────────
  const activeFiltersCount = [q, destination, type, sort, travelDate].filter(Boolean).length;

  // ─── Mobile filters sheet open state ──────────────────────────────────────
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  return (
    <div className="container mx-auto px-4 py-8 pb-28 md:pb-8">
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-bold font-headline">{t('tours.title')}</h1>
          <p className="text-muted-foreground">{t('tours.subtitle')}</p>
        </div>

        {/* Sort presets */}
        <SortPresetRail activeSort={sort} onChange={(value) => navigate({ sort: value || null })} />

        {/* Primary filter row (desktop) */}
        <div className="hidden md:block">
          <PrimaryFilterForm
            q={q}
            destination={destination}
            type={type}
            sort={sort}
            travelDate={travelDate}
            destinationOptions={destinationOptions}
            typeOptions={typeOptions}
            suggestionTourNames={suggestionTourNames}
            onSubmit={(values) =>
              navigate({
                q: values.q || null,
                destination: values.destination || null,
                type: values.type || null,
                travelDate: values.travelDate || null,
                sort: values.sort || null,
              })
            }
          />
        </div>

        {/* Mobile sticky filters trigger */}
        <div className="md:hidden">
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full" type="button">
                <Filter className="h-4 w-4 mr-2" />
                {t('tours.filtersButton')}
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t('tours.filtersButton')}</SheetTitle>
              </SheetHeader>
              <div className="py-4">
                <PrimaryFilterForm
                  q={q}
                  destination={destination}
                  type={type}
                  sort={sort}
                  travelDate={travelDate}
                  destinationOptions={destinationOptions}
                  typeOptions={typeOptions}
                  suggestionTourNames={suggestionTourNames}
                  showAllFields
                  onSubmit={(values) => {
                    navigate({
                      q: values.q || null,
                      destination: values.destination || null,
                      type: values.type || null,
                      travelDate: values.travelDate || null,
                      sort: values.sort || null,
                    });
                    setMobileFiltersOpen(false);
                  }}
                />
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button asChild variant="outline" type="button">
                    <Link href="/tours">{t('tours.clearAll')}</Link>
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* Status row + chips */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {t('tours.showing')} {sortedTours.length} {t('tours.of')} {total}{' '}
            {total === 1 ? t('tours.tour') : t('tours.tours')}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={compareEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCompareEnabled((v) => !v)}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {compareEnabled ? t('tours.compareOn') : t('tours.compareOff')}
            </Button>
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <FilterChipsRail
            q={q}
            destination={destination}
            type={type}
            sort={sort}
            travelDate={travelDate}
            buildHref={buildHref}
            t={t}
            activeFiltersCount={activeFiltersCount}
          />
        )}

        {/* Results */}
        {hasLoadError ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">{t('tours.unavailableTitle')}</h2>
            <p className="text-muted-foreground mb-6">{t('tours.unavailableDesc')}</p>
            <Button asChild>
              <Link href="/tours">{t('tours.retry')}</Link>
            </Button>
          </div>
        ) : sortedTours.length > 0 ? (
          <>
            <ToursClient
              tours={sortedTours}
              availabilityStatusByTourId={availabilityStatusByTourId}
              compareEnabled={compareEnabled}
              selectedCompareIds={selectedCompareIds}
              onToggleCompare={toggleCompare}
              compareLimit={MAX_COMPARE}
            />
            <PaginationControl page={page} totalPages={totalPages} buildHref={buildHref} t={t} />
          </>
        ) : (
          <NoResultsRecovery
            travelDate={travelDate}
            destination={destination}
            type={type}
            destinationOptions={destinationOptions}
            typeOptions={typeOptions}
            buildHref={buildHref}
            t={t}
          />
        )}
      </div>

      {/* Compare floating bar */}
      {compareEnabled && selectedCompareIds.length > 0 && (
        <CompareFloatingBar
          selected={selectedCompareIds
            .map((id) => compareLookup.get(id))
            .filter((tour): tour is Tour => Boolean(tour))}
          onRemove={removeCompare}
          onClear={clearCompare}
          onOpen={() => setCompareModalOpen(true)}
          t={t}
        />
      )}

      <CompareModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
        tours={selectedCompareIds
          .map((id) => compareLookup.get(id))
          .filter((tour): tour is Tour => Boolean(tour))}
        t={t}
      />
    </div>
  );
}

// ─── Sort preset rail ───────────────────────────────────────────────────────

function SortPresetRail({
  activeSort,
  onChange,
}: {
  activeSort: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const normalized = activeSort === 'recommended' ? '' : activeSort;
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('tours.sortLabel')}>
      {SORT_PRESETS.map((preset) => {
        const isActive = normalized === preset.value;
        return (
          <button
            key={preset.value || 'recommended'}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(preset.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card hover:bg-muted'
            )}
          >
            {t(preset.tKey)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Primary filter form ────────────────────────────────────────────────────

interface PrimaryFilterFormValues {
  q: string;
  destination: string;
  type: string;
  travelDate: string;
  sort: string;
}

function PrimaryFilterForm({
  q,
  destination,
  type,
  sort,
  travelDate,
  destinationOptions,
  typeOptions,
  suggestionTourNames,
  onSubmit,
  showAllFields = false,
}: {
  q: string;
  destination: string;
  type: string;
  sort: string;
  travelDate: string;
  destinationOptions: string[];
  typeOptions: string[];
  suggestionTourNames: string[];
  onSubmit: (values: PrimaryFilterFormValues) => void;
  showAllFields?: boolean;
}) {
  const { t } = useLanguage();
  const [qValue, setQValue] = useState(q);
  const [destinationValue, setDestinationValue] = useState(destination);
  const [typeValue, setTypeValue] = useState(type);
  const [travelDateValue, setTravelDateValue] = useState(travelDate);
  const [sortValue, setSortValue] = useState(sort);
  const [showMore, setShowMore] = useState(showAllFields);

  useEffect(() => setQValue(q), [q]);
  useEffect(() => setDestinationValue(destination), [destination]);
  useEffect(() => setTypeValue(type), [type]);
  useEffect(() => setTravelDateValue(travelDate), [travelDate]);
  useEffect(() => setSortValue(sort), [sort]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          q: qValue,
          destination: destinationValue,
          type: typeValue,
          travelDate: travelDateValue,
          sort: sortValue,
        });
      }}
      className="rounded-2xl border bg-card p-4 md:p-6"
      aria-label="Filter tours"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-5 space-y-2">
          <label className="text-sm font-medium" htmlFor="tours-q">
            {t('tours.searchLabel')}
          </label>
          <SearchSuggestionsInput
            value={qValue}
            onChange={setQValue}
            destinationOptions={destinationOptions}
            typeOptions={typeOptions}
            tourNames={suggestionTourNames}
            onPickDestination={(d) => {
              setDestinationValue(d);
              onSubmit({
                q: qValue,
                destination: d,
                type: typeValue,
                travelDate: travelDateValue,
                sort: sortValue,
              });
            }}
            onPickType={(tp) => {
              setTypeValue(tp);
              onSubmit({
                q: qValue,
                destination: destinationValue,
                type: tp,
                travelDate: travelDateValue,
                sort: sortValue,
              });
            }}
            onPickTour={(name) => {
              setQValue(name);
              onSubmit({
                q: name,
                destination: destinationValue,
                type: typeValue,
                travelDate: travelDateValue,
                sort: sortValue,
              });
            }}
          />
        </div>

        <div className="md:col-span-3 space-y-2">
          <label className="text-sm font-medium" htmlFor="tours-travel-date">
            {t('tours.travelDateLabel')}
          </label>
          <Input
            id="tours-travel-date"
            type="date"
            name="travelDate"
            value={travelDateValue}
            onChange={(e) => setTravelDateValue(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        <div className="md:col-span-3 space-y-2">
          <label className="text-sm font-medium" htmlFor="tours-destination">
            {t('tours.destinationLabel')}
          </label>
          <select
            id="tours-destination"
            name="destination"
            value={destinationValue}
            onChange={(e) => setDestinationValue(e.target.value)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t('tours.allDestinations')}</option>
            {destinationOptions.length > 0 ? (
              destinationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))
            ) : (
              <option value="" disabled>
                {t('tours.noDestinations')}
              </option>
            )}
          </select>
        </div>

        <div className="md:col-span-1 flex">
          <Button type="submit" className="w-full">
            {t('tours.apply')}
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="text-sm font-medium text-primary hover:underline"
          aria-expanded={showMore}
        >
          {showMore ? t('tours.lessFilters') : t('tours.moreFilters')}
        </button>
      </div>

      {showMore && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4 space-y-2">
            <label className="text-sm font-medium" htmlFor="tours-type">
              {t('tours.typeLabel')}
            </label>
            <select
              id="tours-type"
              name="type"
              value={typeValue}
              onChange={(e) => setTypeValue(e.target.value)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t('tours.allTypes')}</option>
              {typeOptions.length > 0 ? (
                typeOptions.map((tp) => (
                  <option key={tp} value={tp}>
                    {tp}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  {t('tours.noTypes')}
                </option>
              )}
            </select>
          </div>

          <div className="md:col-span-4 space-y-2">
            <label className="text-sm font-medium" htmlFor="tours-sort">
              {t('tours.sortLabel')}
            </label>
            <select
              id="tours-sort"
              name="sort"
              value={sortValue}
              onChange={(e) => setSortValue(e.target.value)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t('tours.recommended')}</option>
              <option value="best_value">{t('tours.sortBestValue')}</option>
              <option value="rating_desc">{t('tours.sortTopRated')}</option>
              <option value="price_asc">{t('tours.sortPriceAsc')}</option>
              <option value="price_desc">{t('tours.sortPriceDesc')}</option>
              <option value="duration_asc">{t('tours.sortDurAsc')}</option>
              <option value="duration_desc">{t('tours.sortDurDesc')}</option>
              <option value="name_asc">{t('tours.sortNameAsc')}</option>
            </select>
          </div>

          <div className="md:col-span-4 flex justify-end gap-3">
            <Button asChild type="button" variant="outline">
              <Link href="/tours">{t('tours.clear')}</Link>
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── Search suggestions combobox ────────────────────────────────────────────

function SearchSuggestionsInput({
  value,
  onChange,
  destinationOptions,
  typeOptions,
  tourNames,
  onPickDestination,
  onPickType,
  onPickTour,
}: {
  value: string;
  onChange: (value: string) => void;
  destinationOptions: string[];
  typeOptions: string[];
  tourNames: string[];
  onPickDestination: (value: string) => void;
  onPickType: (value: string) => void;
  onPickTour: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matchFilter = (s: string) => !q || s.toLowerCase().includes(q);
    const dests = destinationOptions.filter(matchFilter).slice(0, 6);
    const types = typeOptions.filter(matchFilter).slice(0, 6);
    const tours = tourNames.filter(matchFilter).slice(0, 8);
    return { dests, types, tours };
  }, [value, destinationOptions, typeOptions, tourNames]);

  const flatItems = useMemo(() => {
    const items: Array<{ kind: 'destination' | 'type' | 'tour'; value: string }> = [];
    for (const d of filtered.dests) items.push({ kind: 'destination', value: d });
    for (const tp of filtered.types) items.push({ kind: 'type', value: tp });
    for (const tn of filtered.tours) items.push({ kind: 'tour', value: tn });
    return items;
  }, [filtered]);

  const totalItems = flatItems.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (totalItems === 0 ? -1 : (i + 1) % totalItems));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (totalItems === 0 ? -1 : (i - 1 + totalItems) % totalItems));
    } else if (e.key === 'Enter' && open && activeIndex >= 0) {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) {
        if (item.kind === 'destination') onPickDestination(item.value);
        else if (item.kind === 'type') onPickType(item.value);
        else onPickTour(item.value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id="tours-q"
        type="text"
        name="q"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so click on suggestion can fire
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t('tours.searchPlaceholder')}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="tours-q-listbox"
        aria-autocomplete="list"
      />
      {open && totalItems > 0 && (
        <div
          id="tours-q-listbox"
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {filtered.dests.length > 0 && (
            <SuggestionsGroup
              label={t('tours.suggestionsDestinations')}
              items={filtered.dests}
              startIndex={0}
              activeIndex={activeIndex}
              onPick={(v) => {
                onPickDestination(v);
                setOpen(false);
              }}
            />
          )}
          {filtered.types.length > 0 && (
            <SuggestionsGroup
              label={t('tours.suggestionsTypes')}
              items={filtered.types}
              startIndex={filtered.dests.length}
              activeIndex={activeIndex}
              onPick={(v) => {
                onPickType(v);
                setOpen(false);
              }}
            />
          )}
          {filtered.tours.length > 0 && (
            <SuggestionsGroup
              label={t('tours.suggestionsTours')}
              items={filtered.tours}
              startIndex={filtered.dests.length + filtered.types.length}
              activeIndex={activeIndex}
              onPick={(v) => {
                onPickTour(v);
                setOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionsGroup({
  label,
  items,
  startIndex,
  activeIndex,
  onPick,
}: {
  label: string;
  items: string[];
  startIndex: number;
  activeIndex: number;
  onPick: (value: string) => void;
}) {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {items.map((item, idx) => {
        const globalIdx = startIndex + idx;
        const isActive = globalIdx === activeIndex;
        return (
          <button
            type="button"
            key={`${label}-${item}`}
            role="option"
            aria-selected={isActive}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
            className={cn(
              'flex w-full items-center px-3 py-2 text-sm hover:bg-muted',
              isActive && 'bg-muted'
            )}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

// ─── Filter chips rail ──────────────────────────────────────────────────────

function FilterChipsRail({
  q,
  destination,
  type,
  sort,
  travelDate,
  buildHref,
  t,
  activeFiltersCount,
}: {
  q: string;
  destination: string;
  type: string;
  sort: string;
  travelDate: string;
  buildHref: (changes: Record<string, string | null>) => string;
  t: (key: string) => string;
  activeFiltersCount: number;
}) {
  const chips: Array<{ key: string; label: string; param: string }> = [];
  if (q) chips.push({ key: 'q', label: `${t('tours.searchBadge')} ${q}`, param: 'q' });
  if (travelDate)
    chips.push({
      key: 'travelDate',
      label: `${t('tours.dateBadge')} ${travelDate}`,
      param: 'travelDate',
    });
  if (destination)
    chips.push({
      key: 'destination',
      label: `${t('tours.destinationBadge')} ${destination}`,
      param: 'destination',
    });
  if (type) chips.push({ key: 'type', label: `${t('tours.typeBadge')} ${type}`, param: 'type' });
  if (sort)
    chips.push({
      key: 'sort',
      label: `${t('tours.sortBadge')} ${getSortLabel(sort, t)}`,
      param: 'sort',
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={buildHref({ [chip.param]: null })}
          className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          aria-label={`${t('tours.removeFilter')}: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <X className="h-3 w-3" />
        </Link>
      ))}
      {activeFiltersCount >= 2 && (
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href="/tours">{t('tours.clearAll')}</Link>
        </Button>
      )}
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────

function PaginationControl({
  page,
  totalPages,
  buildHref,
  t,
}: {
  page: number;
  totalPages: number;
  buildHref: (changes: Record<string, string | null>) => string;
  t: (key: string) => string;
}) {
  const pages = useMemo(() => {
    const out: Array<number | 'ellipsis'> = [];
    const win = 1;
    const add = (n: number) => out.push(n);
    add(1);
    for (let i = page - win; i <= page + win; i++) {
      if (i > 1 && i < totalPages) add(i);
    }
    if (totalPages > 1) add(totalPages);
    const dedup: Array<number | 'ellipsis'> = [];
    let prev: number | 'ellipsis' | null = null;
    for (const n of out) {
      if (typeof n === 'number' && typeof prev === 'number' && n - prev > 1) {
        dedup.push('ellipsis');
      }
      if (n !== prev) dedup.push(n);
      prev = n;
    }
    return dedup;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  const prevHref = page > 1 ? buildHref({ page: page === 2 ? null : String(page - 1) }) : null;
  const nextHref = page < totalPages ? buildHref({ page: String(page + 1) }) : null;

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row"
      aria-label="Pagination"
    >
      {/* Mobile compact */}
      <div className="flex w-full items-center justify-between gap-2 sm:hidden">
        <Button asChild variant="outline" size="sm" disabled={!prevHref}>
          {prevHref ? (
            <Link href={prevHref}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('tours.previous')}
            </Link>
          ) : (
            <span>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('tours.previous')}
            </span>
          )}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t('tours.pageOf')
            .replace('{{page}}', String(page))
            .replace('{{total}}', String(totalPages))}
        </span>
        <Button asChild variant="outline" size="sm" disabled={!nextHref}>
          {nextHref ? (
            <Link href={nextHref}>
              {t('tours.next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          ) : (
            <span>
              {t('tours.next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </span>
          )}
        </Button>
      </div>
      {nextHref && (
        <div className="flex w-full justify-center sm:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link href={nextHref}>{t('tours.loadMore')}</Link>
          </Button>
        </div>
      )}

      {/* Desktop full */}
      <div className="hidden items-center gap-1 sm:flex">
        <Button asChild variant="outline" size="sm" disabled={!prevHref}>
          {prevHref ? (
            <Link href={prevHref}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('tours.previous')}
            </Link>
          ) : (
            <span>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('tours.previous')}
            </span>
          )}
        </Button>
        {pages.map((p, idx) => {
          if (p === 'ellipsis') {
            return (
              <span key={`e-${idx}`} className="px-2 text-muted-foreground">
                …
              </span>
            );
          }
          const isCurrent = p === page;
          return (
            <Button
              key={p}
              asChild
              variant={isCurrent ? 'default' : 'outline'}
              size="sm"
              aria-current={isCurrent ? 'page' : undefined}
            >
              <Link href={buildHref({ page: p === 1 ? null : String(p) })}>{p}</Link>
            </Button>
          );
        })}
        <Button asChild variant="outline" size="sm" disabled={!nextHref}>
          {nextHref ? (
            <Link href={nextHref}>
              {t('tours.next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          ) : (
            <span>
              {t('tours.next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
}

// ─── No results recovery ────────────────────────────────────────────────────

function NoResultsRecovery({
  travelDate,
  destination,
  type,
  destinationOptions,
  typeOptions,
  buildHref,
  t,
}: {
  travelDate: string;
  destination: string;
  type: string;
  destinationOptions: string[];
  typeOptions: string[];
  buildHref: (changes: Record<string, string | null>) => string;
  t: (key: string) => string;
}) {
  const nearbyDestinations = destinationOptions
    .filter((d) => d.toLowerCase() !== destination.toLowerCase())
    .slice(0, 6);
  const otherTypes = typeOptions
    .filter((tp) => tp.toLowerCase() !== type.toLowerCase())
    .slice(0, 6);

  return (
    <div className="rounded-2xl border bg-card p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">{t('tours.noResultsHeading')}</h2>
        <p className="text-muted-foreground mb-6">{t('tours.noResultsRecover')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {travelDate && (
          <div className="rounded-xl border bg-background p-4">
            <h3 className="font-semibold mb-3">{t('tours.clearTravelDate')}</h3>
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref({ travelDate: null })}>{t('tours.clearTravelDate')}</Link>
            </Button>
          </div>
        )}

        {nearbyDestinations.length > 0 && (
          <div className="rounded-xl border bg-background p-4">
            <h3 className="font-semibold mb-3">{t('tours.tryNearby')}</h3>
            <div className="flex flex-wrap gap-2">
              {nearbyDestinations.map((d) => (
                <Link
                  key={d}
                  href={`/tours?destination=${encodeURIComponent(d)}`}
                  className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium hover:bg-secondary/80"
                >
                  {d}
                </Link>
              ))}
            </div>
          </div>
        )}

        {otherTypes.length > 0 && (
          <div className="rounded-xl border bg-background p-4">
            <h3 className="font-semibold mb-3">{t('tours.tryOtherTypes')}</h3>
            <div className="flex flex-wrap gap-2">
              {otherTypes.map((tp) => (
                <Link
                  key={tp}
                  href={`/tours?type=${encodeURIComponent(tp)}`}
                  className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium hover:bg-secondary/80"
                >
                  {tp}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/tours">{t('tours.clearFilters')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tailor-made">{t('tours.planCustomTrip')}</Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Compare floating bar + modal ───────────────────────────────────────────

function CompareFloatingBar({
  selected,
  onRemove,
  onClear,
  onOpen,
  t,
}: {
  selected: Tour[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpen: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="container mx-auto flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {selected.map((tour) => (
            <div
              key={tour.id}
              className="flex items-center gap-2 rounded-full border bg-card pl-1 pr-3 py-1"
            >
              <div className="relative h-8 w-8 overflow-hidden rounded-full bg-muted">
                {tour.images?.[0] ? (
                  <Image
                    src={tour.images[0]}
                    alt={tour.name}
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <span className="max-w-[160px] truncate text-sm">{tour.name}</span>
              <button
                type="button"
                onClick={() => onRemove(tour.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('tours.compareRemove')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {t('tours.compareRemoveAll')}
          </Button>
          <Button type="button" size="sm" onClick={onOpen} disabled={selected.length < 2}>
            {t('tours.compareOpen').replace('{{count}}', String(selected.length))}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompareModal({
  open,
  onOpenChange,
  tours,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tours: Tour[];
  t: (key: string) => string;
}) {
  const { format } = useCurrency();
  const startingPrice = (tour: Tour): number | null => {
    const prices: number[] = [];
    for (const tier of tour.priceTiers ?? []) {
      if (typeof tier?.pricePerAdult === 'number') prices.push(tier.pricePerAdult);
    }
    for (const pkg of tour.packages ?? []) {
      for (const tier of pkg.priceTiers ?? []) {
        if (typeof tier?.pricePerAdult === 'number') prices.push(tier.pricePerAdult);
      }
    }
    if (prices.length === 0) return null;
    return Math.min(...prices);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('tours.compareTitle')}</DialogTitle>
        </DialogHeader>
        {tours.length === 0 ? (
          <p className="text-muted-foreground">{t('tours.compareEmpty')}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {tours.map((tour) => {
              const price = startingPrice(tour);
              return (
                <div key={tour.id} className="rounded-xl border bg-card p-3 space-y-3">
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted">
                    {tour.images?.[0] ? (
                      <Image
                        src={tour.images[0]}
                        alt={tour.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <h3 className="font-semibold leading-tight line-clamp-2">{tour.name}</h3>
                  <p className="text-sm text-muted-foreground">{tour.destination}</p>
                  <ul className="text-sm space-y-1">
                    <li>
                      <span className="text-muted-foreground">{t('tours.compareDuration')}:</span>{' '}
                      {tour.duration} {t('featured.duration')}
                    </li>
                    <li className="flex items-center gap-1">
                      <span className="text-muted-foreground">{t('tours.compareRating')}:</span>
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                      <span>{(tour.rating ?? 0).toFixed(1)}</span>
                    </li>
                    <li>
                      <span className="text-muted-foreground">{t('tours.compareFromPrice')}:</span>{' '}
                      {price != null ? format(price) : t('tour.contactUs')}
                    </li>
                    <li>
                      <span className="text-muted-foreground">{t('tours.compareIncludes')}:</span>{' '}
                      {(tour.includes ?? []).length}
                    </li>
                  </ul>
                  {Array.isArray(tour.highlights) && tour.highlights.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        {t('tours.compareHighlights')}
                      </div>
                      <ul className="text-sm space-y-1 list-disc pl-4">
                        {tour.highlights.slice(0, 3).map((h, i) => (
                          <li key={i} className="line-clamp-2">
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/tours/${tour.slug}`}>{t('tours.compareViewDetails')}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
