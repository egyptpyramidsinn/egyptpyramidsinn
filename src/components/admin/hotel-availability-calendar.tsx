'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import type { DayContentProps } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type HotelAvailabilityCalendarRow = {
  date: string;
  availableUnits: number;
  pricePerNight: number;
  stopSell: boolean;
};

type InventorySaveAction = (formData: FormData) => void | Promise<void>;

type InventoryStatus = 'blocked' | 'low' | 'available' | 'neutral';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const statusLabel: Record<InventoryStatus, string> = {
  blocked: 'Blocked',
  low: 'Low',
  available: 'Available',
  neutral: 'No override',
};

const statusBadgeClass: Record<InventoryStatus, string> = {
  blocked: 'border-destructive/40 bg-destructive/15 text-destructive',
  low: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  available: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  neutral: 'border-muted bg-muted/40 text-muted-foreground',
};

const statusDotClass: Record<InventoryStatus, string> = {
  blocked: 'bg-destructive',
  low: 'bg-amber-500',
  available: 'bg-emerald-500',
  neutral: 'bg-muted-foreground/40',
};

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function toIsoDate(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function getInventoryStatus(row: HotelAvailabilityCalendarRow | undefined): InventoryStatus {
  if (!row) return 'neutral';
  if (row.stopSell || row.availableUnits <= 0) return 'blocked';
  if (row.availableUnits <= 2) return 'low';
  return 'available';
}

function formatPrice(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'No custom row';
  return value.toFixed(2);
}

function parseNonNegativeInteger(value: string): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
  return num;
}

function parseNonNegativeNumber(value: string): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function LegendItem({ status, label }: { status: InventoryStatus; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          'h-3 w-3 rounded-sm border',
          status === 'blocked' && 'border-destructive/40 bg-destructive/20',
          status === 'low' && 'border-amber-500/40 bg-amber-500/20',
          status === 'available' && 'border-emerald-500/40 bg-emerald-500/20',
          status === 'neutral' && 'border-muted-foreground/30 bg-muted/40'
        )}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}

export interface HotelAvailabilityCalendarProps {
  roomTypeId: string;
  roomTypeName: string;
  month: number;
  year: number;
  from: string;
  to: string;
  inventory: HotelAvailabilityCalendarRow[];
  prevMonthHref: string;
  nextMonthHref: string;
  saveSingleDayAction: InventorySaveAction;
  saveRangeAction: InventorySaveAction;
}

export function HotelAvailabilityCalendar({
  roomTypeId,
  roomTypeName,
  month,
  year,
  from,
  to,
  inventory,
  prevMonthHref,
  nextMonthHref,
  saveSingleDayAction,
  saveRangeAction,
}: HotelAvailabilityCalendarProps) {
  const inventoryByDate = React.useMemo(
    () => new Map(inventory.map((row) => [row.date, row])),
    [inventory]
  );

  const monthDate = React.useMemo(() => new Date(year, month - 1, 1), [month, year]);

  const datesByStatus = React.useMemo(() => {
    const blocked: Date[] = [];
    const low: Date[] = [];
    const available: Date[] = [];

    for (const row of inventory) {
      const date = parseIsoDate(row.date);
      if (!date) continue;

      const status = getInventoryStatus(row);
      if (status === 'blocked') blocked.push(date);
      if (status === 'low') low.push(date);
      if (status === 'available') available.push(date);
    }

    return { blocked, low, available };
  }, [inventory]);

  const defaultActiveDateIso = React.useMemo(
    () => (isIsoDate(from) ? from : toIsoDate(monthDate)),
    [from, monthDate]
  );

  const [activeDateIso, setActiveDateIso] = React.useState(defaultActiveDateIso);
  const [previewDateIso, setPreviewDateIso] = React.useState(defaultActiveDateIso);

  React.useEffect(() => {
    setActiveDateIso(defaultActiveDateIso);
    setPreviewDateIso(defaultActiveDateIso);
  }, [defaultActiveDateIso]);

  const [isDayEditorOpen, setDayEditorOpen] = React.useState(false);
  const [dayUnits, setDayUnits] = React.useState('0');
  const [dayPrice, setDayPrice] = React.useState('0');
  const [dayStopSell, setDayStopSell] = React.useState(false);
  const [dayError, setDayError] = React.useState<string | null>(null);

  const [rangeFrom, setRangeFrom] = React.useState(from);
  const [rangeTo, setRangeTo] = React.useState(to);
  const [rangeUnits, setRangeUnits] = React.useState('0');
  const [rangePrice, setRangePrice] = React.useState('0');
  const [rangeStopSell, setRangeStopSell] = React.useState(false);
  const [rangeError, setRangeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRangeFrom(from);
    setRangeTo(to);
  }, [from, to]);

  const openDayEditor = React.useCallback(
    (date: Date) => {
      const iso = toIsoDate(date);
      const row = inventoryByDate.get(iso);

      setActiveDateIso(iso);
      setPreviewDateIso(iso);
      setDayUnits(String(row?.availableUnits ?? 0));
      setDayPrice(String(row?.pricePerNight ?? 0));
      setDayStopSell(Boolean(row?.stopSell));
      setDayError(null);
      setDayEditorOpen(true);
    },
    [inventoryByDate]
  );

  const activeDate = parseIsoDate(activeDateIso) ?? monthDate;
  const quickInfoIso = previewDateIso || activeDateIso;
  const quickInfoDate = parseIsoDate(quickInfoIso);
  const quickInfoRow = quickInfoIso ? inventoryByDate.get(quickInfoIso) : undefined;
  const quickInfoStatus = getInventoryStatus(quickInfoRow);

  const handleDaySubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const units = parseNonNegativeInteger(dayUnits);
      if (units === null) {
        event.preventDefault();
        setDayError('Units must be a whole number that is 0 or greater.');
        return;
      }

      const price = parseNonNegativeNumber(dayPrice);
      if (price === null) {
        event.preventDefault();
        setDayError('Price must be a number that is 0 or greater.');
        return;
      }

      setDayError(null);
    },
    [dayPrice, dayUnits]
  );

  const handleRangeSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (!isIsoDate(rangeFrom) || !isIsoDate(rangeTo)) {
        event.preventDefault();
        setRangeError('Range dates must be valid YYYY-MM-DD values.');
        return;
      }

      if (rangeTo < rangeFrom) {
        event.preventDefault();
        setRangeError('Range end date must be the same day or after range start date.');
        return;
      }

      const units = parseNonNegativeInteger(rangeUnits);
      if (units === null) {
        event.preventDefault();
        setRangeError('Units must be a whole number that is 0 or greater.');
        return;
      }

      const price = parseNonNegativeNumber(rangePrice);
      if (price === null) {
        event.preventDefault();
        setRangeError('Price must be a number that is 0 or greater.');
        return;
      }

      setRangeError(null);
    },
    [rangeFrom, rangePrice, rangeTo, rangeUnits]
  );

  const renderDayContent = React.useCallback(
    ({ date }: DayContentProps) => {
      const iso = toIsoDate(date);
      const row = inventoryByDate.get(iso);
      const status = getInventoryStatus(row);

      return (
        <span className="relative inline-flex h-full w-full items-center justify-center">
          <span>{format(date, 'd')}</span>
          <span
            className={cn('absolute bottom-1 h-1.5 w-1.5 rounded-full', statusDotClass[status])}
            aria-hidden
          />
        </span>
      );
    },
    [inventoryByDate]
  );

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Visual Month Calendar</CardTitle>
                <CardDescription>{roomTypeName}</CardDescription>
              </div>

              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href={prevMonthHref}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Prev
                  </Link>
                </Button>
                <p className="min-w-[10rem] text-center text-sm font-semibold">
                  {format(monthDate, 'MMMM yyyy')}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={nextMonthHref}>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <Calendar
              month={monthDate}
              disableNavigation
              showOutsideDays={false}
              mode="single"
              selected={activeDate}
              onSelect={(date) => {
                if (!date) return;
                const iso = toIsoDate(date);
                setActiveDateIso(iso);
                setPreviewDateIso(iso);
              }}
              onDayClick={(date) => openDayEditor(date)}
              onDayMouseEnter={(date) => setPreviewDateIso(toIsoDate(date))}
              onDayMouseLeave={() => setPreviewDateIso(activeDateIso)}
              onDayFocus={(date) => setPreviewDateIso(toIsoDate(date))}
              onDayBlur={() => setPreviewDateIso(activeDateIso)}
              modifiers={{
                blocked: datesByStatus.blocked,
                low: datesByStatus.low,
                available: datesByStatus.available,
              }}
              modifiersClassNames={{
                blocked:
                  'bg-destructive/20 text-destructive hover:bg-destructive/25 focus:bg-destructive/25',
                low: 'bg-amber-500/20 text-amber-700 hover:bg-amber-500/25 focus:bg-amber-500/25 dark:text-amber-300',
                available:
                  'bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/25 focus:bg-emerald-500/25 dark:text-emerald-300',
              }}
              components={{ DayContent: renderDayContent }}
              className="rounded-lg border bg-background"
            />

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDayEditor(activeDate)}
              >
                Edit selected day
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3" aria-live="polite">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">
                  {quickInfoDate ? format(quickInfoDate, 'EEEE, MMM d, yyyy') : 'Date details'}
                </p>
                <Badge
                  variant="outline"
                  className={cn('capitalize', statusBadgeClass[quickInfoStatus])}
                >
                  {statusLabel[quickInfoStatus]}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Units: {quickInfoRow ? quickInfoRow.availableUnits : 'No custom row'}
                {' · '}Price:{' '}
                {quickInfoRow ? formatPrice(quickInfoRow.pricePerNight) : 'No custom row'}
                {' · '}Stop sell: {quickInfoRow?.stopSell ? 'Yes' : 'No'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <LegendItem status="blocked" label="Stop-sell or 0 units" />
              <LegendItem status="low" label="Low (1-2 units)" />
              <LegendItem status="available" label="Available (3+ units)" />
              <LegendItem status="neutral" label="No custom row" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Apply To Date Range</CardTitle>
            <CardDescription>
              Update inventory and pricing for multiple dates with one save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveRangeAction} onSubmit={handleRangeSubmit} className="space-y-4">
              <input type="hidden" name="roomTypeId" value={roomTypeId} />
              <input type="hidden" name="returnFrom" value={from} />
              <input type="hidden" name="returnTo" value={to} />
              <input type="hidden" name="month" value={String(month)} />
              <input type="hidden" name="year" value={String(year)} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="rangeFrom">From</Label>
                  <Input
                    id="rangeFrom"
                    name="from"
                    type="date"
                    value={rangeFrom}
                    onChange={(event) => setRangeFrom(event.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="rangeTo">To</Label>
                  <Input
                    id="rangeTo"
                    name="to"
                    type="date"
                    value={rangeTo}
                    onChange={(event) => setRangeTo(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="rangeUnits">Units</Label>
                  <Input
                    id="rangeUnits"
                    name="availableUnits"
                    type="number"
                    min={0}
                    step={1}
                    value={rangeUnits}
                    onChange={(event) => setRangeUnits(event.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="rangePrice">Price / night</Label>
                  <Input
                    id="rangePrice"
                    name="pricePerNight"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rangePrice}
                    onChange={(event) => setRangePrice(event.target.value)}
                    required
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="stopSell"
                  checked={rangeStopSell}
                  onChange={(event) => setRangeStopSell(event.target.checked)}
                  className="h-4 w-4"
                />
                Stop sell across this range
              </label>

              {rangeError ? (
                <p
                  className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
                  role="alert"
                >
                  {rangeError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRangeFrom(from);
                      setRangeTo(to);
                    }}
                  >
                    Current view
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRangeFrom(activeDateIso);
                      setRangeTo(activeDateIso);
                    }}
                    disabled={!isIsoDate(activeDateIso)}
                  >
                    Selected day
                  </Button>
                </div>
                <Button type="submit">Apply range</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDayEditorOpen} onOpenChange={setDayEditorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit day: {format(activeDate, 'EEEE, MMM d, yyyy')}</DialogTitle>
            <DialogDescription>
              Save units, price, and stop-sell for this single day.
            </DialogDescription>
          </DialogHeader>

          <form action={saveSingleDayAction} onSubmit={handleDaySubmit} className="space-y-4">
            <input type="hidden" name="roomTypeId" value={roomTypeId} />
            <input type="hidden" name="date" value={activeDateIso} />
            <input type="hidden" name="returnFrom" value={from} />
            <input type="hidden" name="returnTo" value={to} />
            <input type="hidden" name="month" value={String(month)} />
            <input type="hidden" name="year" value={String(year)} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="dayUnits">Units</Label>
                <Input
                  id="dayUnits"
                  name="availableUnits"
                  type="number"
                  min={0}
                  step={1}
                  value={dayUnits}
                  onChange={(event) => setDayUnits(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="dayPrice">Price / night</Label>
                <Input
                  id="dayPrice"
                  name="pricePerNight"
                  type="number"
                  min={0}
                  step="0.01"
                  value={dayPrice}
                  onChange={(event) => setDayPrice(event.target.value)}
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="stopSell"
                checked={dayStopSell}
                onChange={(event) => setDayStopSell(event.target.checked)}
                className="h-4 w-4"
              />
              Stop sell on this day
            </label>

            {dayError ? (
              <p
                className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
                role="alert"
              >
                {dayError}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDayEditorOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save day</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
