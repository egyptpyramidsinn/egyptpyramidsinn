import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getHotelDashboardOperationsSummary,
  getHotels,
  getRoomTypesByHotelId,
} from '@/lib/supabase/hotels';
import { BedDouble, Building2, Calendar, DollarSign } from 'lucide-react';

export default async function AdminHotelsPage() {
  const [hotels, operationsSummary] = await Promise.all([
    getHotels({ skipTranslation: true }),
    getHotelDashboardOperationsSummary(),
  ]);

  const roomsByHotel = await Promise.all(
    hotels.map(async (h) => ({
      hotelId: h.id,
      rooms: await getRoomTypesByHotelId(h.id, { skipTranslation: true }),
    }))
  );

  const totalRoomTypes = roomsByHotel.reduce((sum, h) => sum + h.rooms.length, 0);
  const activeRoomTypes = roomsByHotel.reduce(
    (sum, h) => sum + h.rooms.filter((r) => r.isActive).length,
    0
  );

  const formatUSD = (value: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `$${Math.round(value)}`;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hotels Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage hotel profile, room types, availability, and bookings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/hotels/rooms">Room Types</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/pricing-rules">Pricing Rules</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/availability">Availability</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/hotels/bookings">Bookings</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/setup">
              {hotels.length === 0 ? 'Create Hotel' : 'Edit Profile'}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hotels</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hotels.length}</div>
            <p className="text-xs text-muted-foreground">
              {hotels.filter((h) => h.isActive).length} active
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Room Types</CardTitle>
            <BedDouble className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRoomTypes}</div>
            <p className="text-xs text-muted-foreground">{activeRoomTypes} active</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Check-ins</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{operationsSummary.upcomingCheckIns}</div>
            <p className="text-xs text-muted-foreground">From today onward</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hotel Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUSD(operationsSummary.revenueTotal)}</div>
            <p className="text-xs text-muted-foreground">
              {operationsSummary.activeBookings} booking(s)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hotel Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {hotels.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>No hotel profile yet for this account.</span>
                <Button asChild size="sm">
                  <Link href="/admin/hotels/setup">Create hotel profile</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {hotels.map((hotel) => (
                <div
                  key={hotel.id}
                  className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{hotel.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {hotel.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {hotel.city || hotel.country || hotel.address || '—'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/hotels/${hotel.slug}`} target="_blank">
                        View Public
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
