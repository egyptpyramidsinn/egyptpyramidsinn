'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ImageUploader } from '@/components/admin/image-uploader';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { AlertTriangle, Loader2, SendHorizonal, Sparkles } from 'lucide-react';
import { sendTestEmail } from './actions';
import { ThemeEditor } from '@/components/admin/theme-editor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getAgencySettings,
  getAgencyKashierSettingsForAdmin,
  updateAgencySettings,
  type AgencyImageSettings,
  type AgencyKashierSettingsInput,
  AgencySettingsData,
  type DestinationFallbackImage,
  PageSeoSettings,
  SiteSeoSettings,
} from '@/lib/supabase/agency-content';
import { useToast } from '@/hooks/use-toast';
import { generateSeoAssistAction, type SeoAssistResult } from '@/app/actions';
import { currencies } from '@/hooks/use-currency';
import { languages } from '@/hooks/use-language';
import { useAdminLanguage } from '@/hooks/use-admin-language';

const KASHIER_ALLOWED_METHOD_OPTIONS = ['card', 'wallet', 'meeza', 'bnpl'] as const;
const KASHIER_ALLOWED_METHOD_SET = new Set<string>(KASHIER_ALLOWED_METHOD_OPTIONS);

function normalizeKashierAllowedMethodTokens(tokens: string[]): string[] {
  const normalizedTokens: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const normalized = token.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedTokens.push(normalized);
  }

  return normalizedTokens;
}

function parseKashierAllowedMethodsCsv(value?: string | null): string[] {
  if (!value) return [];

  return normalizeKashierAllowedMethodTokens(value.split(','));
}

function serializeKashierAllowedMethods(methods: string[] | undefined): string | null {
  const normalizedMethods = normalizeKashierAllowedMethodTokens(methods ?? []);

  if (normalizedMethods.length === 0) {
    return null;
  }

  const selectedMethods = new Set(normalizedMethods);
  const knownMethods = KASHIER_ALLOWED_METHOD_OPTIONS.filter((method) =>
    selectedMethods.has(method)
  );
  const unknownMethods = normalizedMethods.filter(
    (method) => !KASHIER_ALLOWED_METHOD_SET.has(method)
  );
  const orderedMethods = [...knownMethods, ...unknownMethods];

  return orderedMethods.length > 0 ? orderedMethods.join(',') : null;
}

const formSchema = z
  .object({
    agencyName: z.string().min(1, 'Agency name is required.'),
    phoneNumber: z.string().min(10, 'A valid phone number is required.'),
    contactEmail: z.string().email('Invalid email address.'),
    address: z.string().min(1, 'Address is required.'),
    logo: z.array(z.any()).optional(),
    favicon: z.array(z.any()).optional(),
    ogImage: z.array(z.any()).optional(),
    twitterImage: z.array(z.any()).optional(),
    tagline: z.string().optional(),
    navLinks: z
      .array(
        z.object({
          label: z.string().min(1, 'Label is required'),
          href: z.string().min(1, 'Href is required'),
        })
      )
      .optional(),
    aboutUs: z.string().min(10, 'About us description should be at least 10 characters.'),
    legalPages: z
      .object({
        termsAndConditionMarkdown: z.string().optional(),
        policySecurityMarkdown: z.string().optional(),
      })
      .optional(),
    images: z
      .object({
        aboutHeroUrl: z.array(z.any()).optional(),
        aboutSideImageUrl: z.array(z.any()).optional(),
        contactHeroUrl: z.array(z.any()).optional(),
        contactCardImageUrl: z.array(z.any()).optional(),
        servicesHeroUrl: z.array(z.any()).optional(),
        blogHeroUrl: z.array(z.any()).optional(),
        destinationHeroUrl: z.array(z.any()).optional(),
        upsellHeroUrl: z.array(z.any()).optional(),
        destinationFallbackImages: z
          .array(
            z.object({
              destination: z.string().min(1, 'Destination is required'),
              imageUrl: z.array(z.any()).optional(),
            })
          )
          .optional(),
      })
      .optional(),
    socialMedia: z.object({
      facebook: z.string().url().or(z.literal('')),
      twitter: z.string().url().or(z.literal('')),
      instagram: z.string().url().or(z.literal('')),
      linkedin: z.string().url().or(z.literal('')),
    }),
    paymentMethods: z
      .object({
        cash: z.boolean(),
        online: z.boolean(),
        defaultMethod: z.enum(['cash', 'online']),
      })
      .default({ cash: true, online: true, defaultMethod: 'online' }),
    kashierSettings: z
      .object({
        merchantId: z.string().optional(),
        apiKey: z.string().optional(),
        mode: z.string().optional(),
        allowedMethods: z.array(z.string()).optional(),
        display: z.string().optional(),
      })
      .default({
        merchantId: '',
        apiKey: '',
        mode: 'test',
        allowedMethods: [],
        display: 'en',
      }),
    theme: z
      .object({
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        fontFamily: z.string().optional(),
        headingFont: z.string().optional(),
        borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
        appearance: z.enum(['light', 'dark']).optional(),
      })
      .optional(),
    seo: z
      .object({
        site: z
          .object({
            siteName: z.string().optional(),
            defaultTitle: z.string().optional(),
            titleTemplate: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
            ogImageUrl: z.string().url().or(z.literal('')).optional(),
            twitterImageUrl: z.string().url().or(z.literal('')).optional(),
            faviconUrl: z.string().url().or(z.literal('')).optional(),
          })
          .optional(),
        home: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        about: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        contact: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        tours: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        services: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        blog: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        destination: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
        tailorMade: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            keywords: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
    modules: z
      .object({
        tours: z.boolean().default(true),
        hotels: z.boolean().default(true),
        blog: z.boolean().default(true),
      })
      .default({ tours: true, hotels: true, blog: true }),
    singleHotelMode: z.boolean().default(false),
    defaultCurrency: z.string().optional(),
    adminLanguage: z.string().optional(),
    emailSettings: z
      .object({
        resendApiKey: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().optional(),
        notifyAdminOnBooking: z.boolean().default(true),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.paymentMethods.cash && !data.paymentMethods.online) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enable at least one payment method.',
        path: ['paymentMethods', 'cash'],
      });
    }

    if (data.paymentMethods.defaultMethod === 'cash' && !data.paymentMethods.cash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Default method must be enabled.',
        path: ['paymentMethods', 'defaultMethod'],
      });
    }

    if (data.paymentMethods.defaultMethod === 'online' && !data.paymentMethods.online) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Default method must be enabled.',
        path: ['paymentMethods', 'defaultMethod'],
      });
    }

    const normalizedMode = data.kashierSettings.mode?.trim().toLowerCase();
    const normalizedDisplay = data.kashierSettings.display?.trim().toLowerCase();

    if (normalizedMode !== 'test' && normalizedMode !== 'live') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Kashier mode must be either test or live.',
        path: ['kashierSettings', 'mode'],
      });
    }

    if (normalizedDisplay !== 'en' && normalizedDisplay !== 'ar') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Kashier display must be either en or ar.',
        path: ['kashierSettings', 'display'],
      });
    }

    if (data.paymentMethods.online) {
      const requiredKashierFields: Array<['merchantId' | 'apiKey', string]> = [
        ['merchantId', 'Merchant ID is required when online payment is enabled.'],
        ['apiKey', 'API key is required when online payment is enabled.'],
      ];

      for (const [fieldKey, message] of requiredKashierFields) {
        const value = data.kashierSettings[fieldKey];
        if (typeof value !== 'string' || !value.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message,
            path: ['kashierSettings', fieldKey],
          });
        }
      }
    }
  })
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) {
        return false;
      }
      return true;
    },
    {
      message: 'Current password is required to set a new one.',
      path: ['currentPassword'],
    }
  )
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  });

const SEO_IMAGE_ACCEPT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

const ALLOWED_SEO_IMAGE_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MAX_SEO_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_SEO_IMAGE_FILE_SIZE_MB = 5;

export default function SettingsPage() {
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);
  const [loadedSettingsData, setLoadedSettingsData] = useState<AgencySettingsData | null>(null);
  const [testEmailPending, setTestEmailPending] = useState(false);
  const { toast } = useToast();
  const { setAdminLanguage } = useAdminLanguage();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agencyName: '',
      phoneNumber: '',
      contactEmail: '',
      address: '',
      logo: [],
      favicon: [],
      ogImage: [],
      twitterImage: [],
      tagline: '',
      navLinks: [
        { label: 'Home', href: '/' },
        { label: 'About Us', href: '/about' },
        { label: 'Destination', href: '/destination' },
        { label: 'Tour', href: '/tours' },
        { label: 'Services', href: '/services' },
        { label: 'Blog', href: '/blog' },
        { label: 'Contact', href: '/contact' },
      ],
      aboutUs: '',
      legalPages: {
        termsAndConditionMarkdown: '',
        policySecurityMarkdown: '',
      },
      images: {
        aboutHeroUrl: [],
        aboutSideImageUrl: [],
        contactHeroUrl: [],
        contactCardImageUrl: [],
        servicesHeroUrl: [],
        blogHeroUrl: [],
        destinationHeroUrl: [],
        upsellHeroUrl: [],
        destinationFallbackImages: [],
      },
      socialMedia: {
        facebook: '',
        twitter: '',
        instagram: '',
        linkedin: '',
      },
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      paymentMethods: {
        cash: true,
        online: true,
        defaultMethod: 'online',
      },
      kashierSettings: {
        merchantId: '',
        apiKey: '',
        mode: 'test',
        allowedMethods: [],
        display: 'en',
      },
      theme: {
        primaryColor: '#0f172a',
        secondaryColor: '#f5f0e8',
        accentColor: '#e67e22',
        fontFamily: 'Inter',
        headingFont: 'Playfair Display',
        borderRadius: 'md',
        appearance: 'light',
      },
      seo: {},
      modules: {
        tours: true,
        hotels: true,
        blog: true,
      },
      singleHotelMode: false,
      defaultCurrency: 'USD',
      adminLanguage: 'en',
      emailSettings: {
        resendApiKey: '',
        fromName: '',
        fromEmail: '',
        notifyAdminOnBooking: true,
      },
    },
  });

  const {
    fields: navLinkFields,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: 'navLinks',
  });

  const {
    fields: destinationFallbackFields,
    append: appendDestinationFallback,
    remove: removeDestinationFallback,
  } = useFieldArray({
    control: form.control,
    name: 'images.destinationFallbackImages' as never,
  });

  useEffect(() => {
    async function loadSettings() {
      const [data, kashierSettings] = await Promise.all([
        getAgencySettings({ skipTranslation: true }),
        getAgencyKashierSettingsForAdmin(),
      ]);

      if (data) {
        const settingsData = (data.data ?? {}) as AgencySettingsData;
        setLoadedSettingsData(settingsData);
        const paymentMethods = settingsData.paymentMethods ?? {};
        const images: AgencyImageSettings = settingsData.images ?? {};
        setExistingLogoUrl(data.logo_url ?? null);
        const destinationFallbackImages: DestinationFallbackImage[] = Array.isArray(
          images.destinationFallbackImages
        )
          ? images.destinationFallbackImages
          : [];
        form.reset({
          agencyName: settingsData.agencyName ?? '',
          phoneNumber: settingsData.phoneNumber ?? '',
          contactEmail: settingsData.contactEmail ?? '',
          address: settingsData.address ?? '',
          logo: [],
          favicon: data.favicon_url ? [data.favicon_url] : [],
          ogImage:
            settingsData.seo?.site?.ogImageUrl && settingsData.seo.site.ogImageUrl.trim()
              ? [settingsData.seo.site.ogImageUrl.trim()]
              : [],
          twitterImage:
            settingsData.seo?.site?.twitterImageUrl && settingsData.seo.site.twitterImageUrl.trim()
              ? [settingsData.seo.site.twitterImageUrl.trim()]
              : [],
          tagline: settingsData.tagline ?? '',
          navLinks: settingsData.navLinks ?? [
            { label: 'Home', href: '/' },
            { label: 'About Us', href: '/about' },
            { label: 'Destination', href: '/destination' },
            { label: 'Tour', href: '/tours' },
            { label: 'Services', href: '/services' },
            { label: 'Blog', href: '/blog' },
            { label: 'Contact', href: '/contact' },
          ],
          aboutUs: settingsData.aboutUs ?? '',
          legalPages: {
            termsAndConditionMarkdown: settingsData.legalPages?.termsAndConditionMarkdown ?? '',
            policySecurityMarkdown: settingsData.legalPages?.policySecurityMarkdown ?? '',
          },
          images: {
            aboutHeroUrl: images.aboutHeroUrl ? [images.aboutHeroUrl] : [],
            aboutSideImageUrl: images.aboutSideImageUrl ? [images.aboutSideImageUrl] : [],
            contactHeroUrl: images.contactHeroUrl ? [images.contactHeroUrl] : [],
            contactCardImageUrl: images.contactCardImageUrl ? [images.contactCardImageUrl] : [],
            servicesHeroUrl: images.servicesHeroUrl ? [images.servicesHeroUrl] : [],
            blogHeroUrl: images.blogHeroUrl ? [images.blogHeroUrl] : [],
            destinationHeroUrl: images.destinationHeroUrl ? [images.destinationHeroUrl] : [],
            upsellHeroUrl: images.upsellHeroUrl ? [images.upsellHeroUrl] : [],
            destinationFallbackImages: destinationFallbackImages.map((entry) => ({
              destination: entry.destination,
              imageUrl: entry.imageUrl ? [entry.imageUrl] : [],
            })),
          },
          socialMedia: settingsData.socialMedia ?? {
            facebook: '',
            twitter: '',
            instagram: '',
            linkedin: '',
          },
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
          paymentMethods: {
            cash: paymentMethods.cash ?? true,
            online: paymentMethods.online ?? true,
            defaultMethod:
              paymentMethods.defaultMethod ?? (paymentMethods.online === false ? 'cash' : 'online'),
          },
          kashierSettings: {
            merchantId: kashierSettings.merchantId ?? '',
            apiKey: kashierSettings.apiKey ?? '',
            mode: kashierSettings.mode ?? 'test',
            allowedMethods: parseKashierAllowedMethodsCsv(kashierSettings.allowedMethods),
            display: kashierSettings.display ?? 'en',
          },
          theme: {
            primaryColor: settingsData.theme?.primaryColor ?? '#0f172a',
            secondaryColor: settingsData.theme?.secondaryColor ?? '#f5f0e8',
            accentColor: settingsData.theme?.accentColor ?? '#e67e22',
            fontFamily: settingsData.theme?.fontFamily ?? 'Inter',
            headingFont: settingsData.theme?.headingFont ?? 'Playfair Display',
            borderRadius: settingsData.theme?.borderRadius ?? 'md',
            appearance: settingsData.theme?.appearance ?? 'light',
          },
          seo: settingsData.seo ?? {},
          modules: settingsData.modules ?? {
            tours: true,
            hotels: true,
            blog: true,
          },
          singleHotelMode: settingsData.singleHotelMode ?? false,
          defaultCurrency: settingsData.defaultCurrency ?? 'USD',
          adminLanguage: settingsData.adminLanguage ?? 'en',
          emailSettings: {
            resendApiKey: settingsData.emailSettings?.resendApiKey ?? '',
            fromName: settingsData.emailSettings?.fromName ?? '',
            fromEmail: settingsData.emailSettings?.fromEmail ?? '',
            notifyAdminOnBooking: settingsData.emailSettings?.notifyAdminOnBooking ?? true,
          },
        });
      }
    }
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  type FormValues = z.infer<typeof formSchema>;
  type FormSeo = FormValues['seo'];
  type FormSiteSeo = NonNullable<NonNullable<FormSeo>['site']>;
  type FormPageSeo = PageSeoSettings;

  const mergeSiteSeo = (
    base: SiteSeoSettings | undefined,
    incoming: FormSiteSeo | undefined
  ): SiteSeoSettings | undefined => {
    if (!base && !incoming) return undefined;
    return { ...(base ?? {}), ...(incoming ?? {}) };
  };

  const mergePageSeo = (
    base: FormPageSeo | undefined,
    incoming: FormPageSeo | undefined
  ): PageSeoSettings | undefined => {
    if (!base && !incoming) return undefined;
    return { ...(base ?? {}), ...(incoming ?? {}) };
  };

  const mergeSeo = (
    base: AgencySettingsData['seo'] | undefined,
    incoming: FormSeo | undefined
  ): AgencySettingsData['seo'] | undefined => {
    if (!base && !incoming) return undefined;

    const b = base ?? {};
    const i = incoming ?? {};

    return {
      site: mergeSiteSeo(b.site, i.site),
      home: mergePageSeo(b.home, i.home),
      about: mergePageSeo(b.about, i.about),
      contact: mergePageSeo(b.contact, i.contact),
      tours: mergePageSeo(b.tours, i.tours),
      services: mergePageSeo(b.services, i.services),
      destination: mergePageSeo(b.destination, i.destination),
      tailorMade: mergePageSeo(b.tailorMade, i.tailorMade),
      blog: mergePageSeo(b.blog, i.blog),
    };
  };

  type SeoScope =
    | 'site'
    | 'home'
    | 'about'
    | 'contact'
    | 'tours'
    | 'services'
    | 'destination'
    | 'tailorMade'
    | 'blog';
  type AiFieldKey = 'title' | 'description' | 'keywords';
  type AiTarget =
    | { kind: 'single'; scope: SeoScope; fieldPath: string; fieldKey: AiFieldKey }
    | {
        kind: 'group';
        scope: SeoScope;
        titlePath: string;
        descriptionPath: string;
        keywordsPath: string;
      };

  const [aiOpen, setAiOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<SeoAssistResult | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const handleAiOpenChange = (open: boolean) => {
    setAiOpen(open);
    if (!open) {
      setAiTarget(null);
      setAiPrompt('');
      setAiResult(null);
    }
  };

  const openAiForSingle = (target: Omit<Extract<AiTarget, { kind: 'single' }>, 'kind'>) => {
    setAiTarget({ kind: 'single', ...target });
    setAiPrompt('');
    setAiResult(null);
    setAiOpen(true);
  };

  const openAiForGroup = (target: Omit<Extract<AiTarget, { kind: 'group' }>, 'kind'>) => {
    setAiTarget({ kind: 'group', ...target });
    setAiPrompt('');
    setAiResult(null);
    setAiOpen(true);
  };

  const applyAiResult = () => {
    if (!aiTarget || !aiResult) return;

    const opts = { shouldDirty: true, shouldValidate: true } as const;
    const setStringValue = (path: string, value: string) => {
      form.setValue(path as never, value as never, opts);
    };
    if (aiTarget.kind === 'single') {
      const value =
        aiTarget.fieldKey === 'title'
          ? aiResult.title
          : aiTarget.fieldKey === 'description'
            ? aiResult.description
            : aiResult.keywords;
      setStringValue(aiTarget.fieldPath, value);
      setAiOpen(false);
      return;
    }

    setStringValue(aiTarget.titlePath, aiResult.title);
    setStringValue(aiTarget.descriptionPath, aiResult.description);
    setStringValue(aiTarget.keywordsPath, aiResult.keywords);
    setAiOpen(false);
  };

  const generateAiResult = async () => {
    if (!aiTarget) return;
    const prompt = aiPrompt.trim();
    if (!prompt) return;

    setIsAiGenerating(true);
    try {
      const agencyName = form.getValues('agencyName');
      const siteName = form.getValues('seo.site.siteName' as never) as unknown as
        | string
        | undefined;

      const existingTitle =
        aiTarget.kind === 'single'
          ? (form.getValues(aiTarget.fieldPath as never) as unknown as string | undefined)
          : (form.getValues(aiTarget.titlePath as never) as unknown as string | undefined);
      const existingDescription =
        aiTarget.kind === 'single' && aiTarget.fieldKey !== 'description'
          ? undefined
          : aiTarget.kind === 'single'
            ? (form.getValues(aiTarget.fieldPath as never) as unknown as string | undefined)
            : (form.getValues(aiTarget.descriptionPath as never) as unknown as string | undefined);
      const existingKeywords =
        aiTarget.kind === 'single' && aiTarget.fieldKey !== 'keywords'
          ? undefined
          : aiTarget.kind === 'single'
            ? (form.getValues(aiTarget.fieldPath as never) as unknown as string | undefined)
            : (form.getValues(aiTarget.keywordsPath as never) as unknown as string | undefined);

      const result = await generateSeoAssistAction({
        prompt,
        scope: aiTarget.scope,
        agencyName: typeof agencyName === 'string' ? agencyName : undefined,
        siteName: typeof siteName === 'string' ? siteName : undefined,
        existingTitle: typeof existingTitle === 'string' ? existingTitle : undefined,
        existingDescription:
          typeof existingDescription === 'string' ? existingDescription : undefined,
        existingKeywords: typeof existingKeywords === 'string' ? existingKeywords : undefined,
      });

      if (!result.success || !result.data) {
        toast({
          title: 'AI generation failed',
          description: result.message ?? 'Please try again.',
          variant: 'destructive',
        });
        return;
      }

      setAiResult(result.data);
    } catch (error) {
      toast({
        title: 'AI generation failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAiGenerating(false);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const supabase = createClient();

    // Handle logo upload if provided
    let logoUrl: string | null = existingLogoUrl;
    try {
      const logoFile = values.logo && values.logo[0];
      if (logoFile && logoFile instanceof File) {
        const ext = logoFile.name.split('.').pop() || 'png';
        const path = `logos/agency-logo-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('cms').upload(path, logoFile, {
          contentType: logoFile.type || 'image/png',
          upsert: true,
        });
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('cms').getPublicUrl(path);
          logoUrl = publicUrlData.publicUrl;
        }
      }
    } catch {
      // ignore upload failure
    }

    let faviconUrl: string | null = null;
    const faviconInputUrl =
      typeof values.seo?.site?.faviconUrl === 'string' ? values.seo.site.faviconUrl.trim() : '';
    if (faviconInputUrl) {
      faviconUrl = faviconInputUrl;
    } else {
      const first = values.favicon?.[0];
      if (typeof first === 'string' && first.trim()) {
        faviconUrl = first.trim();
      }
    }

    try {
      const faviconFile = values.favicon?.[0];
      if (faviconFile && faviconFile instanceof File) {
        const ext = faviconFile.name.split('.').pop() || 'png';
        const path = `favicons/agency-favicon-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('cms')
          .upload(path, faviconFile, {
            contentType: faviconFile.type || 'image/png',
            upsert: true,
          });
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('cms').getPublicUrl(path);
          faviconUrl = publicUrlData.publicUrl;
        }
      }
    } catch {}

    const resolveSeoImageUrl = async (input: {
      fieldLabel: string;
      fileCandidate: unknown;
      manualUrl: string;
      existingUrl: string | null;
      pathPrefix: string;
    }): Promise<{ ok: boolean; url: string | null }> => {
      const fallbackUrl = input.manualUrl || input.existingUrl || null;

      if (!(input.fileCandidate instanceof File)) {
        return { ok: true, url: fallbackUrl };
      }

      if (!ALLOWED_SEO_IMAGE_MIME_TYPES.has(input.fileCandidate.type)) {
        toast({
          title: `Invalid ${input.fieldLabel}`,
          description: 'Please upload a PNG, JPG, WEBP, or GIF image.',
          variant: 'destructive',
        });
        return { ok: false, url: fallbackUrl };
      }

      if (input.fileCandidate.size > MAX_SEO_IMAGE_FILE_SIZE_BYTES) {
        toast({
          title: `Invalid ${input.fieldLabel}`,
          description: `Please upload an image smaller than ${MAX_SEO_IMAGE_FILE_SIZE_MB} MB.`,
          variant: 'destructive',
        });
        return { ok: false, url: fallbackUrl };
      }

      const ext = input.fileCandidate.name.split('.').pop() || 'png';
      const path = `seo/${input.pathPrefix}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('cms')
        .upload(path, input.fileCandidate, {
          contentType: input.fileCandidate.type || 'image/png',
          upsert: true,
        });

      if (uploadError) {
        toast({
          title: `Failed to upload ${input.fieldLabel}`,
          description: 'Please try again.',
          variant: 'destructive',
        });
        return { ok: false, url: fallbackUrl };
      }

      const { data: publicUrlData } = supabase.storage.from('cms').getPublicUrl(path);
      return { ok: true, url: publicUrlData.publicUrl };
    };

    const ogImageResult = await resolveSeoImageUrl({
      fieldLabel: 'OpenGraph image',
      fileCandidate: values.ogImage?.[0],
      manualUrl:
        typeof values.seo?.site?.ogImageUrl === 'string' ? values.seo.site.ogImageUrl.trim() : '',
      existingUrl:
        typeof loadedSettingsData?.seo?.site?.ogImageUrl === 'string' &&
        loadedSettingsData.seo.site.ogImageUrl.trim()
          ? loadedSettingsData.seo.site.ogImageUrl.trim()
          : null,
      pathPrefix: 'og-image',
    });
    if (!ogImageResult.ok) return;

    const twitterImageResult = await resolveSeoImageUrl({
      fieldLabel: 'Twitter / X image',
      fileCandidate: values.twitterImage?.[0],
      manualUrl:
        typeof values.seo?.site?.twitterImageUrl === 'string'
          ? values.seo.site.twitterImageUrl.trim()
          : '',
      existingUrl:
        typeof loadedSettingsData?.seo?.site?.twitterImageUrl === 'string' &&
        loadedSettingsData.seo.site.twitterImageUrl.trim()
          ? loadedSettingsData.seo.site.twitterImageUrl.trim()
          : null,
      pathPrefix: 'twitter-image',
    });
    if (!twitterImageResult.ok) return;

    const uploadSingleImage = async (
      value: unknown[] | undefined,
      pathPrefix: string,
      fallbackUrl?: string
    ): Promise<string | undefined> => {
      const first = value?.[0];
      if (!first) return fallbackUrl;
      if (typeof first === 'string') return first;
      if (!(first instanceof File)) return fallbackUrl;

      const ext = first.name.split('.').pop() || 'png';
      const path = `page-images/${pathPrefix}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('cms').upload(path, first, {
        contentType: first.type || 'image/png',
        upsert: true,
      });

      if (uploadError) return fallbackUrl;
      const { data: publicUrlData } = supabase.storage.from('cms').getPublicUrl(path);
      return publicUrlData.publicUrl;
    };

    const slugify = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const imagesPayload = values.images
      ? {
          aboutHeroUrl: await uploadSingleImage(
            values.images.aboutHeroUrl,
            'about-hero',
            loadedSettingsData?.images?.aboutHeroUrl
          ),
          aboutSideImageUrl: await uploadSingleImage(
            values.images.aboutSideImageUrl,
            'about-side',
            loadedSettingsData?.images?.aboutSideImageUrl
          ),
          contactHeroUrl: await uploadSingleImage(
            values.images.contactHeroUrl,
            'contact-hero',
            loadedSettingsData?.images?.contactHeroUrl
          ),
          contactCardImageUrl: await uploadSingleImage(
            values.images.contactCardImageUrl,
            'contact-card',
            loadedSettingsData?.images?.contactCardImageUrl
          ),
          servicesHeroUrl: await uploadSingleImage(
            values.images.servicesHeroUrl,
            'services-hero',
            loadedSettingsData?.images?.servicesHeroUrl
          ),
          blogHeroUrl: await uploadSingleImage(
            values.images.blogHeroUrl,
            'blog-hero',
            loadedSettingsData?.images?.blogHeroUrl
          ),
          destinationHeroUrl: await uploadSingleImage(
            values.images.destinationHeroUrl,
            'destination-hero',
            loadedSettingsData?.images?.destinationHeroUrl
          ),
          upsellHeroUrl: await uploadSingleImage(
            values.images.upsellHeroUrl,
            'upsell-hero',
            loadedSettingsData?.images?.upsellHeroUrl
          ),
          destinationFallbackImages: Array.isArray(values.images.destinationFallbackImages)
            ? (
                await Promise.all(
                  values.images.destinationFallbackImages.map(async (entry) => {
                    const destination =
                      typeof entry?.destination === 'string' ? entry.destination.trim() : '';
                    if (!destination) return null;
                    const existingEntry =
                      loadedSettingsData?.images?.destinationFallbackImages?.find(
                        (e) => e.destination === destination
                      );
                    const url = await uploadSingleImage(
                      entry.imageUrl,
                      `destination-fallback-${slugify(destination) || 'destination'}`,
                      existingEntry?.imageUrl
                    );
                    if (!url) return null;
                    return { destination, imageUrl: url };
                  })
                )
              ).filter((value): value is DestinationFallbackImage => value !== null)
            : undefined,
        }
      : undefined;

    const nextSettingsData: AgencySettingsData = {
      agencyName: values.agencyName,
      phoneNumber: values.phoneNumber,
      contactEmail: values.contactEmail,
      address: values.address,
      tagline: values.tagline ?? '',
      navLinks: values.navLinks ?? [],
      aboutUs: values.aboutUs,
      legalPages: values.legalPages
        ? {
            termsAndConditionMarkdown: values.legalPages.termsAndConditionMarkdown ?? '',
            policySecurityMarkdown: values.legalPages.policySecurityMarkdown ?? '',
          }
        : undefined,
      images: imagesPayload,
      socialMedia: values.socialMedia,
      paymentMethods: values.paymentMethods,
      theme: values.theme,
      seo: mergeSeo(loadedSettingsData?.seo, values.seo),
      modules: values.modules,
      singleHotelMode: values.singleHotelMode,
      defaultCurrency: values.defaultCurrency ?? 'USD',
      adminLanguage: values.adminLanguage ?? 'en',
      emailSettings: values.emailSettings
        ? {
            resendApiKey: values.emailSettings.resendApiKey?.trim() || undefined,
            fromName: values.emailSettings.fromName?.trim() || undefined,
            fromEmail: values.emailSettings.fromEmail?.trim() || undefined,
            notifyAdminOnBooking: values.emailSettings.notifyAdminOnBooking ?? true,
          }
        : undefined,
    };

    const kashierSettingsPayload: AgencyKashierSettingsInput = {
      merchantId: values.kashierSettings.merchantId?.trim() || null,
      apiKey: values.kashierSettings.apiKey?.trim() || null,
      mode: values.kashierSettings.mode?.trim() || null,
      allowedMethods: serializeKashierAllowedMethods(values.kashierSettings.allowedMethods),
      display: values.kashierSettings.display?.trim() || null,
    };

    try {
      await updateAgencySettings(
        nextSettingsData,
        logoUrl,
        faviconUrl,
        {
          ogImageUrl: ogImageResult.url,
          twitterImageUrl: twitterImageResult.url,
        },
        kashierSettingsPayload
      );
      // Sync admin language in the client context immediately
      if (values.adminLanguage) setAdminLanguage(values.adminLanguage);
      toast({
        title: 'Settings saved',
        description: 'Your changes have been applied successfully.',
      });
    } catch (error) {
      toast({
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Form {...form}>
      <Dialog open={aiOpen} onOpenChange={handleAiOpenChange}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {aiTarget?.kind === 'group' ? 'AI Fill SEO' : 'AI Suggest Content'}
            </DialogTitle>
            <DialogDescription>
              Describe what you want to write and apply the suggested text.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Describe what you want to write</p>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Example: A luxury Egypt travel agency focused on private tours, Nile cruises, and family-friendly packages."
                rows={4}
              />
            </div>

            {aiResult ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm font-medium">Title</p>
                  <Input value={aiResult.title} readOnly />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm font-medium">Description</p>
                  <Textarea value={aiResult.description} readOnly rows={3} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm font-medium">Keywords</p>
                  <Input value={aiResult.keywords} readOnly />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={generateAiResult}
              disabled={isAiGenerating || !aiTarget || !aiPrompt.trim()}
            >
              {isAiGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
            <Button type="button" onClick={applyAiResult} disabled={isAiGenerating || !aiResult}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
            <p className="text-muted-foreground">
              Manage your site settings, branding, and security.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Business Configuration</CardTitle>
              <CardDescription>Configure the features and mode of your website.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Enable Tours</FormLabel>
                  <FormDescription>Enable tour management, listings, and bookings.</FormDescription>
                </div>
                <FormField
                  control={form.control}
                  name="modules.tours"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Enable Hotels</FormLabel>
                  <FormDescription>
                    Enable hotel management, room listings, and bookings.
                  </FormDescription>
                </div>
                <FormField
                  control={form.control}
                  name="modules.hotels"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Single Hotel Mode</FormLabel>
                  <FormDescription>
                    Enable if this website represents a single hotel property. Disabling this
                    creates a directory/OTA style site.
                  </FormDescription>
                </div>
                <FormField
                  control={form.control}
                  name="singleHotelMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Enable Blog</FormLabel>
                  <FormDescription>Enable blog posts and news section.</FormDescription>
                </div>
                <FormField
                  control={form.control}
                  name="modules.blog"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Email Notifications ── */}
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Configure Resend to automatically send booking confirmations to customers and alerts
                to your team. Get your free API key at{' '}
                <a
                  href="https://resend.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  resend.com
                </a>
                . Leave blank to disable emails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="emailSettings.fromName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sender Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Tix & Trips Egypt"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        Displayed in the &quot;From&quot; field of every email.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emailSettings.fromEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sender Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="bookings@yourdomain.com"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        Must be a verified domain in your Resend account.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="emailSettings.resendApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resend API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Your secret API key from the Resend dashboard. Stored securely — never exposed
                      to the public.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Admin Booking Alerts</FormLabel>
                  <FormDescription>
                    Send an email to your Contact Email whenever a new booking is created.
                  </FormDescription>
                </div>
                <FormField
                  control={form.control}
                  name="emailSettings.notifyAdminOnBooking"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Warning: no API key configured */}
              {!form.watch('emailSettings.resendApiKey')?.trim() && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <strong>Emails are disabled.</strong> Add a Resend API key above to enable
                    automatic booking confirmations and admin alerts. Get a free key at{' '}
                    <a
                      href="https://resend.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      resend.com
                    </a>
                    .
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={testEmailPending}
                onClick={async () => {
                  setTestEmailPending(true);
                  try {
                    const result = await sendTestEmail();
                    if (result.ok) {
                      toast({
                        title: 'Test email sent',
                        description: `Check your Contact Email inbox to confirm it working.`,
                      });
                    } else {
                      toast({
                        title: 'Failed to send test email',
                        description: result.error ?? 'Unknown error.',
                        variant: 'destructive',
                      });
                    }
                  } finally {
                    setTestEmailPending(false);
                  }
                }}
              >
                {testEmailPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizonal className="mr-2 h-4 w-4" />
                )}
                Send Test Email
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Update your tour agency&apos;s public information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="agencyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tour Agency Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Agency Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 234 567 890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@you.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="tagline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tagline</FormLabel>
                    <FormControl>
                      <Input placeholder="Your tagline" {...field} />
                    </FormControl>
                    <FormDescription>
                      Short phrase under the logo in the header/footer.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency Logo</FormLabel>
                    <FormControl>
                      <ImageUploader value={field.value || []} onChange={field.onChange} />
                    </FormControl>
                    <FormDescription>
                      Upload your company logo. PNG or JPG recommended.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Navigation</CardTitle>
              <CardDescription>
                Configure the primary navigation links shown in the header and footer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {navLinkFields && navLinkFields.length > 0 ? (
                navLinkFields.map((field, index) => (
                  <div key={field.id} className="grid md:grid-cols-3 gap-4 items-end">
                    <FormField
                      control={form.control}
                      name={`navLinks.${index}.label` as const}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Label</FormLabel>
                          <FormControl>
                            <Input placeholder="Home" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`navLinks.${index}.href` as const}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Href</FormLabel>
                          <FormControl>
                            <Input placeholder="/" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="button" variant="destructive" onClick={() => remove(index)}>
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No links. Add some below.</p>
              )}
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={() => append({ label: 'New Link', href: '/' })}>
                Add Link
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About & Address</CardTitle>
              <CardDescription>
                Information that may appear on your website&apos;s footer or contact page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Anytown, USA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="aboutUs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>About Us</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us a little about your agency"
                        {...field}
                        rows={4}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Legal Pages</CardTitle>
              <CardDescription>
                Manage the markdown content for your legal pages shown in the website footer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="legalPages.termsAndConditionMarkdown"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms and Condition Markdown</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="# Terms and Condition\n\nWrite your terms in Markdown..."
                        {...field}
                        value={field.value ?? ''}
                        rows={12}
                      />
                    </FormControl>
                    <FormDescription>
                      Rendered publicly on /terms-and-condition. Supports Markdown and tables.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="legalPages.policySecurityMarkdown"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Policy and Security Markdown</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="# Policy and Security\n\nWrite your policy and security content in Markdown..."
                        {...field}
                        value={field.value ?? ''}
                        rows={12}
                      />
                    </FormControl>
                    <FormDescription>
                      Rendered publicly on /policy-security. Leave empty to use built-in fallback
                      content.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Page Images</CardTitle>
              <CardDescription>
                Customize hero and section images used on public pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name={'images.aboutHeroUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>About Page Hero Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.aboutSideImageUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>About Page Side Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.contactHeroUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Page Hero Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.contactCardImageUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Page Card Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.servicesHeroUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Services Page Hero Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.blogHeroUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blog Page Hero Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.destinationHeroUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination Page Hero Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'images.upsellHeroUrl' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Upsell Items Page Hero Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value || []} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Destination Fallback Images</p>
                  <p className="text-sm text-muted-foreground">
                    Used when a destination has no tour cover image.
                  </p>
                </div>

                <div className="space-y-4">
                  {destinationFallbackFields.map((f, index) => (
                    <div key={f.id} className="rounded-2xl border p-4">
                      <div className="grid gap-4 md:grid-cols-[1fr,2fr,auto] md:items-end">
                        <FormField
                          control={form.control}
                          name={`images.destinationFallbackImages.${index}.destination` as never}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Destination</FormLabel>
                              <FormControl>
                                <Input placeholder="Cairo" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`images.destinationFallbackImages.${index}.imageUrl` as never}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Image</FormLabel>
                              <FormControl>
                                <ImageUploader
                                  value={field.value || []}
                                  onChange={field.onChange}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => removeDestinationFallback(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    appendDestinationFallback({ destination: '', imageUrl: [] } as never)
                  }
                >
                  Add Destination Image
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Social Media</CardTitle>
              <CardDescription>Links to your agency&apos;s social media profiles.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="socialMedia.facebook"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facebook</FormLabel>
                    <FormControl>
                      <Input placeholder="https://facebook.com/your-page" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="socialMedia.twitter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twitter / X</FormLabel>
                    <FormControl>
                      <Input placeholder="https://twitter.com/your-handle" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="socialMedia.instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <FormControl>
                      <Input placeholder="https://instagram.com/your-profile" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="socialMedia.linkedin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn</FormLabel>
                    <FormControl>
                      <Input placeholder="https://linkedin.com/company/your-company" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Theme Customization</CardTitle>
              <CardDescription>
                Customize colours, typography, corners, and appearance for your website.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeEditor form={form} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO & Metadata</CardTitle>
              <CardDescription>
                Control page titles, descriptions, and keywords for search engines.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 pb-6">
                <FormField
                  control={form.control}
                  name={'seo.site.siteName' as never}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your brand name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name={'seo.site.defaultTitle' as never}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-2">
                          <FormLabel>Default Title</FormLabel>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              openAiForSingle({
                                scope: 'site',
                                fieldPath: 'seo.site.defaultTitle',
                                fieldKey: 'title',
                              })
                            }
                            aria-label="Generate default title"
                            title="Generate with AI"
                          >
                            <Sparkles className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormControl>
                          <Input placeholder="Default browser title" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={'seo.site.titleTemplate' as never}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title Template</FormLabel>
                        <FormControl>
                          <Input placeholder="%s | Your Brand" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name={'seo.site.description' as never}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>Site Description</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            openAiForSingle({
                              scope: 'site',
                              fieldPath: 'seo.site.description',
                              fieldKey: 'description',
                            })
                          }
                          aria-label="Generate site description"
                          title="Generate with AI"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea placeholder="Default meta description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={'seo.site.keywords' as never}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>Default Keywords (comma separated)</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            openAiForSingle({
                              scope: 'site',
                              fieldPath: 'seo.site.keywords',
                              fieldKey: 'keywords',
                            })
                          }
                          aria-label="Generate default keywords"
                          title="Generate with AI"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormControl>
                        <Input placeholder="travel, tours, holidays" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Social Preview Images & Favicon */}
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-medium leading-none">OpenGraph Image</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Recommended: 1200×630 px. Used by Facebook, LinkedIn, and most social
                        previews.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 items-start">
                      <FormField
                        control={form.control}
                        name={'ogImage' as never}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Upload file
                            </FormLabel>
                            <FormControl>
                              <ImageUploader
                                value={field.value || []}
                                onChange={field.onChange}
                                maxFiles={1}
                                accept={SEO_IMAGE_ACCEPT}
                                hint="PNG, JPG, WEBP or GIF — 1200×630 recommended"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={'seo.site.ogImageUrl' as never}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Or paste a URL
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="https://example.com/og-image.jpg" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              If both are provided, the uploaded file takes priority.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-medium leading-none">Twitter / X Image</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Recommended: 1200×628 px. Used for large-card previews on Twitter / X.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 items-start">
                      <FormField
                        control={form.control}
                        name={'twitterImage' as never}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Upload file
                            </FormLabel>
                            <FormControl>
                              <ImageUploader
                                value={field.value || []}
                                onChange={field.onChange}
                                maxFiles={1}
                                accept={SEO_IMAGE_ACCEPT}
                                hint="PNG, JPG, WEBP or GIF — 1200×628 recommended"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={'seo.site.twitterImageUrl' as never}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Or paste a URL
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://example.com/twitter-image.jpg"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              If both are provided, the uploaded file takes priority.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Favicon — upload + URL in one card */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-medium leading-none">Favicon</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        The small icon shown in browser tabs and bookmarks. Use .ico for best
                        cross-browser support, or .png (32×32 / 64×64).
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 items-start">
                      <FormField
                        control={form.control}
                        name={'favicon' as never}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Upload file
                            </FormLabel>
                            <FormControl>
                              <ImageUploader
                                value={field.value || []}
                                onChange={field.onChange}
                                maxFiles={1}
                                accept={{
                                  'image/x-icon': ['.ico'],
                                  'image/vnd.microsoft.icon': ['.ico'],
                                  'image/png': ['.png'],
                                  'image/jpeg': ['.jpg', '.jpeg'],
                                  'image/webp': ['.webp'],
                                }}
                                hint="ICO, PNG, JPG or WEBP — 32×32 recommended"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={'seo.site.faviconUrl' as never}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Or paste a URL
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="https://example.com/favicon.ico" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              If both are provided, the uploaded file takes priority.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Accordion type="single" collapsible className="w-full">
                {[
                  { key: 'home', label: 'Home' },
                  { key: 'about', label: 'About' },
                  { key: 'contact', label: 'Contact' },
                  { key: 'tours', label: 'Tours' },
                  { key: 'services', label: 'Services' },
                  { key: 'destination', label: 'Destination' },
                  { key: 'tailorMade', label: 'Tailor Made' },
                  { key: 'blog', label: 'Blog' },
                ].map((page) => (
                  <AccordionItem key={page.key} value={page.key}>
                    <AccordionTrigger>{page.label} Page</AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openAiForGroup({
                              scope: page.key as SeoScope,
                              titlePath: `seo.${page.key}.title`,
                              descriptionPath: `seo.${page.key}.description`,
                              keywordsPath: `seo.${page.key}.keywords`,
                            })
                          }
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Fill with AI
                        </Button>
                      </div>
                      <FormField
                        control={form.control}
                        // @ts-expect-error - dynamic path construction
                        name={`seo.${page.key}.title`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-2">
                              <FormLabel>Meta Title</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  openAiForSingle({
                                    scope: page.key as SeoScope,
                                    fieldPath: `seo.${page.key}.title`,
                                    fieldKey: 'title',
                                  })
                                }
                                aria-label={`Generate meta title for ${page.label}`}
                                title="Generate with AI"
                              >
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormControl>
                              <Input placeholder={`Title for ${page.label} page`} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        // @ts-expect-error - dynamic path construction
                        name={`seo.${page.key}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-2">
                              <FormLabel>Meta Description</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  openAiForSingle({
                                    scope: page.key as SeoScope,
                                    fieldPath: `seo.${page.key}.description`,
                                    fieldKey: 'description',
                                  })
                                }
                                aria-label={`Generate meta description for ${page.label}`}
                                title="Generate with AI"
                              >
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormControl>
                              <Textarea
                                placeholder={`Description for ${page.label} page`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        // @ts-expect-error - dynamic path construction
                        name={`seo.${page.key}.keywords`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-2">
                              <FormLabel>Keywords (comma separated)</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  openAiForSingle({
                                    scope: page.key as SeoScope,
                                    fieldPath: `seo.${page.key}.keywords`,
                                    fieldKey: 'keywords',
                                  })
                                }
                                aria-label={`Generate keywords for ${page.label}`}
                                title="Generate with AI"
                              >
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormControl>
                              <Input placeholder="travel, egypt, tours" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>Control which payment options appear at checkout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="paymentMethods.cash"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Cash</FormLabel>
                      <FormDescription>Pay in cash on arrival.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          const isOnlineEnabled = form.getValues('paymentMethods.online');
                          const currentDefault = form.getValues('paymentMethods.defaultMethod');
                          if (currentDefault === 'cash' && !checked && isOnlineEnabled) {
                            form.setValue('paymentMethods.defaultMethod', 'online');
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentMethods.online"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Online (Kashier)</FormLabel>
                      <FormDescription>Pay online to confirm immediately.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          const isCashEnabled = form.getValues('paymentMethods.cash');
                          const currentDefault = form.getValues('paymentMethods.defaultMethod');
                          if (currentDefault === 'online' && !checked && isCashEnabled) {
                            form.setValue('paymentMethods.defaultMethod', 'cash');
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentMethods.defaultMethod"
                render={({ field }) => {
                  const cashEnabled = form.watch('paymentMethods.cash');
                  const onlineEnabled = form.watch('paymentMethods.online');

                  return (
                    <FormItem>
                      <FormLabel>Default method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select default payment method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash" disabled={!cashEnabled}>
                            Cash
                          </SelectItem>
                          <SelectItem value="online" disabled={!onlineEnabled}>
                            Online (Kashier)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kashier Details</CardTitle>
              <CardDescription>
                Configure the credentials and hosted checkout options for Kashier online payments.
                The redirect URL is read from server env key KASHIER_MERCHANT_REDIRECT_URL and must
                be set in your deployment environment.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="kashierSettings.merchantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Merchant ID</FormLabel>
                    <FormControl>
                      <Input placeholder="MID-XXXX" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="kashierSettings.apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="KASHIER_API_KEY"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="kashierSettings.mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? 'test'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="live">Live</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="kashierSettings.display"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? 'en'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select checkout language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="kashierSettings.allowedMethods"
                render={() => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Allowed Methods</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {KASHIER_ALLOWED_METHOD_OPTIONS.map((method) => (
                        <FormField
                          key={method}
                          control={form.control}
                          name="kashierSettings.allowedMethods"
                          render={({ field }) => {
                            const selectedMethods = field.value ?? [];

                            return (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                                <FormControl>
                                  <Checkbox
                                    checked={selectedMethods.includes(method)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange(
                                          selectedMethods.includes(method)
                                            ? selectedMethods
                                            : [...selectedMethods, method]
                                        );
                                        return;
                                      }

                                      field.onChange(
                                        selectedMethods.filter((value) => value !== method)
                                      );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="cursor-pointer font-normal capitalize">
                                  {method}
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                    </div>
                    <FormDescription>
                      Optional payment methods to show in Kashier checkout.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ── Default Currency ── */}
          <Card>
            <CardHeader>
              <CardTitle>Currency</CardTitle>
              <CardDescription>
                Set the default display currency for all public-facing price displays. Visitors can
                still switch currency from the site header.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="defaultCurrency"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Default Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? 'USD'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.symbol} {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Prices across the website will display in this currency by default.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ── Admin Interface Language ── */}
          <Card>
            <CardHeader>
              <CardTitle>Admin Interface Language</CardTitle>
              <CardDescription>
                Choose the language used in the admin dashboard and management panels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="adminLanguage"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Admin Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? 'en'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {languages.map((l) => (
                          <SelectItem key={l.code} value={l.code}>
                            {l.flag} {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      This only affects the admin panel UI. The public site language is chosen by
                      visitors.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Change your account password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
