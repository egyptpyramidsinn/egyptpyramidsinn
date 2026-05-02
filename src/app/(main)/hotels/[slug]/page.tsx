import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  getPublicHotelBySlug,
  getPublicHotels,
  getPublicRoomTypesByHotelId,
} from '@/lib/supabase/hotels';
import { getCurrentAgency } from '@/lib/supabase/agencies';
import { getAgencySettings } from '@/lib/supabase/agency-content';
import { getApprovedReviewsForHotel } from '@/lib/supabase/reviews';
import { ReviewForm } from '@/components/review-form';
import { ReviewsDisplay } from '@/components/reviews-display';
import { RoomsGrid } from '@/components/rooms-grid';

interface HotelDetailsPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function HotelDetailsPage({ params }: HotelDetailsPageProps) {
  const { slug } = await params;
  const settings = await getAgencySettings();
  const singleHotelMode = settings?.data?.singleHotelMode === true;

  if (singleHotelMode) {
    redirect('/hotel');
  }

  const agency = await getCurrentAgency();
  const requestedSlug = slug === 'default' ? (agency?.slug ?? slug) : slug;
  let hotel = await getPublicHotelBySlug(requestedSlug);

  if (!hotel && slug === 'default') {
    const hotels = await getPublicHotels({ skipTranslation: true });
    hotel = hotels[0] ?? null;
  }

  if (!hotel) {
    notFound();
  }

  const [roomTypes, reviews] = await Promise.all([
    getPublicRoomTypesByHotelId(hotel.id),
    getApprovedReviewsForHotel(hotel.id),
  ]);

  const reviewsEnabled = agency?.settings?.modules?.reviews !== false;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8">
        <Link href="/hotels" className="text-sm text-muted-foreground hover:underline">
          ← Back to hotels
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">{hotel.name}</h1>
        <p className="mt-2 text-muted-foreground">
          {hotel.city || hotel.country || hotel.address || ''}
        </p>
        {hotel.description ? (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {hotel.description}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Rooms</h2>
        <RoomsGrid rooms={roomTypes} hotelSlug={hotel.slug} singleHotelMode={false} />
      </div>

      {/* Reviews Section */}
      {reviewsEnabled && (
        <div className="mt-10 space-y-8">
          <ReviewsDisplay reviews={reviews} title={`Reviews for ${hotel.name}`} />
          <ReviewForm agencyId={agency?.id || ''} hotelId={hotel.id} itemName={hotel.name} />
        </div>
      )}
    </div>
  );
}
