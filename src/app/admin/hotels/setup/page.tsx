import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createHotelProfile, getHotels, updateHotelProfile } from '@/lib/supabase/hotels';

export default async function SetupHotelPage() {
  const hotels = await getHotels({ skipTranslation: true });
  const hotel = hotels[0] || null;

  const saveHotel = async (formData: FormData) => {
    'use server';

    const hotelId = String(formData.get('hotelId') || '').trim();
    const name = String(formData.get('name') || '').trim();
    const slug = String(formData.get('slug') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const city = String(formData.get('city') || '').trim();
    const country = String(formData.get('country') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const contactEmail = String(formData.get('contactEmail') || '').trim();
    const contactPhone = String(formData.get('contactPhone') || '').trim();
    const website = String(formData.get('website') || '').trim();
    const timezone = String(formData.get('timezone') || '').trim();
    const starRatingRaw = String(formData.get('starRating') || '').trim();
    const latitudeRaw = String(formData.get('latitude') || '').trim();
    const longitudeRaw = String(formData.get('longitude') || '').trim();
    const checkInTime = String(formData.get('checkInTime') || '').trim();
    const checkOutTime = String(formData.get('checkOutTime') || '').trim();
    const isActive = formData.get('isActive') === 'on';

    if (!name) {
      throw new Error('Hotel name is required.');
    }

    const starRating = starRatingRaw ? Number(starRatingRaw) : null;
    const latitude = latitudeRaw ? Number(latitudeRaw) : null;
    const longitude = longitudeRaw ? Number(longitudeRaw) : null;

    if (hotelId) {
      await updateHotelProfile({
        id: hotelId,
        name,
        slug: slug || name,
        description: description || undefined,
        city: city || undefined,
        country: country || undefined,
        address: address || undefined,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        website: website || undefined,
        timezone: timezone || undefined,
        starRating: Number.isFinite(starRating) ? starRating : null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
        isActive,
      });
    } else {
      await createHotelProfile({
        name,
        slug: slug || undefined,
        description: description || undefined,
        city: city || undefined,
        country: country || undefined,
        address: address || undefined,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        website: website || undefined,
        timezone: timezone || undefined,
        starRating: Number.isFinite(starRating) ? starRating : null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
        isActive,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Hotel Profile</h1>
          <p className="text-sm text-muted-foreground">
            {hotel ? 'Update your hotel details.' : 'Create the hotel profile for this account.'}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/hotels">Back</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{hotel ? 'Edit Profile' : 'Create Profile'}</CardTitle>
            <CardDescription>Used for public pages and hotel booking flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveHotel} className="grid gap-6">
              <input type="hidden" name="hotelId" value={hotel?.id || ''} />

              <div className="grid gap-2">
                <Label htmlFor="name">Hotel Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Tourista Hotel"
                  required
                  defaultValue={hotel?.name || ''}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="tourista-hotel"
                  defaultValue={hotel?.slug || ''}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Tell guests what makes your hotel special…"
                  defaultValue={hotel?.description || ''}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    placeholder="Cairo"
                    defaultValue={hotel?.city || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    placeholder="Egypt"
                    defaultValue={hotel?.country || ''}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Street, district, etc."
                  defaultValue={hotel?.address || ''}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    placeholder="reservations@hotel.com"
                    defaultValue={hotel?.contactEmail || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    name="contactPhone"
                    placeholder="+20 10 0000 0000"
                    defaultValue={hotel?.contactPhone || ''}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    placeholder="https://hotel.com"
                    defaultValue={hotel?.website || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    name="timezone"
                    placeholder="Africa/Cairo"
                    defaultValue={hotel?.timezone || ''}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="starRating">Star Rating</Label>
                  <select
                    id="starRating"
                    name="starRating"
                    defaultValue={hotel?.starRating ?? ''}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Not set</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      name="latitude"
                      type="number"
                      step="0.000001"
                      placeholder="30.0444"
                      defaultValue={hotel?.latitude ?? ''}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      name="longitude"
                      type="number"
                      step="0.000001"
                      placeholder="31.2357"
                      defaultValue={hotel?.longitude ?? ''}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="checkInTime">Check-in Time</Label>
                  <Input
                    id="checkInTime"
                    name="checkInTime"
                    type="time"
                    defaultValue={hotel?.checkInTime || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="checkOutTime">Check-out Time</Label>
                  <Input
                    id="checkOutTime"
                    name="checkOutTime"
                    type="time"
                    defaultValue={hotel?.checkOutTime || ''}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={hotel ? hotel.isActive : true}
                  className="h-4 w-4"
                />
                Active (visible on public site)
              </label>

              <div className="flex justify-end gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href="/admin/hotels">Cancel</Link>
                </Button>
                <Button type="submit">{hotel ? 'Save Changes' : 'Create Hotel'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Finish setup to start selling rooms.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild disabled={!hotel}>
              <Link href="/admin/hotels/rooms/new">Add your first room</Link>
            </Button>
            <Button asChild variant="outline" disabled={!hotel}>
              <Link href="/admin/hotels/availability">Set availability &amp; prices</Link>
            </Button>
            <Button asChild variant="outline" disabled={!hotel}>
              <Link href="/admin/hotels/pricing-rules">Manage pricing rules</Link>
            </Button>
            <Button asChild variant="outline" disabled={!hotel}>
              <Link href="/admin/hotels/bookings">View bookings</Link>
            </Button>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              This app is configured for one hotel per account (enforced in the database).
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
