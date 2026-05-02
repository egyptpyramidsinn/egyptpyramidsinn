import { notFound } from 'next/navigation';
import { getRoomTypeById } from '@/lib/supabase/hotels';
import { RoomTypeForm } from '../room-type-form';
import { updateRoomTypeAction } from '../actions';

export default async function EditRoomTypePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const roomType = await getRoomTypeById(params.id);

  if (!roomType) {
    notFound();
  }

  return (
    <RoomTypeForm
      mode="edit"
      backHref="/admin/hotels/rooms"
      action={updateRoomTypeAction}
      initial={roomType}
      roomId={roomType.id}
      hotelId={roomType.hotelId}
      fallbackSlug={roomType.slug}
    />
  );
}
