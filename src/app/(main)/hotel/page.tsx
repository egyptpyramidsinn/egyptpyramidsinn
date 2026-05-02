import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  getPublicHotels,
  getPublicHotelBySlug,
  getPublicRoomTypesByHotelId,
} from '@/lib/supabase/hotels';
import { getCurrentAgency } from '@/lib/supabase/agencies';
import { getAgencySettings } from '@/lib/supabase/agency-content';
import { getApprovedReviewsForHotel } from '@/lib/supabase/reviews';
import { ReviewForm } from '@/components/review-form';
import { ReviewsDisplay } from '@/components/reviews-display';
import { RoomsGrid } from '@/components/rooms-grid';
import { BLUR_DATA_URL } from '@/lib/blur-data-url';

export default async function HotelPage() {
  const agency = await getCurrentAgency();
  const settings = await getAgencySettings();

  let hotel = agency?.slug ? await getPublicHotelBySlug(agency.slug) : null;
  if (!hotel) {
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
  const singleHotelMode = settings?.data?.singleHotelMode ?? true;
  const heroImage = hotel.images?.[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      {heroImage ? (
        <div className="relative mb-8 h-64 w-full overflow-hidden rounded-2xl md:h-96">
          <Image
            src={heroImage}
            alt={hotel.name}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full p-6 text-white">
            <h1 className="font-headline text-3xl font-bold md:text-5xl">{hotel.name}</h1>
            {hotel.city || hotel.country ? (
              <p className="mt-2 text-sm opacity-90 md:text-base">
                {[hotel.city, hotel.country].filter(Boolean).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="font-headline text-3xl font-semibold md:text-5xl">{hotel.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {[hotel.city, hotel.country, hotel.address].filter(Boolean).join(', ')}
          </p>
        </div>
      )}

      {hotel.description ? (
        <p className="mb-10 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
          {hotel.description}
        </p>
      ) : null}

      <section className="space-y-6" id="rooms">
        <h2 className="font-headline text-2xl font-semibold md:text-3xl">Rooms</h2>
        <RoomsGrid rooms={roomTypes} hotelSlug={hotel.slug} singleHotelMode={singleHotelMode} />
      </section>

      {reviewsEnabled && (
        <div className="mt-12 space-y-8">
          <ReviewsDisplay reviews={reviews} title={`Reviews for ${hotel.name}`} />
          <ReviewForm agencyId={agency?.id || ''} hotelId={hotel.id} itemName={hotel.name} />
        </div>
      )}
    </div>
  );
}
