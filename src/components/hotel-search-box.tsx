'use client';

import * as React from 'react';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, Users, Search, Minus, Plus } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/components/providers/settings-provider';
import { getHotelHubHref } from '@/lib/routing/hotel-links';

interface HotelSearchBoxProps {
  className?: string;
  defaultGuests?: number;
  maxGuests?: number;
}

export function HotelSearchBox({
  className,
  defaultGuests = 2,
  maxGuests = 10,
}: HotelSearchBoxProps) {
  const router = useRouter();
  const settings = useSettings();
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 1),
  });

  const [adults, setAdults] = React.useState(defaultGuests);
  const [children, setChildren] = React.useState(0);
  const [rooms, setRooms] = React.useState(1);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (date?.from) params.append('checkIn', format(date.from, 'yyyy-MM-dd'));
    if (date?.to) params.append('checkOut', format(date.to, 'yyyy-MM-dd'));
    params.append('adults', adults.toString());
    params.append('children', children.toString());
    params.append('rooms', rooms.toString());

    const target = getHotelHubHref(settings?.data);
    router.push(`${target}?${params.toString()}`);
  };

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-12 gap-3 p-2 bg-white rounded-xl shadow-xl border border-gray-100',
        className
      )}
    >
      {/* Date Picker */}
      <div className="md:col-span-5 relative group">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={'outline'}
              className={cn(
                'w-full h-14 justify-start text-left font-normal border-0 bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-2',
                !date && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Check-in - Check-out
                </span>
                <span className="text-sm font-medium text-foreground truncate">
                  {date?.from ? (
                    date.to ? (
                      <>
                        {format(date.from, 'MMM dd')} - {format(date.to, 'MMM dd')}
                      </>
                    ) : (
                      format(date.from, 'MMM dd')
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </span>
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Guests & Rooms */}
      <div className="md:col-span-5 relative group">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={'outline'}
              className="w-full h-14 justify-start text-left font-normal border-0 bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-2"
            >
              <Users className="mr-3 h-5 w-5 text-primary" />
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Guests & Rooms
                </span>
                <span className="text-sm font-medium text-foreground">
                  {adults} Adults, {children} Children, {rooms} Room
                </span>
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Guests & Rooms</h4>
                <p className="text-sm text-muted-foreground">
                  Select occupancy details for your stay.
                </p>
              </div>
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">Adults</span>
                    <span className="text-xs text-muted-foreground">Ages 13+</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setAdults(Math.max(1, adults - 1))}
                      disabled={adults <= 1}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-4 text-center text-sm">{adults}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setAdults(Math.min(maxGuests, adults + 1))}
                      disabled={adults >= maxGuests}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">Children</span>
                    <span className="text-xs text-muted-foreground">Ages 0-12</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setChildren(Math.max(0, children - 1))}
                      disabled={children <= 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-4 text-center text-sm">{children}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setChildren(Math.min(maxGuests, children + 1))}
                      disabled={children >= maxGuests}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">Rooms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setRooms(Math.max(1, rooms - 1))}
                      disabled={rooms <= 1}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-4 text-center text-sm">{rooms}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setRooms(Math.min(5, rooms + 1))}
                      disabled={rooms >= 5}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search Button */}
      <div className="md:col-span-2">
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold shadow-lg hover:scale-[1.02] transition-transform rounded-lg"
          onClick={handleSearch}
        >
          <Search className="mr-2 h-5 w-5" />
          Search
        </Button>
      </div>
    </div>
  );
}
