import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getHotels, getRoomTypesByHotelId } from '@/lib/supabase/hotels';
import {
  createPricingRule,
  deletePricingRule,
  listPricingRulesForAgency,
  togglePricingRuleActive,
  updatePricingRule,
} from '@/lib/supabase/room-pricing-rules-admin';
import type { Hotel, RoomType } from '@/types';

type SearchParams = Record<string, string | string[] | undefined>;

type PricingRuleConflictCandidate = {
  hotelId: string | null;
  roomTypeId: string | null;
  minNights: number;
  isActive: boolean;
};

function readOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRequiredString(formData: FormData, key: string, label: string): string {
  const value = readOptionalString(formData.get(key));
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function parseIntField(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

function parseNumberField(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return parsed;
}

function buildPricingRulesPath(params: {
  hotelId?: string | null;
  roomTypeId?: string | null;
}): string {
  const query = new URLSearchParams();

  if (params.hotelId) {
    query.set('hotelId', params.hotelId);
  }
  if (params.hotelId && params.roomTypeId) {
    query.set('roomTypeId', params.roomTypeId);
  }

  const queryString = query.toString();
  return queryString ? `/admin/hotels/pricing-rules?${queryString}` : '/admin/hotels/pricing-rules';
}

function pickSingleSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDiscountPercent(value: number): string {
  const rendered = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return rendered.replace(/\.0+$|0+$/g, '').replace(/\.$/, '');
}

function describeRuleScope(params: {
  hotelId: string | null;
  roomTypeId: string | null;
  hotelsById: Map<string, Hotel>;
  roomTypesById: Map<string, RoomType>;
  roomTypeHotelById: Map<string, string>;
}): string {
  if (params.roomTypeId) {
    const roomType = params.roomTypesById.get(params.roomTypeId);
    const roomTypeHotelId = params.roomTypeHotelById.get(params.roomTypeId) ?? params.hotelId;
    const hotel = roomTypeHotelId ? params.hotelsById.get(roomTypeHotelId) : null;

    if (hotel && roomType) return `${hotel.name} / ${roomType.name}`;
    if (roomType) return `Room type: ${roomType.name}`;
    return 'Room type scope';
  }

  if (params.hotelId) {
    const hotel = params.hotelsById.get(params.hotelId);
    return hotel ? `Hotel: ${hotel.name}` : 'Hotel scope';
  }

  return 'Agency-wide';
}

function scopeDescription(hotel: Hotel | null, roomType: RoomType | null): string {
  if (hotel && roomType) return `Current scope: ${hotel.name} / ${roomType.name}`;
  if (hotel) return `Current scope: ${hotel.name}`;
  return 'Current scope: Agency-wide (all hotels and room types)';
}

function getPricingRuleConflictKey(
  rule: Pick<PricingRuleConflictCandidate, 'hotelId' | 'roomTypeId' | 'minNights'>
): string {
  return `${rule.hotelId ?? 'agency'}:${rule.roomTypeId ?? 'all-room-types'}:${rule.minNights}`;
}

function getActiveDuplicateRuleKeys(rules: PricingRuleConflictCandidate[]): Set<string> {
  const counts = new Map<string, number>();

  for (const rule of rules) {
    if (!rule.isActive) continue;
    const key = getPricingRuleConflictKey(rule);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  );
}

function isSamePricingRuleScope(
  rule: Pick<PricingRuleConflictCandidate, 'hotelId' | 'roomTypeId'>,
  hotelId: string | null,
  roomTypeId: string | null
): boolean {
  return (rule.hotelId ?? null) === hotelId && (rule.roomTypeId ?? null) === roomTypeId;
}

export default async function AdminHotelPricingRulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const hotels = await getHotels({ skipTranslation: true });
  const roomTypeGroups = await Promise.all(
    hotels.map(async (hotel) => ({
      hotelId: hotel.id,
      roomTypes: await getRoomTypesByHotelId(hotel.id, { skipTranslation: true }),
    }))
  );

  const hotelsById = new Map<string, Hotel>(hotels.map((hotel) => [hotel.id, hotel]));
  const roomTypesById = new Map<string, RoomType>();
  const roomTypeHotelById = new Map<string, string>();
  const roomTypesByHotelId = new Map<string, RoomType[]>();

  for (const group of roomTypeGroups) {
    roomTypesByHotelId.set(group.hotelId, group.roomTypes);
    for (const roomType of group.roomTypes) {
      roomTypesById.set(roomType.id, roomType);
      roomTypeHotelById.set(roomType.id, group.hotelId);
    }
  }

  const selectedHotelCandidate = pickSingleSearchParam(sp.hotelId);
  const selectedHotelId =
    selectedHotelCandidate && hotelsById.has(selectedHotelCandidate)
      ? selectedHotelCandidate
      : null;

  const roomTypeOptions = selectedHotelId ? (roomTypesByHotelId.get(selectedHotelId) ?? []) : [];

  const selectedRoomTypeCandidate = pickSingleSearchParam(sp.roomTypeId);
  const selectedRoomTypeId =
    selectedHotelId &&
    selectedRoomTypeCandidate &&
    roomTypeOptions.some((roomType) => roomType.id === selectedRoomTypeCandidate)
      ? selectedRoomTypeCandidate
      : null;

  const rules = await listPricingRulesForAgency({
    hotelId: selectedHotelId,
    roomTypeId: selectedRoomTypeId,
  });

  const selectedHotel = selectedHotelId ? (hotelsById.get(selectedHotelId) ?? null) : null;
  const selectedRoomType = selectedRoomTypeId
    ? (roomTypesById.get(selectedRoomTypeId) ?? null)
    : null;

  const defaultSortOrder =
    rules.length > 0 ? Math.max(...rules.map((rule) => rule.sortOrder)) + 10 : 0;
  const activeDuplicateRuleKeys = getActiveDuplicateRuleKeys(rules);
  const selectedScopeRuleCount = rules.filter((rule) =>
    isSamePricingRuleScope(rule, selectedHotelId, selectedRoomTypeId)
  ).length;

  const createRuleAction = async (formData: FormData) => {
    'use server';

    const hotelId = readOptionalString(formData.get('hotelId'));
    const roomTypeId = readOptionalString(formData.get('roomTypeId'));
    const minNights = parseIntField(
      readRequiredString(formData, 'minNights', 'Min nights'),
      'Min nights'
    );
    const discountPercent = parseNumberField(
      readRequiredString(formData, 'discountPercent', 'Discount percent'),
      'Discount percent'
    );
    const sortOrderRaw = readOptionalString(formData.get('sortOrder'));
    const sortOrder = sortOrderRaw ? parseIntField(sortOrderRaw, 'Sort order') : 0;
    const isActive = formData.get('isActive') === 'on';

    await createPricingRule({
      hotelId,
      roomTypeId,
      minNights,
      discountPercent,
      sortOrder,
      isActive,
    });

    const returnHotelId = readOptionalString(formData.get('returnHotelId'));
    const returnRoomTypeId = readOptionalString(formData.get('returnRoomTypeId'));

    redirect(
      buildPricingRulesPath({
        hotelId: returnHotelId,
        roomTypeId: returnHotelId ? returnRoomTypeId : null,
      })
    );
  };

  const updateRuleAction = async (formData: FormData) => {
    'use server';

    const id = readRequiredString(formData, 'id', 'Rule id');
    const minNights = parseIntField(
      readRequiredString(formData, 'minNights', 'Min nights'),
      'Min nights'
    );
    const discountPercent = parseNumberField(
      readRequiredString(formData, 'discountPercent', 'Discount percent'),
      'Discount percent'
    );
    const sortOrder = parseIntField(
      readRequiredString(formData, 'sortOrder', 'Sort order'),
      'Sort order'
    );
    const isActive = formData.get('isActive') === 'on';

    await updatePricingRule({
      id,
      minNights,
      discountPercent,
      sortOrder,
      isActive,
    });

    const returnHotelId = readOptionalString(formData.get('returnHotelId'));
    const returnRoomTypeId = readOptionalString(formData.get('returnRoomTypeId'));

    redirect(
      buildPricingRulesPath({
        hotelId: returnHotelId,
        roomTypeId: returnHotelId ? returnRoomTypeId : null,
      })
    );
  };

  const toggleRuleAction = async (formData: FormData) => {
    'use server';

    const id = readRequiredString(formData, 'id', 'Rule id');
    const isActiveRaw = readRequiredString(formData, 'isActive', 'isActive');
    const isActive = isActiveRaw === 'true';

    if (!['true', 'false'].includes(isActiveRaw)) {
      throw new Error('isActive must be true or false.');
    }

    await togglePricingRuleActive({ id, isActive });

    const returnHotelId = readOptionalString(formData.get('returnHotelId'));
    const returnRoomTypeId = readOptionalString(formData.get('returnRoomTypeId'));

    redirect(
      buildPricingRulesPath({
        hotelId: returnHotelId,
        roomTypeId: returnHotelId ? returnRoomTypeId : null,
      })
    );
  };

  const deleteRuleAction = async (formData: FormData) => {
    'use server';

    const id = readRequiredString(formData, 'id', 'Rule id');
    await deletePricingRule({ id });

    const returnHotelId = readOptionalString(formData.get('returnHotelId'));
    const returnRoomTypeId = readOptionalString(formData.get('returnRoomTypeId'));

    redirect(
      buildPricingRulesPath({
        hotelId: returnHotelId,
        roomTypeId: returnHotelId ? returnRoomTypeId : null,
      })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stay-Length Pricing Rules</h1>
          <p className="text-sm text-muted-foreground">
            Manage discount tiers based on minimum number of nights.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/hotels">Back</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/hotels/rooms">Room Types</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/hotels/availability">Availability</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="hotelId">Hotel</Label>
              <select
                id="hotelId"
                name="hotelId"
                defaultValue={selectedHotelId ?? ''}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All hotels</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="roomTypeId">Room Type</Label>
              <select
                id="roomTypeId"
                name="roomTypeId"
                defaultValue={selectedRoomTypeId ?? ''}
                disabled={!selectedHotelId}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">All room types</option>
                {roomTypeOptions.map((roomType) => (
                  <option key={roomType.id} value={roomType.id}>
                    {roomType.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" variant="outline">
                Apply Filters
              </Button>
              <Button asChild variant="ghost">
                <Link href="/admin/hotels/pricing-rules">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createRuleAction} className="grid gap-4 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="hotelId" value={selectedHotelId ?? ''} />
            <input type="hidden" name="roomTypeId" value={selectedRoomTypeId ?? ''} />
            <input type="hidden" name="returnHotelId" value={selectedHotelId ?? ''} />
            <input type="hidden" name="returnRoomTypeId" value={selectedRoomTypeId ?? ''} />

            <div className="sm:col-span-4">
              <p className="text-sm text-muted-foreground">
                {scopeDescription(selectedHotel, selectedRoomType)}
              </p>
              {selectedScopeRuleCount > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  This scope already has {selectedScopeRuleCount}{' '}
                  {selectedScopeRuleCount === 1 ? 'rule' : 'rules'}. Use a unique minimum-night
                  threshold to avoid competing discounts.
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="addMinNights">Min Nights</Label>
              <Input
                id="addMinNights"
                name="minNights"
                type="number"
                min={2}
                defaultValue={2}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="addDiscountPercent">Discount %</Label>
              <Input
                id="addDiscountPercent"
                name="discountPercent"
                type="number"
                min={0.01}
                max={99.99}
                step={0.01}
                defaultValue={5}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="addSortOrder">Sort Order</Label>
              <Input
                id="addSortOrder"
                name="sortOrder"
                type="number"
                step={1}
                defaultValue={defaultSortOrder}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <label htmlFor="addIsActive" className="text-sm font-medium">
                Active
              </label>
              <input
                id="addIsActive"
                name="isActive"
                type="checkbox"
                defaultChecked
                className="h-4 w-4"
              />
            </div>

            <div className="sm:col-span-4 flex justify-end">
              <Button type="submit">Create Rule</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              No pricing rules found for the selected filter.
            </div>
          ) : (
            <div className="space-y-3">
              {activeDuplicateRuleKeys.size > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                >
                  <p className="font-medium">Duplicate active tiers need review.</p>
                  <p className="mt-1">
                    Two or more active rules share the same scope and minimum-night threshold. Edit
                    or deactivate one of them before relying on these discounts.
                  </p>
                </div>
              )}
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {describeRuleScope({
                          hotelId: rule.hotelId,
                          roomTypeId: rule.roomTypeId,
                          hotelsById,
                          roomTypesById,
                          roomTypeHotelById,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">Rule ID: {rule.id}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {rule.isActive &&
                        activeDuplicateRuleKeys.has(getPricingRuleConflictKey(rule)) && (
                          <Badge variant="destructive">Duplicate active tier</Badge>
                        )}

                      <form action={toggleRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <input type="hidden" name="isActive" value={(!rule.isActive).toString()} />
                        <input type="hidden" name="returnHotelId" value={selectedHotelId ?? ''} />
                        <input
                          type="hidden"
                          name="returnRoomTypeId"
                          value={selectedRoomTypeId ?? ''}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {rule.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </form>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive" size="sm">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this pricing rule?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the {rule.minNights}-night tier for{' '}
                              {describeRuleScope({
                                hotelId: rule.hotelId,
                                roomTypeId: rule.roomTypeId,
                                hotelsById,
                                roomTypesById,
                                roomTypeHotelById,
                              })}
                              . The action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <form action={deleteRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <input
                                type="hidden"
                                name="returnHotelId"
                                value={selectedHotelId ?? ''}
                              />
                              <input
                                type="hidden"
                                name="returnRoomTypeId"
                                value={selectedRoomTypeId ?? ''}
                              />
                              <AlertDialogAction asChild>
                                <Button type="submit" variant="destructive">
                                  Delete rule
                                </Button>
                              </AlertDialogAction>
                            </form>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <form
                    action={updateRuleAction}
                    className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end"
                  >
                    <input type="hidden" name="id" value={rule.id} />
                    <input type="hidden" name="returnHotelId" value={selectedHotelId ?? ''} />
                    <input type="hidden" name="returnRoomTypeId" value={selectedRoomTypeId ?? ''} />

                    <div className="grid gap-2">
                      <Label htmlFor={`minNights-${rule.id}`}>Min Nights</Label>
                      <Input
                        id={`minNights-${rule.id}`}
                        name="minNights"
                        type="number"
                        min={2}
                        step={1}
                        defaultValue={rule.minNights}
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`discountPercent-${rule.id}`}>Discount %</Label>
                      <Input
                        id={`discountPercent-${rule.id}`}
                        name="discountPercent"
                        type="number"
                        min={0.01}
                        max={99.99}
                        step={0.01}
                        defaultValue={rule.discountPercent}
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`sortOrder-${rule.id}`}>Sort Order</Label>
                      <Input
                        id={`sortOrder-${rule.id}`}
                        name="sortOrder"
                        type="number"
                        step={1}
                        defaultValue={rule.sortOrder}
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <label htmlFor={`isActive-${rule.id}`} className="text-sm font-medium">
                        Active
                      </label>
                      <input
                        id={`isActive-${rule.id}`}
                        name="isActive"
                        type="checkbox"
                        defaultChecked={rule.isActive}
                        className="h-4 w-4"
                      />
                    </div>

                    <div className="sm:col-span-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Min {rule.minNights} nights, {formatDiscountPercent(rule.discountPercent)}%
                        off, sort {rule.sortOrder}
                      </span>
                      <Button type="submit" size="sm">
                        Save Changes
                      </Button>
                    </div>
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
