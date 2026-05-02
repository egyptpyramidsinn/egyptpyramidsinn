import Link from 'next/link';
import { HotelAvailabilityCalendar } from '@/components/admin/hotel-availability-calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getHotelBookings,
  getHotels,
  getRoomInventory,
  getRoomTypesByHotelId,
  upsertRoomInventoryRange,
} from '@/lib/supabase/hotels';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
] as const;

function addDaysISO(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isValidISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function getMonthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function getStringParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return typeof value === 'string' ? value : undefined;
}

function parseMonth(value: string | undefined, fallback: number) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return fallback;
  return month;
}

function parseYear(value: string | undefined, fallback: number) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fallback;
  return year;
}

function buildAvailabilityHref(params: {
  roomTypeId?: string;
  from: string;
  to: string;
  month: number;
  year: number;
}) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    month: String(params.month),
    year: String(params.year),
  });

  if (params.roomTypeId) {
    query.set('roomTypeId', params.roomTypeId);
  }

  return `/admin/hotels/availability?${query.toString()}`;
}

export default async function AdminHotelAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();

  const month = parseMonth(getStringParam(sp, 'month'), currentMonth);
  const year = parseYear(getStringParam(sp, 'year'), currentYear);
  const monthBounds = getMonthBounds(year, month);

  const fromParam = getStringParam(sp, 'from');
  const toParam = getStringParam(sp, 'to');
  let from = fromParam && isValidISODate(fromParam) ? fromParam : monthBounds.from;
  let to = toParam && isValidISODate(toParam) ? toParam : monthBounds.to;

  if (to < from) {
    from = monthBounds.from;
    to = monthBounds.to;
  }

  const hotels = await getHotels({ skipTranslation: true });
  const activeHotel = hotels[0] || null;
  const roomTypes = activeHotel
    ? await getRoomTypesByHotelId(activeHotel.id, { skipTranslation: true })
    : [];
  const roomTypeIdParam = getStringParam(sp, 'roomTypeId');
  const selectedRoomTypeId =
    roomTypeIdParam && roomTypes.some((rt) => rt.id === roomTypeIdParam)
      ? roomTypeIdParam
      : roomTypes[0]?.id;
  const selectedRoomType = selectedRoomTypeId
    ? (roomTypes.find((roomType) => roomType.id === selectedRoomTypeId) ?? null)
    : null;

  const toExclusive = addDaysISO(to, 1);
  const [inventory, bookings] = await Promise.all([
    selectedRoomTypeId
      ? getRoomInventory({ roomTypeId: selectedRoomTypeId, from, to: toExclusive })
      : Promise.resolve([]),
    getHotelBookings(),
  ]);

  const selectedBookings = selectedRoomTypeId
    ? bookings.filter((b) => b.roomTypeId === selectedRoomTypeId && b.status !== 'cancelled')
    : [];

  const upcomingReservations = selectedBookings
    .filter((b) => b.checkIn >= today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 12);

  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  const nextDate = new Date(Date.UTC(year, month, 1));
  const prevMonth = prevDate.getUTCMonth() + 1;
  const prevYear = prevDate.getUTCFullYear();
  const nextMonth = nextDate.getUTCMonth() + 1;
  const nextYear = nextDate.getUTCFullYear();

  const prevMonthBounds = getMonthBounds(prevYear, prevMonth);
  const nextMonthBounds = getMonthBounds(nextYear, nextMonth);
  const currentMonthBounds = getMonthBounds(currentYear, currentMonth);

  const prevMonthHref = buildAvailabilityHref({
    roomTypeId: selectedRoomTypeId,
    from: prevMonthBounds.from,
    to: prevMonthBounds.to,
    month: prevMonth,
    year: prevYear,
  });

  const nextMonthHref = buildAvailabilityHref({
    roomTypeId: selectedRoomTypeId,
    from: nextMonthBounds.from,
    to: nextMonthBounds.to,
    month: nextMonth,
    year: nextYear,
  });

  const currentMonthHref = buildAvailabilityHref({
    roomTypeId: selectedRoomTypeId,
    from: currentMonthBounds.from,
    to: currentMonthBounds.to,
    month: currentMonth,
    year: currentYear,
  });

  const saveRange = async (formData: FormData) => {
    'use server';

    const roomTypeId = String(formData.get('roomTypeId') || '').trim();
    const rangeFrom = String(formData.get('from') || '').trim();
    const rangeTo = String(formData.get('to') || '').trim();
    const availableUnits = Number(formData.get('availableUnits'));
    const pricePerNight = Number(formData.get('pricePerNight'));
    const stopSell = formData.get('stopSell') === 'on';

    const returnFrom = String(formData.get('returnFrom') || '').trim();
    const returnTo = String(formData.get('returnTo') || '').trim();
    const returnMonth = Number(formData.get('month'));
    const returnYear = Number(formData.get('year'));

    if (!roomTypeId) throw new Error('Room type is required.');
    if (!isValidISODate(rangeFrom) || !isValidISODate(rangeTo)) {
      throw new Error('Valid range dates are required.');
    }
    if (rangeTo < rangeFrom) {
      throw new Error('Range end date must be after range start date.');
    }
    if (!Number.isFinite(availableUnits) || availableUnits < 0) {
      throw new Error('Units must be 0 or greater.');
    }
    if (!Number.isFinite(pricePerNight) || pricePerNight < 0) {
      throw new Error('Price must be 0 or greater.');
    }

    await upsertRoomInventoryRange({
      roomTypeId,
      from: rangeFrom,
      to: rangeTo,
      availableUnits: Math.floor(availableUnits),
      pricePerNight,
      stopSell,
      redirectFrom: isValidISODate(returnFrom) ? returnFrom : rangeFrom,
      redirectTo: isValidISODate(returnTo) ? returnTo : rangeTo,
      redirectSearchParams: {
        month:
          Number.isInteger(returnMonth) && returnMonth >= 1 && returnMonth <= 12
            ? String(returnMonth)
            : undefined,
        year:
          Number.isInteger(returnYear) && returnYear >= 2000 && returnYear <= 2100
            ? String(returnYear)
            : undefined,
      },
    });
  };

  const saveSingleDay = async (formData: FormData) => {
    'use server';

    const roomTypeId = String(formData.get('roomTypeId') || '').trim();
    const date = String(formData.get('date') || '').trim();
    const availableUnits = Number(formData.get('availableUnits'));
    const pricePerNight = Number(formData.get('pricePerNight'));
    const stopSell = formData.get('stopSell') === 'on';

    const returnFrom = String(formData.get('returnFrom') || '').trim();
    const returnTo = String(formData.get('returnTo') || '').trim();
    const returnMonth = Number(formData.get('month'));
    const returnYear = Number(formData.get('year'));

    if (!roomTypeId) throw new Error('Room type is required.');
    if (!isValidISODate(date)) throw new Error('A valid date is required.');
    if (!Number.isFinite(availableUnits) || availableUnits < 0) {
      throw new Error('Units must be 0 or greater.');
    }
    if (!Number.isFinite(pricePerNight) || pricePerNight < 0) {
      throw new Error('Price must be 0 or greater.');
    }

    await upsertRoomInventoryRange({
      roomTypeId,
      from: date,
      to: date,
      availableUnits: Math.floor(availableUnits),
      pricePerNight,
      stopSell,
      redirectFrom: isValidISODate(returnFrom) ? returnFrom : date,
      redirectTo: isValidISODate(returnTo) ? returnTo : date,
      redirectSearchParams: {
        month:
          Number.isInteger(returnMonth) && returnMonth >= 1 && returnMonth <= 12
            ? String(returnMonth)
            : undefined,
        year:
          Number.isInteger(returnYear) && returnYear >= 2000 && returnYear <= 2100
            ? String(returnYear)
            : undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Availability &amp; Rates</h1>
          <p className="text-sm text-muted-foreground">
            Edit inventory and nightly pricing for your room types.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/hotels">Back</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/hotels/rooms">Room Types</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/pricing-rules">Pricing Rules</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/bookings">Bookings</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          {!activeHotel ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>This account has no hotel profile yet.</span>
                <Button asChild size="sm">
                  <Link href="/admin/hotels/setup">Create hotel profile</Link>
                </Button>
              </div>
            </div>
          ) : roomTypes.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Add at least one room type first to manage availability.
            </div>
          ) : (
            <div className="space-y-6">
              <form
                method="GET"
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-6 sm:items-end"
              >
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="roomTypeId">Room Type</Label>
                  <select
                    id="roomTypeId"
                    name="roomTypeId"
                    defaultValue={selectedRoomTypeId}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="month">Month</Label>
                  <select
                    id="month"
                    name="month"
                    defaultValue={String(month)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {MONTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    name="year"
                    type="number"
                    min={2000}
                    max={2100}
                    defaultValue={year}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="from">From</Label>
                  <Input id="from" name="from" type="date" defaultValue={from} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="to">To</Label>
                  <Input id="to" name="to" type="date" defaultValue={to} />
                </div>

                <div className="flex justify-end gap-2 sm:col-span-6">
                  <Button asChild type="button" variant="outline">
                    <Link href={currentMonthHref}>Current month</Link>
                  </Button>
                  <Button type="submit" variant="outline">
                    Apply
                  </Button>
                </div>
              </form>

              {selectedRoomTypeId && selectedRoomType ? (
                <HotelAvailabilityCalendar
                  roomTypeId={selectedRoomTypeId}
                  roomTypeName={selectedRoomType.name}
                  month={month}
                  year={year}
                  from={from}
                  to={to}
                  inventory={inventory.map((row) => ({
                    date: row.date,
                    availableUnits: Number(row.availableUnits ?? 0),
                    pricePerNight: Number(row.pricePerNight ?? 0),
                    stopSell: Boolean(row.stopSell),
                  }))}
                  prevMonthHref={prevMonthHref}
                  nextMonthHref={nextMonthHref}
                  saveSingleDayAction={saveSingleDay}
                  saveRangeAction={saveRange}
                />
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Select a room type to load availability.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Reservations</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedRoomTypeId ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Select a room type to see reservations.
            </div>
          ) : upcomingReservations.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              No upcoming reservations for the selected room type.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReservations.map((b) => (
                <div key={b.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium">{b.guestName || b.guestEmail || 'Guest'}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {b.status}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {b.checkIn} → {b.checkOut} · {b.units} room(s) · {b.guestsAdults} adult(s)
                    {b.guestsChildren ? `, ${b.guestsChildren} child(ren)` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
