import { notFound } from 'next/navigation';
import { getPublicHotelBySlug, getPublicHotels, getRoomTypeBySlug } from '@/lib/supabase/hotels';
import { getCurrentAgency } from '@/lib/supabase/agencies';
import { getAgencySettings } from '@/lib/supabase/agency-content';
import { getRoomAddons } from '@/lib/supabase/room-pricing';
import { RoomDetailView } from '@/components/room-detail-view';

interface RoomPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RoomDetailPage({ params }: RoomPageProps) {
  const { slug } = await params;
  const settings = await getAgencySettings();
  const agency = await getCurrentAgency();

  let hotel = agency?.slug ? await getPublicHotelBySlug(agency.slug) : null;
  if (!hotel) {
    const hotels = await getPublicHotels({ skipTranslation: true });
    hotel = hotels[0] ?? null;
  }

  if (!hotel) {
    notFound();
  }

  const room = await getRoomTypeBySlug({ hotelId: hotel.id, roomSlug: slug });
  if (!room || !room.isActive) {
    notFound();
  }

  const addons = await getRoomAddons(room.id);

  return (
    <RoomDetailView
      room={room}
      hotel={hotel}
      addons={addons}
      singleHotelMode={settings?.data?.singleHotelMode ?? true}
    />
  );
}
