import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getHotels, getRoomTypesByHotelId } from '@/lib/supabase/hotels';
import { PlusCircle } from 'lucide-react';

export default async function AdminHotelRoomsPage() {
  const hotels = await getHotels({ skipTranslation: true });
  const activeHotel = hotels[0] || null;

  const roomTypes = activeHotel
    ? await getRoomTypesByHotelId(activeHotel.id, { skipTranslation: true })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Room Types</h1>
          <p className="text-sm text-muted-foreground">Create and manage your hotel room types.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/hotels">Back</Link>
          </Button>
          <Button asChild variant="outline" disabled={!activeHotel}>
            <Link href="/admin/hotels/rooms/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Room
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/pricing-rules">Pricing Rules</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/hotels/availability">Availability</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          {!activeHotel ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Create a hotel first to manage room types.
            </div>
          ) : roomTypes.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>No room types found for {activeHotel.name}.</span>
                <Button asChild size="sm">
                  <Link href="/admin/hotels/rooms/new">Add your first room</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {roomTypes.map((room) => (
                <div key={room.id} className="flex gap-4 rounded-lg border p-4">
                  <div className="relative hidden aspect-[4/3] w-36 overflow-hidden rounded-md bg-muted sm:block">
                    {room.images?.[0] ? (
                      <Image
                        src={room.images[0]}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="180px"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{room.name}</p>
                      <Badge variant={room.isActive ? 'default' : 'secondary'}>
                        {room.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {room.isFeatured ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          Featured
                        </Badge>
                      ) : null}
                      {room.view ? (
                        <Badge variant="outline" className="truncate">
                          {room.view}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        Max {room.maxAdults} adults
                        {room.maxChildren ? `, ${room.maxChildren} children` : ''}
                      </span>
                      {room.sizeSqm != null ? <span>{room.sizeSqm} sqm</span> : null}
                      {room.bathrooms != null ? <span>{room.bathrooms} bath</span> : null}
                      {room.basePricePerNight != null ? (
                        <span>
                          {room.basePricePerNight}
                          {room.currency ? ` ${room.currency}` : ''}
                          /night
                        </span>
                      ) : null}
                    </div>

                    {room.highlights?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {room.highlights.slice(0, 3).map((h) => (
                          <Badge key={h} variant="secondary" className="truncate">
                            {h}
                          </Badge>
                        ))}
                        {room.highlights.length > 3 ? (
                          <Badge variant="secondary">+{room.highlights.length - 3}</Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-start gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/hotels/rooms/${room.id}`}>Edit</Link>
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
