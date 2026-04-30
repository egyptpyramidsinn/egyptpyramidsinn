'use client';

import React, { useMemo, useRef, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { z } from 'zod';
import { AlertCircle, CalendarIcon, Info, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { generateTailorMadeTourAction } from '@/app/actions';

const FormSchema = z.object({
  arrivalDate: z.date({
    required_error: 'Arrival date is required.',
  }),
  region: z.array(z.string()).min(1, 'Please select at least one region.'),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 day.'),
  participants: z.coerce
    .number()
    .min(1, 'At least 1 participant required.')
    .max(20, 'Maximum 20 participants.'),
  accommodation: z.enum(
    [
      '3-star hotel accommodation',
      '4-star hotel accommodation',
      '5-star hotel accommodation',
      'Self-booked accommodation',
    ],
    {
      required_error: 'Please select accommodation.',
    }
  ),
  budgetAmount: z.coerce.number().min(1, 'Budget is required.'),
  budgetCurrency: z.string().default('USD'),
  inclusions: z.array(z.string()),
  interests: z.array(z.string()).min(1, 'Select at least one interest.'),
  customPreferences: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

type TourResult = {
  tourName: string;
  summary: string;
  totalPrice: number;
  currency: string;
  itinerary: {
    day: number;
    title: string;
    description: string;
    activities: string[];
    accommodation: string;
    meals: string[];
  }[];
  inclusions: string[];
  exclusions: string[];
  transportationDetails: string;
};

const regions = [
  'Cairo & Giza',
  'Luxor & Aswan',
  'Red Sea (Hurghada/Sharm)',
  'Alexandria & North Coast',
  'Western Desert Oases',
  'Sinai Peninsula',
  'All Major Regions (Grand Tour)',
];

const inclusionOptions = [
  { id: 'breakfast', label: 'Breakfast included' },
  { id: 'lunch', label: 'Lunch included' },
  { id: 'dinner', label: 'Dinner included' },
  { id: 'tickets', label: 'Entrance tickets for all tours' },
  { id: 'camel', label: 'Camel ride experience' },
  { id: 'guide', label: 'Private tour guide' },
  { id: 'transfer', label: 'Airport transfers' },
  { id: 'transport', label: 'Local transportation' },
];

const interestOptions = [
  { id: 'history', label: 'History & Culture' },
  { id: 'adventure', label: 'Adventure & Safari' },
  { id: 'relaxation', label: 'Relaxation & Beach' },
  { id: 'food', label: 'Food & Culinary' },
  { id: 'nature', label: 'Nature & Wildlife' },
  { id: 'religious', label: 'Religious Sites' },
  { id: 'shopping', label: 'Shopping & Markets' },
  { id: 'photography', label: 'Photography' },
];

type StepField = keyof FormValues;

type FormStep = {
  id: number;
  title: string;
  description: string;
  fields: StepField[];
};

const formSteps: FormStep[] = [
  {
    id: 1,
    title: 'Trip Basics',
    description: 'Arrival date, duration, and participant details.',
    fields: ['arrivalDate', 'duration', 'participants'],
  },
  {
    id: 2,
    title: 'Destinations & Interests',
    description: 'Choose regions and travel interests.',
    fields: ['region', 'interests'],
  },
  {
    id: 3,
    title: 'Comfort, Budget & Extras',
    description: 'Set comfort level, budget, and optional add-ons.',
    fields: ['accommodation', 'budgetAmount', 'budgetCurrency', 'inclusions', 'customPreferences'],
  },
];

const fieldOrder: StepField[] = [
  'arrivalDate',
  'duration',
  'participants',
  'region',
  'interests',
  'accommodation',
  'budgetAmount',
  'budgetCurrency',
  'inclusions',
  'customPreferences',
];

const fieldStepMap: Record<StepField, number> = {
  arrivalDate: 1,
  duration: 1,
  participants: 1,
  region: 2,
  interests: 2,
  accommodation: 3,
  budgetAmount: 3,
  budgetCurrency: 3,
  inclusions: 3,
  customPreferences: 3,
};

function updateSelection(values: string[] | undefined, item: string, checked: boolean): string[] {
  const safeValues = values ?? [];

  if (checked) {
    return Array.from(new Set([...safeValues, item]));
  }

  return safeValues.filter((value) => value !== item);
}

function getFirstInvalidField(errors: FieldErrors<FormValues>): StepField | null {
  for (const field of fieldOrder) {
    if (errors[field]) {
      return field;
    }
  }

  return null;
}

function formatDateValue(date?: Date | null): string {
  if (!date) {
    return 'Not set';
  }

  return format(date, 'PPP');
}

export function TailorMadeForm() {
  const { toast } = useToast();
  const formTopRef = useRef<HTMLDivElement | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TourResult | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      duration: 7,
      participants: 1,
      budgetCurrency: 'USD',
      inclusions: [],
      interests: [],
      region: [],
      accommodation: '4-star hotel accommodation',
      customPreferences: '',
    },
  });

  const arrivalDate = form.watch('arrivalDate');
  const duration = form.watch('duration');
  const participants = form.watch('participants');
  const budgetAmount = form.watch('budgetAmount');
  const budgetCurrency = form.watch('budgetCurrency');
  const selectedRegions = form.watch('region');
  const selectedInterests = form.watch('interests');
  const selectedInclusions = form.watch('inclusions');

  const activeStep = formSteps[currentStep - 1];
  const nextStepTitle = currentStep < formSteps.length ? formSteps[currentStep].title : '';

  const departureDate = useMemo(() => {
    if (!arrivalDate || !duration || Number.isNaN(Number(duration))) {
      return null;
    }

    return addDays(arrivalDate, Number(duration));
  }, [arrivalDate, duration]);

  const travelBudgetLabel = useMemo(() => {
    if (!budgetAmount || Number.isNaN(Number(budgetAmount))) {
      return 'Not set';
    }

    return `${budgetAmount} ${budgetCurrency ?? 'USD'} per person`;
  }, [budgetAmount, budgetCurrency]);

  const goToTop = () => {
    formTopRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const validateCurrentStep = async () => {
    return form.trigger(activeStep.fields, { shouldFocus: true });
  };

  const handleNextStep = async () => {
    setSubmitErrorMessage(null);
    const isValid = await validateCurrentStep();

    if (!isValid) {
      setSubmitErrorMessage('Please complete the highlighted fields before continuing.');
      goToTop();
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, formSteps.length));
    goToTop();
  };

  const handleBackStep = () => {
    setSubmitErrorMessage(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    goToTop();
  };

  const handleInvalidSubmit = (errors: FieldErrors<FormValues>) => {
    const firstInvalidField = getFirstInvalidField(errors);
    if (firstInvalidField) {
      setCurrentStep(fieldStepMap[firstInvalidField]);
    }

    setSubmitErrorMessage('Please review the highlighted fields and try again.');
    goToTop();
  };

  async function onSubmit(data: FormValues) {
    setIsLoading(true);
    setResult(null);
    setSubmitErrorMessage(null);

    try {
      const apiInput = {
        travelDates: {
          arrival: format(data.arrivalDate, 'yyyy-MM-dd'),
          departure: format(
            new Date(data.arrivalDate.getTime() + data.duration * 24 * 60 * 60 * 1000),
            'yyyy-MM-dd'
          ),
        },
        region: data.region,
        duration: data.duration,
        participants: data.participants,
        accommodation: data.accommodation,
        budget: {
          amount: data.budgetAmount,
          currency: data.budgetCurrency,
        },
        inclusions: data.inclusions,
        interests: data.interests,
        customPreferences: data.customPreferences,
      };

      const response = await generateTailorMadeTourAction(apiInput);

      if (response.success && response.data) {
        setResult(response.data);
        toast({
          title: 'Tour Generated!',
          description: 'Your personalized itinerary is ready.',
        });
      } else {
        throw new Error(response.message || 'Failed to generate tour');
      }
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="mb-2 text-3xl font-bold text-primary">{result.tourName}</h2>
              <p className="text-muted-foreground">{result.summary}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {result.totalPrice} {result.currency}
              </p>
              <p className="text-sm text-muted-foreground">Estimated Price</p>
            </div>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg bg-muted/30 p-4">
              <h4 className="mb-2 font-semibold">Inclusions</h4>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {result.inclusions.map((inc, i) => (
                  <li key={i}>{inc}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <h4 className="mb-2 font-semibold">Transportation</h4>
              <p className="text-sm">{result.transportationDetails}</p>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Day by Day Itinerary</h3>
            {result.itinerary.map((day) => (
              <div key={day.day} className="border-l-4 border-primary py-2 pl-4">
                <h4 className="text-lg font-bold">
                  Day {day.day}: {day.title}
                </h4>
                <p className="mb-2 text-sm text-muted-foreground">{day.description}</p>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <strong>Activities:</strong> {day.activities.join(', ')}
                  </p>
                  <p>
                    <strong>Stay:</strong> {day.accommodation}
                  </p>
                  <p>
                    <strong>Meals:</strong> {day.meals.join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Button onClick={() => setResult(null)} variant="outline">
            Create Another Tour
          </Button>
          <Button onClick={() => window.print()}>Print Itinerary</Button>
          <Button className="bg-green-600 hover:bg-green-700">Book This Tour</Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, handleInvalidSubmit)} className="space-y-6">
        <div ref={formTopRef} className="space-y-6">
          <div className="rounded-xl border bg-muted/20 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary">
                Step {currentStep} of {formSteps.length}
              </p>
              <p className="text-sm text-muted-foreground">{activeStep.title}</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {formSteps.map((step) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                const isClickable = step.id <= currentStep;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => isClickable && setCurrentStep(step.id)}
                    disabled={!isClickable}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      isActive && 'border-primary bg-primary/10 shadow-sm',
                      isCompleted &&
                        'cursor-pointer border-primary/40 bg-primary/5 hover:bg-primary/10',
                      !isActive &&
                        !isCompleted &&
                        'border-border/70 bg-background text-muted-foreground'
                    )}
                  >
                    <p className="text-xs uppercase tracking-wide">Step {step.id}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {submitErrorMessage && (
            <Alert variant="destructive" className="border-destructive/60 bg-destructive/5">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>There are some form issues to fix</AlertTitle>
              <AlertDescription>{submitErrorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              {currentStep === 1 && (
                <section className="space-y-6 rounded-xl border bg-muted/20 p-6 md:p-8">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">Trip Basics</h3>
                    <p className="text-sm text-muted-foreground">
                      Start with your travel timeline and group size.
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="arrivalDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Arrival Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'PPP')
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date() || date < new Date('1900-01-01')
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (Days)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="participants"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Participants</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={20}
                              {...field}
                              value={field.value || ''}
                              onChange={(e) =>
                                field.onChange(e.target.valueAsNumber || e.target.value)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>
              )}

              {currentStep === 2 && (
                <section className="space-y-7 rounded-xl border bg-muted/20 p-6 md:p-8">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">Destinations & Interests</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose where you want to go and the experiences you care about most.
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="region"
                    render={() => (
                      <FormItem>
                        <div className="mb-3">
                          <FormLabel className="text-base">Preferred Regions</FormLabel>
                          <FormDescription>
                            Select one or more regions for your itinerary.
                          </FormDescription>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {regions.map((region) => (
                            <FormField
                              key={region}
                              control={form.control}
                              name="region"
                              render={({ field }) => {
                                const checked = field.value?.includes(region);
                                const checkboxId = `region-${region.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

                                return (
                                  <FormItem
                                    className={cn(
                                      'rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring',
                                      checked
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:border-primary/40'
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <FormControl>
                                        <Checkbox
                                          id={checkboxId}
                                          checked={checked}
                                          onCheckedChange={(value) =>
                                            field.onChange(
                                              updateSelection(field.value, region, value === true)
                                            )
                                          }
                                          className="mt-0.5"
                                        />
                                      </FormControl>
                                      <FormLabel
                                        htmlFor={checkboxId}
                                        className="cursor-pointer text-sm font-medium leading-relaxed"
                                      >
                                        {region}
                                      </FormLabel>
                                    </div>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="interests"
                    render={() => (
                      <FormItem>
                        <div className="mb-3">
                          <FormLabel className="text-base">Interests</FormLabel>
                          <FormDescription>
                            Pick at least one interest so we tailor the experience around you.
                          </FormDescription>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {interestOptions.map((item) => (
                            <FormField
                              key={item.id}
                              control={form.control}
                              name="interests"
                              render={({ field }) => {
                                const checked = field.value?.includes(item.label);
                                const checkboxId = `interest-${item.id}`;

                                return (
                                  <FormItem
                                    className={cn(
                                      'rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring',
                                      checked
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:border-primary/40'
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <FormControl>
                                        <Checkbox
                                          id={checkboxId}
                                          checked={checked}
                                          onCheckedChange={(value) =>
                                            field.onChange(
                                              updateSelection(
                                                field.value,
                                                item.label,
                                                value === true
                                              )
                                            )
                                          }
                                          className="mt-0.5"
                                        />
                                      </FormControl>
                                      <FormLabel
                                        htmlFor={checkboxId}
                                        className="cursor-pointer text-sm font-medium leading-relaxed"
                                      >
                                        {item.label}
                                      </FormLabel>
                                    </div>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>
              )}

              {currentStep === 3 && (
                <section className="space-y-7 rounded-xl border bg-muted/20 p-6 md:p-8">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">Comfort, Budget & Extras</h3>
                    <p className="text-sm text-muted-foreground">
                      Finalize your comfort level, spending preference, and optional details.
                    </p>
                  </div>

                  <div className="space-y-6 rounded-lg border bg-background/70 p-5">
                    <h4 className="flex items-center gap-2 text-base font-semibold">
                      <Info className="h-4 w-4 text-primary" /> Accommodation & Budget
                    </h4>

                    <FormField
                      control={form.control}
                      name="accommodation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Accommodation Preference</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select accommodation" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="3-star hotel accommodation">
                                3-star hotel accommodation
                              </SelectItem>
                              <SelectItem value="4-star hotel accommodation">
                                4-star hotel accommodation
                              </SelectItem>
                              <SelectItem value="5-star hotel accommodation">
                                5-star hotel accommodation
                              </SelectItem>
                              <SelectItem value="Self-booked accommodation">
                                Self-booked accommodation
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 sm:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="budgetAmount"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Budget (Per Person)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="1500"
                                {...field}
                                value={field.value || ''}
                                onChange={(e) =>
                                  field.onChange(e.target.valueAsNumber || e.target.value)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="budgetCurrency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="USD" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="inclusions"
                    render={() => (
                      <FormItem className="rounded-lg border bg-background/70 p-5">
                        <div className="mb-3">
                          <FormLabel className="text-base">Tour Inclusions</FormLabel>
                          <FormDescription>
                            Choose the services you want included in your package.
                          </FormDescription>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {inclusionOptions.map((item) => (
                            <FormField
                              key={item.id}
                              control={form.control}
                              name="inclusions"
                              render={({ field }) => {
                                const checked = field.value?.includes(item.label);
                                const checkboxId = `inclusion-${item.id}`;

                                return (
                                  <FormItem
                                    className={cn(
                                      'rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring',
                                      checked
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:border-primary/40'
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <FormControl>
                                        <Checkbox
                                          id={checkboxId}
                                          checked={checked}
                                          onCheckedChange={(value) =>
                                            field.onChange(
                                              updateSelection(
                                                field.value,
                                                item.label,
                                                value === true
                                              )
                                            )
                                          }
                                          className="mt-0.5"
                                        />
                                      </FormControl>
                                      <FormLabel
                                        htmlFor={checkboxId}
                                        className="cursor-pointer text-sm font-medium leading-relaxed"
                                      >
                                        {item.label}
                                      </FormLabel>
                                    </div>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customPreferences"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comments & Special Requests</FormLabel>
                        <FormDescription>
                          Need special activities or unique requests? Mention them here and we will
                          account for them when building your itinerary.
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="Mention dietary requirements, accessibility needs, celebration plans, or places you want to prioritize."
                            className="h-32 resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackStep}
                  disabled={currentStep === 1 || isLoading}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>

                {currentStep < formSteps.length ? (
                  <Button
                    type="button"
                    onClick={handleNextStep}
                    disabled={isLoading}
                    className="w-full sm:w-auto"
                  >
                    Next: {nextStepTitle}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full px-8 text-base sm:w-auto"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating Itinerary...
                      </>
                    ) : (
                      'Generate My Tailor-Made Tour'
                    )}
                  </Button>
                )}
              </div>
            </div>

            <aside className="order-first xl:order-last">
              <div className="rounded-xl border bg-card p-5 shadow-sm xl:sticky xl:top-24">
                <h3 className="text-base font-semibold text-primary">Live Trip Summary</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your trip snapshot updates as you complete each step.
                </p>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Arrival</span>
                    <span className="text-right font-medium">{formatDateValue(arrivalDate)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Departure</span>
                    <span className="text-right font-medium">{formatDateValue(departureDate)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">
                      {duration && !Number.isNaN(Number(duration)) ? `${duration} days` : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Participants</span>
                    <span className="font-medium">
                      {participants && !Number.isNaN(Number(participants))
                        ? `${participants} traveler${Number(participants) > 1 ? 's' : ''}`
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="text-right font-medium">{travelBudgetLabel}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-lg font-semibold text-primary">{selectedRegions.length}</p>
                    <p className="text-[11px] text-muted-foreground">Regions</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-lg font-semibold text-primary">{selectedInterests.length}</p>
                    <p className="text-[11px] text-muted-foreground">Interests</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-lg font-semibold text-primary">
                      {selectedInclusions.length}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Inclusions</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </form>
    </Form>
  );
}
