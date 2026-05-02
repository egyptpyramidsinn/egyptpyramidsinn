import { notFound, redirect } from 'next/navigation';
import { getPublicHotelBySlug, getRoomTypeBySlug } from '@/lib/supabase/hotels';
import { getAgencySettings } from '@/lib/supabase/agency-content';
import { getRoomAddons } from '@/lib/supabase/room-pricing';
import { RoomDetailView } from '@/components/room-detail-view';

interface RoomPageProps {
  params: Promise<{ slug: string; roomSlug: string }>;
}

export default async function HotelRoomDetailPage({ params }: RoomPageProps) {
  const { slug: hotelSlug, roomSlug } = await params;
  const settings = await getAgencySettings();
  const singleHotelMode = settings?.data?.singleHotelMode === true;

  if (singleHotelMode) {
    redirect(`/rooms/${roomSlug}`);
  }

  const hotel = await getPublicHotelBySlug(hotelSlug);
  if (!hotel) {
    notFound();
  }

  const room = await getRoomTypeBySlug({ hotelId: hotel.id, roomSlug });
  if (!room || !room.isActive) {
    notFound();
  }

  const addons = await getRoomAddons(room.id);

  return <RoomDetailView room={room} hotel={hotel} addons={addons} singleHotelMode={false} />;
}
