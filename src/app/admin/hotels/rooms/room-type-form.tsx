'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { RoomType } from '@/types';
import { X, Star, ArrowUp, ArrowDown } from 'lucide-react';

const commonAmenities = [
  'Free WiFi',
  'Air conditioning',
  'TV',
  'Mini bar',
  'Safe',
  'Balcony',
  'Sea view',
  'City view',
  'Soundproof',
  'Workspace',
  'Coffee machine',
  'Bathtub',
  'Shower',
  'Hair dryer',
  'Towels',
  'Toiletries',
  'Iron',
  'Wardrobe',
  'Crib available',
];

const commonServices = [
  'Room service',
  'Daily housekeeping',
  'Laundry',
  'Airport pickup',
  'Breakfast',
  'Late checkout',
  'Extra bed',
  'Baby cot',
];

const bedKeys = [
  { key: 'king', label: 'King' },
  { key: 'queen', label: 'Queen' },
  { key: 'double', label: 'Double' },
  { key: 'twin', label: 'Twin' },
  { key: 'single', label: 'Single' },
  { key: 'sofa', label: 'Sofa bed' },
  { key: 'bunk', label: 'Bunk bed' },
];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(String)
    .map((v) => v.trim())
    .filter(Boolean);
}

function coerceBeds(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const { key } of bedKeys) {
    const raw = input[key];
    const num = typeof raw === 'number' ? raw : Number(raw || 0);
    if (Number.isFinite(num) && num > 0) {
      result[key] = Math.floor(num);
    }
  }
  return result;
}

function uniq(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function TagListEditor(props: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState('');

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    props.onChange(uniq([...props.values, trimmed]));
    setDraft('');
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-2">
          <Label>{props.label}</Label>
          <Input
            value={draft}
            placeholder={props.placeholder || 'Type and press Enter'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(draft);
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {props.suggestions && props.suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.suggestions.map((s) => (
            <Button key={s} type="button" size="sm" variant="outline" onClick={() => add(s)}>
              {s}
            </Button>
          ))}
        </div>
      ) : null}

      {props.values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                onClick={() => props.onChange(props.values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No items added.</div>
      )}
    </div>
  );
}

export function RoomTypeForm(props: {
  mode: 'create' | 'edit';
  backHref: string;
  action: (formData: FormData) => void | Promise<void>;
  initial?: RoomType | null;
  /** Required in edit mode — submitted as hidden `_roomId` */
  roomId?: string;
  /** Required in edit mode — submitted as hidden `_hotelId` */
  hotelId?: string;
  /** Fallback slug used if the user clears the slug field */
  fallbackSlug?: string;
}) {
  const initial = props.initial || null;
  const [amenities, setAmenities] = React.useState<string[]>(toStringArray(initial?.amenities));
  const [services, setServices] = React.useState<string[]>(toStringArray(initial?.services));
  const [highlights, setHighlights] = React.useState<string[]>(toStringArray(initial?.highlights));
  const [imageUrls, setImageUrls] = React.useState<string[]>(
    toStringArray(initial?.images).filter((u) => /^https?:\/\//i.test(u))
  );
  const [existingImages, setExistingImages] = React.useState<string[]>(
    toStringArray(initial?.images).filter((u) => /^https?:\/\//i.test(u))
  );
  const [beds, setBeds] = React.useState<Record<string, number>>(coerceBeds(initial?.beds));
  const [customAmenity, setCustomAmenity] = React.useState('');
  const [customService, setCustomService] = React.useState('');
  const [imageUrlDraft, setImageUrlDraft] = React.useState('');

  const addCustom = (value: string, set: (v: string) => void, apply: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    apply(trimmed);
    set('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {props.mode === 'create' ? 'Add Room Type' : 'Edit Room Type'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {props.mode === 'create'
              ? 'Add details, pricing defaults, photos, and services.'
              : 'Update details, pricing defaults, photos, and services.'}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={props.backHref}>Back</Link>
        </Button>
      </div>

      <form action={props.action} className="space-y-6">
        {props.mode === 'edit' ? (
          <>
            {/* Identity fields — allow the server action to operate without closures */}
            {props.roomId ? <input type="hidden" name="_roomId" value={props.roomId} /> : null}
            {props.hotelId ? <input type="hidden" name="_hotelId" value={props.hotelId} /> : null}
            {props.fallbackSlug ? (
              <input type="hidden" name="_fallbackSlug" value={props.fallbackSlug} />
            ) : null}
            {/* Existing images submitted in display order; first = primary */}
            {existingImages.map((url) => (
              <input key={url} type="hidden" name="existingImages" value={url} />
            ))}
          </>
        ) : null}

        {amenities.map((a) => (
          <input key={a} type="hidden" name="amenities" value={a} />
        ))}
        {services.map((s) => (
          <input key={s} type="hidden" name="services" value={s} />
        ))}
        {highlights.map((h) => (
          <input key={h} type="hidden" name="highlights" value={h} />
        ))}
        {props.mode === 'create'
          ? imageUrls.map((u) => <input key={u} type="hidden" name="imageUrls" value={u} />)
          : null}

        <input type="hidden" name="bedsJson" value={JSON.stringify(beds)} />

        <Card>
          <CardHeader>
            <CardTitle>Room Setup</CardTitle>
            <CardDescription>Fill the tabs to create a rich room listing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basics" className="w-full">
              <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-5">
                <TabsTrigger value="basics">Basics</TabsTrigger>
                <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
                <TabsTrigger value="amenities">Amenities</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
              </TabsList>

              <TabsContent value="basics" className="space-y-5">
                <div className="grid gap-2">
                  <Label htmlFor="name">Room Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Deluxe Double"
                    required
                    defaultValue={initial?.name || ''}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    name="slug"
                    placeholder="deluxe-double"
                    defaultValue={initial?.slug || ''}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Sea view, balcony, and premium bedding…"
                    defaultValue={initial?.description || ''}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="sizeSqm">Size (sqm)</Label>
                    <Input
                      id="sizeSqm"
                      name="sizeSqm"
                      type="number"
                      min={0}
                      placeholder="28"
                      defaultValue={initial?.sizeSqm ?? ''}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="view">View</Label>
                    <Input
                      id="view"
                      name="view"
                      placeholder="Sea view"
                      defaultValue={initial?.view ?? ''}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="bathrooms">Bathrooms</Label>
                    <Input
                      id="bathrooms"
                      name="bathrooms"
                      type="number"
                      min={0}
                      placeholder="1"
                      defaultValue={initial?.bathrooms ?? ''}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="floor">Floor</Label>
                    <Input
                      id="floor"
                      name="floor"
                      type="number"
                      min={0}
                      placeholder="3"
                      defaultValue={initial?.floor ?? ''}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked={initial ? initial.isActive : true}
                    className="h-4 w-4"
                  />
                  Active (visible on public site)
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="isFeatured"
                    type="checkbox"
                    defaultChecked={initial?.isFeatured ?? false}
                    className="h-4 w-4"
                  />
                  Featured (show on home page)
                </label>
              </TabsContent>

              <TabsContent value="occupancy" className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="maxAdults">Max Adults</Label>
                    <Input
                      id="maxAdults"
                      name="maxAdults"
                      type="number"
                      min={0}
                      defaultValue={initial?.maxAdults ?? 2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxChildren">Max Children</Label>
                    <Input
                      id="maxChildren"
                      name="maxChildren"
                      type="number"
                      min={0}
                      defaultValue={initial?.maxChildren ?? 0}
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium">Beds</p>
                    <p className="text-sm text-muted-foreground">
                      Specify bed configuration for this room type.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {bedKeys.map((b) => (
                      <div key={b.key} className="grid gap-2">
                        <Label htmlFor={`bed-${b.key}`}>{b.label}</Label>
                        <Input
                          id={`bed-${b.key}`}
                          type="number"
                          min={0}
                          value={beds[b.key] ?? 0}
                          onChange={(e) => {
                            const next = Number(e.target.value || 0);
                            setBeds((prev) => ({
                              ...prev,
                              [b.key]: Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0,
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <TagListEditor
                  label="Highlights"
                  values={highlights}
                  onChange={setHighlights}
                  placeholder="Sea view"
                />
              </TabsContent>

              <TabsContent value="amenities" className="space-y-6">
                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium">Common Amenities</p>
                    <p className="text-sm text-muted-foreground">
                      Choose from the common list or add custom.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {commonAmenities.map((a) => {
                      const checked = amenities.some((x) => x.toLowerCase() === a.toLowerCase());
                      return (
                        <label key={a} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAmenities((prev) => uniq([...prev, a]));
                              } else {
                                setAmenities((prev) =>
                                  prev.filter((x) => x.toLowerCase() !== a.toLowerCase())
                                );
                              }
                            }}
                            className="h-4 w-4"
                          />
                          {a}
                        </label>
                      );
                    })}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="customAmenity">Add custom amenity</Label>
                    <div className="flex gap-2">
                      <Input
                        id="customAmenity"
                        value={customAmenity}
                        onChange={(e) => setCustomAmenity(e.target.value)}
                        placeholder="e.g., Private terrace"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustom(customAmenity, setCustomAmenity, (v) =>
                              setAmenities((p) => uniq([...p, v]))
                            );
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          addCustom(customAmenity, setCustomAmenity, (v) =>
                            setAmenities((p) => uniq([...p, v]))
                          )
                        }
                        disabled={!customAmenity.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  {amenities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {amenities.map((a) => (
                        <Badge key={a} variant="secondary" className="gap-1 pr-1">
                          {a}
                          <button
                            type="button"
                            className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                            onClick={() => setAmenities((prev) => prev.filter((x) => x !== a))}
                            aria-label={`Remove ${a}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <Separator />

                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium">Room Services</p>
                    <p className="text-sm text-muted-foreground">
                      Services included or available for this room type.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {commonServices.map((s) => {
                      const checked = services.some((x) => x.toLowerCase() === s.toLowerCase());
                      return (
                        <label key={s} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setServices((prev) => uniq([...prev, s]));
                              } else {
                                setServices((prev) =>
                                  prev.filter((x) => x.toLowerCase() !== s.toLowerCase())
                                );
                              }
                            }}
                            className="h-4 w-4"
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="customService">Add custom service</Label>
                    <div className="flex gap-2">
                      <Input
                        id="customService"
                        value={customService}
                        onChange={(e) => setCustomService(e.target.value)}
                        placeholder="e.g., In-room spa"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustom(customService, setCustomService, (v) =>
                              setServices((p) => uniq([...p, v]))
                            );
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          addCustom(customService, setCustomService, (v) =>
                            setServices((p) => uniq([...p, v]))
                          )
                        }
                        disabled={!customService.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  {services.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {services.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1 pr-1">
                          {s}
                          <button
                            type="button"
                            className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                            onClick={() => setServices((prev) => prev.filter((x) => x !== s))}
                            aria-label={`Remove ${s}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="basePricePerNight">Base Price Per Night</Label>
                    <Input
                      id="basePricePerNight"
                      name="basePricePerNight"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="120"
                      defaultValue={initial?.basePricePerNight ?? ''}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      name="currency"
                      placeholder="USD"
                      defaultValue={initial?.currency ?? ''}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="defaultUnits">Default Units (optional)</Label>
                  <Input
                    id="defaultUnits"
                    name="defaultUnits"
                    type="number"
                    min={0}
                    placeholder="10"
                    defaultValue={initial?.defaultUnits ?? ''}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="refundable"
                      type="checkbox"
                      defaultChecked={initial ? initial.refundable : true}
                      className="h-4 w-4"
                    />
                    Refundable
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="breakfastIncluded"
                      type="checkbox"
                      defaultChecked={initial ? initial.breakfastIncluded : false}
                      className="h-4 w-4"
                    />
                    Breakfast included
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="smokingAllowed"
                      type="checkbox"
                      defaultChecked={initial ? initial.smokingAllowed : false}
                      className="h-4 w-4"
                    />
                    Smoking allowed
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="petsAllowed"
                      type="checkbox"
                      defaultChecked={initial ? initial.petsAllowed : false}
                      className="h-4 w-4"
                    />
                    Pets allowed
                  </label>
                </div>

                <Separator />

                <div className="grid gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="extraBedAllowed"
                      type="checkbox"
                      defaultChecked={initial ? initial.extraBedAllowed : false}
                      className="h-4 w-4"
                    />
                    Extra bed available
                  </label>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="extraBedFee">Extra Bed Fee (optional)</Label>
                  <Input
                    id="extraBedFee"
                    name="extraBedFee"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="20"
                    defaultValue={initial?.extraBedFee ?? ''}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cancellationPolicy">Cancellation Policy (optional)</Label>
                  <Textarea
                    id="cancellationPolicy"
                    name="cancellationPolicy"
                    placeholder="Free cancellation up to 24 hours before check-in…"
                    defaultValue={initial?.cancellationPolicy ?? ''}
                  />
                </div>
              </TabsContent>

              <TabsContent value="media" className="space-y-6">
                {props.mode === 'edit' && existingImages.length > 0 ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Existing Images</p>
                      <p className="text-sm text-muted-foreground">
                        Drag to reorder or use the arrows. The first image is shown as the primary
                        photo on listing cards.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {existingImages.map((url, idx) => (
                        <div key={url} className="rounded-lg border p-2">
                          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                            <Image src={url} alt="" fill className="object-cover" sizes="300px" />
                            {idx === 0 ? (
                              <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-yellow-400 px-1.5 py-0.5 text-xs font-semibold text-yellow-900">
                                <Star className="h-3 w-3" /> Primary
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <div className="flex gap-1">
                              {/* Move up / set as primary */}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                disabled={idx === 0}
                                title="Move up"
                                onClick={() => {
                                  setExistingImages((prev) => {
                                    const next = [...prev];
                                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                    return next;
                                  });
                                }}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              {/* Move down */}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                disabled={idx === existingImages.length - 1}
                                title="Move down"
                                onClick={() => {
                                  setExistingImages((prev) => {
                                    const next = [...prev];
                                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                    return next;
                                  });
                                }}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              {idx !== 0 ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  title="Set as primary"
                                  onClick={() => {
                                    setExistingImages((prev) => {
                                      const next = [...prev];
                                      next.splice(idx, 1);
                                      return [url, ...next];
                                    });
                                  }}
                                >
                                  <Star className="mr-1 h-3 w-3" /> Set primary
                                </Button>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-destructive hover:text-destructive"
                              title="Remove"
                              onClick={() => {
                                setExistingImages((prev) => prev.filter((x) => x !== url));
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Show removed images so admin can undo */}
                {props.mode === 'edit' &&
                toStringArray(initial?.images).some((u) => !existingImages.includes(u)) ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Removed images</p>
                    <div className="flex flex-wrap gap-2">
                      {toStringArray(initial?.images)
                        .filter((u) => !existingImages.includes(u))
                        .map((url) => (
                          <button
                            key={url}
                            type="button"
                            className="group relative h-16 w-20 overflow-hidden rounded border border-dashed opacity-50 hover:opacity-80"
                            title="Undo removal"
                            onClick={() => setExistingImages((prev) => [...prev, url])}
                          >
                            <Image src={url} alt="" fill className="object-cover" sizes="80px" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-medium text-white opacity-0 group-hover:opacity-100">
                              Undo
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="images">Upload Images</Label>
                  <Input id="images" name="images" type="file" accept="image/*" multiple />
                  <p className="text-xs text-muted-foreground">
                    You can select multiple files. Images are uploaded when you save.
                  </p>
                </div>

                {props.mode === 'create' ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Or add image URLs</p>
                      <p className="text-sm text-muted-foreground">
                        Useful if you already have hosted images.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={imageUrlDraft}
                        onChange={(e) => setImageUrlDraft(e.target.value)}
                        placeholder="https://..."
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const url = imageUrlDraft.trim();
                          if (!/^https?:\/\//i.test(url)) return;
                          setImageUrls((prev) => uniq([...prev, url]));
                          setImageUrlDraft('');
                        }}
                      >
                        Add
                      </Button>
                    </div>

                    {imageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {imageUrls.map((url) => (
                          <div key={url} className="rounded-lg border p-2">
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                              <Image src={url} alt="" fill className="object-cover" sizes="300px" />
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setImageUrls((prev) => prev.filter((x) => x !== url))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild type="button" variant="outline">
            <Link href={props.backHref}>Cancel</Link>
          </Button>
          <Button type="submit">{props.mode === 'create' ? 'Create Room' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
}
