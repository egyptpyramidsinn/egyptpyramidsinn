import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getHotelBookings, updateHotelBookingStatus } from '@/lib/supabase/hotels';
import type { HotelBookingStatus } from '@/types';

const STATUS_LABELS: Record<HotelBookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const NEXT_STATUS_OPTIONS: Record<HotelBookingStatus, HotelBookingStatus[]> = {
  pending: ['confirmed', 'paid', 'cancelled'],
  confirmed: ['paid', 'pending', 'cancelled'],
  paid: ['confirmed', 'pending', 'cancelled'],
  cancelled: ['pending', 'confirmed', 'paid'],
};

export default async function AdminHotelBookingsPage() {
  const bookings = await getHotelBookings();

  const updateStatus = async (formData: FormData) => {
    'use server';

    const bookingId = String(formData.get('bookingId') || '').trim();
    const status = String(formData.get('status') || '').trim() as HotelBookingStatus;
    await updateHotelBookingStatus(bookingId, status);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hotel Bookings</h1>
          <p className="text-sm text-muted-foreground">Review and manage room bookings.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/hotels">Back</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              No hotel bookings yet.
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.slice(0, 50).map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.guestName || b.guestEmail || 'Guest'}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {b.hotelName || 'Hotel'} · {b.roomTypeName || 'Room'}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {b.checkIn} → {b.checkOut} · {b.units} room(s) · {STATUS_LABELS[b.status]}
                    </p>
                  </div>
                  <form action={updateStatus} className="flex flex-wrap gap-2">
                    <input type="hidden" name="bookingId" value={b.id} />
                    {NEXT_STATUS_OPTIONS[b.status].map((status) => (
                      <Button
                        key={status}
                        type="submit"
                        name="status"
                        value={status}
                        size="sm"
                        variant={status === 'cancelled' ? 'destructive' : 'outline'}
                      >
                        {STATUS_LABELS[status]}
                      </Button>
                    ))}
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
