'use server';

import { updateRoomType } from '@/lib/supabase/hotels';

export async function updateRoomTypeAction(formData: FormData) {
  const getStr = (key: string) => String(formData.get(key) || '').trim();
  const getNum = (key: string) => {
    const raw = getStr(key);
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const id = getStr('_roomId');
  const hotelId = getStr('_hotelId');

  if (!id || !hotelId) {
    throw new Error('Missing room or hotel identifier.');
  }

  const name = getStr('name');
  const slug = getStr('slug');
  const fallbackSlug = getStr('_fallbackSlug');
  const description = getStr('description');
  const maxAdults = Number(getStr('maxAdults') || 0);
  const maxChildren = Number(getStr('maxChildren') || 0);
  const isActive = formData.get('isActive') === 'on';

  if (!name) {
    throw new Error('Room name is required.');
  }

  const bedsJson = getStr('bedsJson') || '{}';
  let beds: Record<string, unknown> = {};
  try {
    beds = JSON.parse(bedsJson) as Record<string, unknown>;
  } catch {
    beds = {};
  }

  const amenities = formData
    .getAll('amenities')
    .map(String)
    .map((v) => v.trim())
    .filter(Boolean);

  const services = formData
    .getAll('services')
    .map(String)
    .map((v) => v.trim())
    .filter(Boolean);

  const highlights = formData
    .getAll('highlights')
    .map(String)
    .map((v) => v.trim())
    .filter(Boolean);

  // existingImages are submitted in display order — the first element is the "primary" image.
  const existingImages = formData
    .getAll('existingImages')
    .map(String)
    .map((v) => v.trim())
    .filter(Boolean);

  const images = formData
    .getAll('images')
    .filter((v): v is File => typeof v === 'object' && 'name' in v && 'size' in v)
    .filter((f) => f.size > 0);

  // accessibility is intentionally NOT passed → updateRoomType will preserve the existing DB value.
  await updateRoomType({
    id,
    hotelId,
    name,
    slug: slug || fallbackSlug,
    description: description || undefined,
    maxAdults: Number.isFinite(maxAdults) ? maxAdults : 0,
    maxChildren: Number.isFinite(maxChildren) ? maxChildren : 0,
    sizeSqm: getNum('sizeSqm'),
    view: getStr('view') || null,
    bathrooms: getNum('bathrooms'),
    floor: getNum('floor'),
    basePricePerNight: getNum('basePricePerNight'),
    currency: getStr('currency') || null,
    defaultUnits: getNum('defaultUnits'),
    smokingAllowed: formData.get('smokingAllowed') === 'on',
    refundable: formData.get('refundable') === 'on',
    breakfastIncluded: formData.get('breakfastIncluded') === 'on',
    petsAllowed: formData.get('petsAllowed') === 'on',
    extraBedAllowed: formData.get('extraBedAllowed') === 'on',
    extraBedFee: getNum('extraBedFee'),
    cancellationPolicy: getStr('cancellationPolicy') || undefined,
    beds,
    amenities,
    services,
    highlights,
    images: [...existingImages, ...images],
    isFeatured: formData.get('isFeatured') === 'on',
    isActive,
  });
  // updateRoomType calls redirect() internally — no explicit redirect needed here.
}
