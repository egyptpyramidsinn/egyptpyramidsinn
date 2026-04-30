'use server';

import { createClient, createPublicClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/agency-users';
import { getCurrentAgencyId } from '@/lib/supabase/agencies';
import { HomeContent } from '@/types';
import { revalidatePath } from 'next/cache';
import type { Metadata } from 'next';
import { getPublicTargetLocale } from '@/lib/translation/get-locale';
import { translateObject } from '@/lib/translation/translate-object';

const HOME_CONTENT_TRANSLATABLE_FIELDS = [
  'hero.title',
  'hero.subtitle',
  'hero.imageAlt',
  'hero.bookDirectBadge',
  'browseCategory.title',
  'browseCategory.subtitle',
  'browseCategory.categories[].label',
  'whyChooseUs.pretitle',
  'whyChooseUs.title',
  'whyChooseUs.imageAlt',
  'whyChooseUs.badgeValue',
  'whyChooseUs.badgeLabel',
  'whyChooseUs.feature1.title',
  'whyChooseUs.feature1.description',
  'whyChooseUs.feature2.title',
  'whyChooseUs.feature2.description',
  'whyChooseUs.feature3.title',
  'whyChooseUs.feature3.description',
  'popularDestinations.pretitle',
  'popularDestinations.title',
  'discountBanners.banner1.title',
  'discountBanners.banner1.description',
  'discountBanners.banner1.buttonText',
  'discountBanners.banner2.title',
  'discountBanners.banner2.description',
  'discountBanners.banner2.buttonText',
  'lastMinuteOffers.pretitle',
  'lastMinuteOffers.title',
  'videoSection.pretitle',
  'videoSection.title',
  'videoSection.button1Text',
  'videoSection.button2Text',
  'newsSection.pretitle',
  'newsSection.title',
  'hotelFeatures.title',
  'hotelFeatures.subtitle',
  'hotelFeatures.features[].title',
  'hotelFeatures.features[].description',
  'featuredRooms.title',
  'featuredRooms.subtitle',
  'hotelStory.title',
  'hotelStory.description',
  'hotelStory.imageAlt',
  'hotelStory.buttonText',
  'roomsSection.title',
  'roomsSection.subtitle',
  'amenitiesSection.title',
  'amenitiesSection.subtitle',
  'gallerySection.title',
  'gallerySection.subtitle',
  'whyBookDirect.title',
  'whyBookDirect.subtitle',
  'whyBookDirect.benefits[].title',
  'whyBookDirect.benefits[].description',
  'locationSection.title',
  'locationSection.subtitle',
  'locationSection.address',
  'socialSection.title',
  'socialSection.subtitle',
  'seasonalPackagesSection.title',
  'seasonalPackagesSection.subtitle',
  'seasonalPackagesSection.packages[].title',
  'seasonalPackagesSection.packages[].description',
  'seasonalPackagesSection.packages[].buttonText',
  'nearbyAttractionsSection.title',
  'nearbyAttractionsSection.subtitle',
  'nearbyAttractionsSection.attractions[].name',
  'nearbyAttractionsSection.attractions[].category',
  'testimonials[].name',
  'testimonials[].role',
  'testimonials[].content',
  'testimonials[].text',
] as const;

const AGENCY_SETTINGS_TRANSLATABLE_FIELDS = ['tagline', 'aboutUs', 'navLinks[].label'] as const;

function normalizeHomeWhyChooseUsTitleForTranslation(title: string): string {
  const withNormalizedLineBreaks = title
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/\r\n?/g, '\n');

  const withoutHtmlTags = withNormalizedLineBreaks.replace(/<\/?[a-z][\w:-]*(?:\s[^>]*)?>/gi, ' ');

  const collapsedWhitespacePerLine = withoutHtmlTags
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n');

  return collapsedWhitespacePerLine.replace(/\n{3,}/g, '\n\n').trim();
}

function prepareHomeContentForTranslation(home: HomeContent): HomeContent {
  const title = home?.whyChooseUs?.title;
  if (typeof title !== 'string') return home;

  const normalizedTitle = normalizeHomeWhyChooseUsTitleForTranslation(title);
  if (normalizedTitle === title) return home;

  return {
    ...home,
    whyChooseUs: {
      ...home.whyChooseUs,
      title: normalizedTitle,
    },
  };
}

export async function translateHomeContent(
  home: HomeContent,
  targetLang: string
): Promise<HomeContent> {
  if (targetLang === 'en') return home;
  const normalizedHome = prepareHomeContentForTranslation(home);
  return translateObject(normalizedHome, HOME_CONTENT_TRANSLATABLE_FIELDS, targetLang);
}

export type PageSeoSettings = {
  title?: string;
  description?: string;
  keywords?: string;
};

export type SiteSeoSettings = {
  siteName?: string;
  defaultTitle?: string;
  titleTemplate?: string;
  description?: string;
  keywords?: string;
  ogImageUrl?: string;
  twitterImageUrl?: string;
  faviconUrl?: string;
};

export type DestinationFallbackImage = {
  destination: string;
  imageUrl: string;
};

export type DestinationPageCardContent = {
  destination: string;
  description?: string;
};

export type DestinationPageSettings = {
  heroTitle?: string;
  heroSubtitle?: string;
  cards?: DestinationPageCardContent[];
};

export type AgencyImageSettings = {
  aboutHeroUrl?: string;
  aboutSideImageUrl?: string;
  contactHeroUrl?: string;
  contactCardImageUrl?: string;
  servicesHeroUrl?: string;
  blogHeroUrl?: string;
  destinationHeroUrl?: string;
  upsellHeroUrl?: string;
  destinationFallbackImages?: DestinationFallbackImage[];
};

export type AgencySettingsData = {
  agencyName?: string;
  phoneNumber?: string;
  contactEmail?: string;
  address?: string;
  tagline?: string;
  navLinks?: { label: string; href: string }[];
  aboutUs?: string;
  legalPages?: {
    termsAndConditionMarkdown?: string;
    policySecurityMarkdown?: string;
  };
  images?: AgencyImageSettings;
  socialMedia?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
  paymentMethods?: {
    cash?: boolean;
    online?: boolean;
    defaultMethod?: 'cash' | 'online';
  };
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    headingFont?: string;
    borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
    appearance?: 'light' | 'dark';
  };
  seo?: {
    site?: SiteSeoSettings;
    home?: PageSeoSettings;
    about?: PageSeoSettings;
    contact?: PageSeoSettings;
    tours?: PageSeoSettings;
    services?: PageSeoSettings;
    blog?: PageSeoSettings;
    destination?: PageSeoSettings;
    tailorMade?: PageSeoSettings;
  };
  destinationPage?: DestinationPageSettings;
  tourDestinations?: string[];
  tourCategories?: string[];
  modules?: {
    tours?: boolean;
    hotels?: boolean;
    blog?: boolean;
  };
  singleHotelMode?: boolean;
  hotelSearchConfig?: {
    maxAdults?: number;
    maxChildren?: number;
    maxRooms?: number;
  };
  emailSettings?: {
    /** Agency's own Resend API key — falls back to RESEND_API_KEY env if not set */
    resendApiKey?: string;
    /** Display name for the "from" field, e.g. "Tix & Trips Egypt" */
    fromName?: string;
    /** Sender email address, must be verified in Resend */
    fromEmail?: string;
    /** Whether to send admin notification emails on new bookings */
    notifyAdminOnBooking?: boolean;
  };
  /** Default display currency for all public-facing price displays */
  defaultCurrency?: string;
  /** Language code for the admin panel interface (e.g. 'en', 'ar', 'fr') */
  adminLanguage?: string;
};

export type KashierMode = 'test' | 'live';
export type KashierDisplay = 'en' | 'ar';

export type AgencyKashierSettings = {
  merchantId?: string;
  apiKey?: string;
  mode?: KashierMode;
  allowedMethods?: string;
  display?: KashierDisplay;
};

export type AgencyKashierSettingsInput = {
  merchantId?: string | null;
  apiKey?: string | null;
  mode?: string | null;
  allowedMethods?: string | null;
  display?: string | null;
};

export type CheckoutPaymentMethodAvailability = {
  cash: boolean;
  online: boolean;
  defaultMethod: 'cash' | 'online';
  onlineConfigured: boolean;
};

export type TourTaxonomyType = 'category' | 'destination';

type AgencyKashierSettingsRow = {
  kashier_merchant_id: string | null;
  kashier_api_key: string | null;
  kashier_mode: string | null;
  kashier_allowed_methods: string | null;
  kashier_display: string | null;
};

type AgencySettingsRow = {
  data: AgencySettingsData;
  logo_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  twitter_image_url: string | null;
  terms_and_condition_markdown: string | null;
  policy_security_markdown: string | null;
  agency_id: string;
} & AgencyKashierSettingsRow;

type SeoImageUrls = {
  ogImageUrl?: string | null;
  twitterImageUrl?: string | null;
};

type TourTaxonomyRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

function normalizeTaxonomyName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function slugifyTaxonomyName(value: string) {
  return normalizeTaxonomyName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
}

function normalizeOptionalUrl(value?: string | null): string | null {
  return normalizeOptionalString(value);
}

function normalizeOptionalMarkdown(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() ? value : null;
}

function normalizeKashierMode(value?: string | null): KashierMode | null {
  const normalizedValue = normalizeOptionalString(value)?.toLowerCase();
  if (normalizedValue === 'test' || normalizedValue === 'live') {
    return normalizedValue;
  }

  return null;
}

function normalizeKashierDisplay(value?: string | null): KashierDisplay | null {
  const normalizedValue = normalizeOptionalString(value)?.toLowerCase();
  if (normalizedValue === 'en' || normalizedValue === 'ar') {
    return normalizedValue;
  }

  return null;
}

function normalizeAgencyKashierSettingsRow(
  row?: Partial<AgencyKashierSettingsRow> | null
): AgencyKashierSettings {
  const merchantId = normalizeOptionalString(row?.kashier_merchant_id);
  const apiKey = normalizeOptionalString(row?.kashier_api_key);
  const mode = normalizeKashierMode(row?.kashier_mode);
  const allowedMethods = normalizeOptionalString(row?.kashier_allowed_methods);
  const display = normalizeKashierDisplay(row?.kashier_display);

  return {
    ...(merchantId ? { merchantId } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(mode ? { mode } : {}),
    ...(allowedMethods ? { allowedMethods } : {}),
    ...(display ? { display } : {}),
  };
}

function stripKashierKeysFromSettingsData(data: AgencySettingsData): AgencySettingsData {
  const sanitizedData = {
    ...(data as Record<string, unknown>),
  };

  delete sanitizedData.kashierSettings;
  delete sanitizedData.kashier;
  delete sanitizedData.kashierConfig;
  delete sanitizedData.paymentGateway;

  const paymentMethodsCandidate = sanitizedData.paymentMethods;
  if (paymentMethodsCandidate && typeof paymentMethodsCandidate === 'object') {
    const sanitizedPaymentMethods = {
      ...(paymentMethodsCandidate as Record<string, unknown>),
    };

    delete sanitizedPaymentMethods.kashier;
    delete sanitizedPaymentMethods.kashierSettings;
    delete sanitizedPaymentMethods.kashierConfig;

    sanitizedData.paymentMethods = sanitizedPaymentMethods;
  }

  return sanitizedData as AgencySettingsData;
}

function isKashierConfiguredForOnlinePayments(
  settings: AgencyKashierSettings,
  merchantRedirectUrl: string | null
): boolean {
  return Boolean(settings.merchantId && settings.apiKey && merchantRedirectUrl);
}

async function getAgencySettingsRow(): Promise<AgencySettingsRow | null> {
  const supabase = createPublicClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('settings')
    .select(
      'data, logo_url, favicon_url, og_image_url, twitter_image_url, terms_and_condition_markdown, policy_security_markdown, agency_id, kashier_merchant_id, kashier_api_key, kashier_mode, kashier_allowed_methods, kashier_display'
    )
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching agency settings:', error);
    return null;
  }

  return data ? (data as AgencySettingsRow) : null;
}

export async function getTourTaxonomy(type: TourTaxonomyType): Promise<string[]> {
  const supabase = createPublicClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('tour_taxonomy')
    .select('name, sort_order')
    .eq('agency_id', agencyId)
    .eq('taxonomy_type', type)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching tour taxonomy:', error);
    return [];
  }

  return (data ?? [])
    .map((row) => normalizeTaxonomyName((row as { name: string }).name))
    .filter(Boolean);
}

export async function getAgencySettings(options: { skipTranslation?: boolean } = {}) {
  const agencyId = await getCurrentAgencyId();

  const [row, tourCategories, tourDestinations] = await Promise.all([
    getAgencySettingsRow(),
    getTourTaxonomy('category'),
    getTourTaxonomy('destination'),
  ]);

  const baseData = stripKashierKeysFromSettingsData((row?.data ?? {}) as AgencySettingsData);
  const rowFaviconUrl = normalizeOptionalUrl(row?.favicon_url);
  const rowOgImageUrl = normalizeOptionalUrl(row?.og_image_url);
  const rowTwitterImageUrl = normalizeOptionalUrl(row?.twitter_image_url);
  const rowTermsAndConditionMarkdown = normalizeOptionalMarkdown(row?.terms_and_condition_markdown);
  const rowPolicySecurityMarkdown = normalizeOptionalMarkdown(row?.policy_security_markdown);
  const dataTermsAndConditionMarkdown = normalizeOptionalMarkdown(
    baseData.legalPages?.termsAndConditionMarkdown
  );
  const dataPolicySecurityMarkdown = normalizeOptionalMarkdown(
    baseData.legalPages?.policySecurityMarkdown
  );
  const resolvedTermsAndConditionMarkdown =
    rowTermsAndConditionMarkdown ?? dataTermsAndConditionMarkdown;
  const resolvedPolicySecurityMarkdown = rowPolicySecurityMarkdown ?? dataPolicySecurityMarkdown;
  const mergedSeoSite: SiteSeoSettings | undefined =
    baseData.seo?.site || rowFaviconUrl || rowOgImageUrl || rowTwitterImageUrl
      ? {
          ...(baseData.seo?.site ?? {}),
          ...(rowFaviconUrl ? { faviconUrl: rowFaviconUrl } : {}),
          ...(rowOgImageUrl ? { ogImageUrl: rowOgImageUrl } : {}),
          ...(rowTwitterImageUrl ? { twitterImageUrl: rowTwitterImageUrl } : {}),
        }
      : undefined;
  const mergedSeo: AgencySettingsData['seo'] | undefined =
    mergedSeoSite || baseData.seo
      ? {
          ...(baseData.seo ?? {}),
          site: mergedSeoSite,
        }
      : undefined;
  const mergedLegalPages: AgencySettingsData['legalPages'] | undefined =
    baseData.legalPages || resolvedTermsAndConditionMarkdown || resolvedPolicySecurityMarkdown
      ? {
          ...(baseData.legalPages ?? {}),
          ...(resolvedTermsAndConditionMarkdown
            ? { termsAndConditionMarkdown: resolvedTermsAndConditionMarkdown }
            : {}),
          ...(resolvedPolicySecurityMarkdown
            ? { policySecurityMarkdown: resolvedPolicySecurityMarkdown }
            : {}),
        }
      : undefined;

  if (mergedLegalPages && !resolvedTermsAndConditionMarkdown) {
    delete mergedLegalPages.termsAndConditionMarkdown;
  }

  if (mergedLegalPages && !resolvedPolicySecurityMarkdown) {
    delete mergedLegalPages.policySecurityMarkdown;
  }
  const mergedData: AgencySettingsData = {
    ...baseData,
    seo: mergedSeo,
    legalPages: mergedLegalPages,
  };

  let finalData: AgencySettingsData = {
    ...mergedData,
    tourCategories,
    tourDestinations,
  };

  if (!options.skipTranslation) {
    const target = await getPublicTargetLocale();
    if (target !== 'en') {
      finalData = await translateObject(finalData, AGENCY_SETTINGS_TRANSLATABLE_FIELDS, target);
    }
  }

  return {
    data: finalData,
    logo_url: row?.logo_url ?? null,
    favicon_url: rowFaviconUrl,
    og_image_url: rowOgImageUrl,
    twitter_image_url: rowTwitterImageUrl,
    agency_id: row?.agency_id ?? agencyId,
  };
}

export async function getAgencyKashierSettingsForRuntime(): Promise<AgencyKashierSettings> {
  const row = await getAgencySettingsRow();
  return normalizeAgencyKashierSettingsRow(row);
}

export async function getAgencyKashierSettingsForAdmin(): Promise<AgencyKashierSettings> {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('settings')
    .select(
      'kashier_merchant_id, kashier_api_key, kashier_mode, kashier_allowed_methods, kashier_display'
    )
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch Kashier settings: ${error.message}`);
  }

  return normalizeAgencyKashierSettingsRow((data as AgencyKashierSettingsRow | null) ?? null);
}

export async function getCheckoutPaymentMethodAvailability(): Promise<CheckoutPaymentMethodAvailability> {
  const [settings, kashierSettings] = await Promise.all([
    getAgencySettings({ skipTranslation: true }),
    getAgencyKashierSettingsForRuntime().catch((): AgencyKashierSettings => ({})),
  ]);

  const paymentMethods = settings.data?.paymentMethods;
  const envMerchantRedirectUrl = normalizeOptionalString(process.env.KASHIER_MERCHANT_REDIRECT_URL);
  const effectiveKashierSettings: AgencyKashierSettings = {
    merchantId:
      kashierSettings.merchantId ??
      normalizeOptionalString(process.env.KASHIER_MERCHANT_ID) ??
      undefined,
    apiKey:
      kashierSettings.apiKey ?? normalizeOptionalString(process.env.KASHIER_API_KEY) ?? undefined,
  };
  const onlineConfigured = isKashierConfiguredForOnlinePayments(
    effectiveKashierSettings,
    envMerchantRedirectUrl
  );

  let cash = paymentMethods?.cash ?? true;
  const online = (paymentMethods?.online ?? true) && onlineConfigured;

  if (!cash && !online) {
    cash = true;
  }

  const requestedDefault = paymentMethods?.defaultMethod;
  const defaultMethod: 'cash' | 'online' =
    requestedDefault === 'cash' ? (cash ? 'cash' : 'online') : online ? 'online' : 'cash';

  return {
    cash,
    online,
    defaultMethod,
    onlineConfigured,
  };
}

export async function updateAgencySettings(
  settingsData: AgencySettingsData,
  logoUrl?: string | null,
  faviconUrl?: string | null,
  seoImageUrls?: SeoImageUrls,
  kashierSettings?: AgencyKashierSettingsInput
) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  // Check if settings row exists for this agency
  const existing = await getAgencySettingsRow();

  const {
    tourCategories: _tourCategories,
    tourDestinations: _tourDestinations,
    ...settingsDataWithoutTaxonomy
  } = settingsData ?? {};

  const resolvedLogoUrl = logoUrl === undefined ? (existing?.logo_url ?? null) : logoUrl;
  const existingFaviconUrlFromData =
    normalizeOptionalUrl(existing?.data?.seo?.site?.faviconUrl) ?? null;
  const settingsOgImageUrl = normalizeOptionalUrl(
    settingsDataWithoutTaxonomy.seo?.site?.ogImageUrl
  );
  const settingsTwitterImageUrl = normalizeOptionalUrl(
    settingsDataWithoutTaxonomy.seo?.site?.twitterImageUrl
  );
  const incomingTermsAndConditionMarkdown =
    settingsDataWithoutTaxonomy.legalPages?.termsAndConditionMarkdown;
  const incomingPolicySecurityMarkdown =
    settingsDataWithoutTaxonomy.legalPages?.policySecurityMarkdown;
  const existingOgImageUrlFromData = normalizeOptionalUrl(existing?.data?.seo?.site?.ogImageUrl);
  const existingTwitterImageUrlFromData = normalizeOptionalUrl(
    existing?.data?.seo?.site?.twitterImageUrl
  );
  const existingTermsAndConditionMarkdownFromData = normalizeOptionalMarkdown(
    existing?.data?.legalPages?.termsAndConditionMarkdown
  );
  const existingPolicySecurityMarkdownFromData = normalizeOptionalMarkdown(
    existing?.data?.legalPages?.policySecurityMarkdown
  );
  const resolvedFaviconUrl =
    faviconUrl === undefined
      ? (normalizeOptionalUrl(existing?.favicon_url) ?? existingFaviconUrlFromData)
      : normalizeOptionalUrl(faviconUrl);
  const resolvedOgImageUrl =
    seoImageUrls?.ogImageUrl === undefined
      ? (settingsOgImageUrl ??
        normalizeOptionalUrl(existing?.og_image_url) ??
        existingOgImageUrlFromData)
      : normalizeOptionalUrl(seoImageUrls.ogImageUrl);
  const resolvedTwitterImageUrl =
    seoImageUrls?.twitterImageUrl === undefined
      ? (settingsTwitterImageUrl ??
        normalizeOptionalUrl(existing?.twitter_image_url) ??
        existingTwitterImageUrlFromData)
      : normalizeOptionalUrl(seoImageUrls.twitterImageUrl);
  const resolvedTermsAndConditionMarkdown =
    incomingTermsAndConditionMarkdown === undefined
      ? (normalizeOptionalMarkdown(existing?.terms_and_condition_markdown) ??
        existingTermsAndConditionMarkdownFromData)
      : normalizeOptionalMarkdown(incomingTermsAndConditionMarkdown);
  const resolvedPolicySecurityMarkdown =
    incomingPolicySecurityMarkdown === undefined
      ? (normalizeOptionalMarkdown(existing?.policy_security_markdown) ??
        existingPolicySecurityMarkdownFromData)
      : normalizeOptionalMarkdown(incomingPolicySecurityMarkdown);

  const existingKashierSettings = normalizeAgencyKashierSettingsRow(existing);
  const resolvedKashierMerchantId =
    kashierSettings?.merchantId === undefined
      ? (existingKashierSettings.merchantId ?? null)
      : normalizeOptionalString(kashierSettings.merchantId);
  const resolvedKashierApiKey =
    kashierSettings?.apiKey === undefined
      ? (existingKashierSettings.apiKey ?? null)
      : normalizeOptionalString(kashierSettings.apiKey);
  const resolvedKashierMode =
    kashierSettings?.mode === undefined
      ? (existingKashierSettings.mode ?? null)
      : normalizeKashierMode(kashierSettings.mode);
  const resolvedKashierAllowedMethods =
    kashierSettings?.allowedMethods === undefined
      ? (existingKashierSettings.allowedMethods ?? null)
      : normalizeOptionalString(kashierSettings.allowedMethods);
  const resolvedKashierDisplay =
    kashierSettings?.display === undefined
      ? (existingKashierSettings.display ?? null)
      : normalizeKashierDisplay(kashierSettings.display);

  const currentData = stripKashierKeysFromSettingsData(
    (existing?.data ?? {}) as AgencySettingsData
  );

  const mergedSettingsData: AgencySettingsData = {
    ...currentData,
    ...settingsDataWithoutTaxonomy,
    images: {
      ...(currentData.images ?? {}),
      ...(settingsDataWithoutTaxonomy.images ?? {}),
    },
    socialMedia: {
      ...(currentData.socialMedia ?? {}),
      ...(settingsDataWithoutTaxonomy.socialMedia ?? {}),
    },
    paymentMethods: {
      ...(currentData.paymentMethods ?? {}),
      ...(settingsDataWithoutTaxonomy.paymentMethods ?? {}),
    },
    theme: {
      ...(currentData.theme ?? {}),
      ...(settingsDataWithoutTaxonomy.theme ?? {}),
    },
    destinationPage: {
      ...(currentData.destinationPage ?? {}),
      ...(settingsDataWithoutTaxonomy.destinationPage ?? {}),
    },
    legalPages: {
      ...(currentData.legalPages ?? {}),
      ...(settingsDataWithoutTaxonomy.legalPages ?? {}),
    },
    seo: {
      ...(currentData.seo ?? {}),
      ...(settingsDataWithoutTaxonomy.seo ?? {}),
      site: {
        ...(currentData.seo?.site ?? {}),
        ...(settingsDataWithoutTaxonomy.seo?.site ?? {}),
      },
    },
  };

  if (resolvedFaviconUrl && resolvedFaviconUrl.trim()) {
    mergedSettingsData.seo = {
      ...(mergedSettingsData.seo ?? {}),
      site: {
        ...(mergedSettingsData.seo?.site ?? {}),
        faviconUrl: resolvedFaviconUrl,
      },
    };
  } else if (mergedSettingsData.seo?.site?.faviconUrl) {
    const nextSite = { ...(mergedSettingsData.seo.site ?? {}) };
    delete nextSite.faviconUrl;
    mergedSettingsData.seo = {
      ...(mergedSettingsData.seo ?? {}),
      site: nextSite,
    };
  }

  if (resolvedOgImageUrl) {
    mergedSettingsData.seo = {
      ...(mergedSettingsData.seo ?? {}),
      site: {
        ...(mergedSettingsData.seo?.site ?? {}),
        ogImageUrl: resolvedOgImageUrl,
      },
    };
  } else if (mergedSettingsData.seo?.site?.ogImageUrl) {
    const nextSite = { ...(mergedSettingsData.seo.site ?? {}) };
    delete nextSite.ogImageUrl;
    mergedSettingsData.seo = {
      ...(mergedSettingsData.seo ?? {}),
      site: nextSite,
    };
  }

  if (resolvedTwitterImageUrl) {
    mergedSettingsData.seo = {
      ...(mergedSettingsData.seo ?? {}),
      site: {
        ...(mergedSettingsData.seo?.site ?? {}),
        twitterImageUrl: resolvedTwitterImageUrl,
      },
    };
  } else if (mergedSettingsData.seo?.site?.twitterImageUrl) {
    const nextSite = { ...(mergedSettingsData.seo.site ?? {}) };
    delete nextSite.twitterImageUrl;
    mergedSettingsData.seo = {
      ...(mergedSettingsData.seo ?? {}),
      site: nextSite,
    };
  }

  const mergedLegalPages = {
    ...(mergedSettingsData.legalPages ?? {}),
  };

  if (resolvedTermsAndConditionMarkdown) {
    mergedLegalPages.termsAndConditionMarkdown = resolvedTermsAndConditionMarkdown;
  } else {
    delete mergedLegalPages.termsAndConditionMarkdown;
  }

  if (resolvedPolicySecurityMarkdown) {
    mergedLegalPages.policySecurityMarkdown = resolvedPolicySecurityMarkdown;
  } else {
    delete mergedLegalPages.policySecurityMarkdown;
  }

  if (Object.keys(mergedLegalPages).length > 0) {
    mergedSettingsData.legalPages = mergedLegalPages;
  } else {
    delete mergedSettingsData.legalPages;
  }

  const sanitizedMergedSettingsData = stripKashierKeysFromSettingsData(mergedSettingsData);

  const payload = {
    data: sanitizedMergedSettingsData,
    logo_url: resolvedLogoUrl,
    favicon_url: resolvedFaviconUrl,
    og_image_url: resolvedOgImageUrl,
    twitter_image_url: resolvedTwitterImageUrl,
    terms_and_condition_markdown: resolvedTermsAndConditionMarkdown,
    policy_security_markdown: resolvedPolicySecurityMarkdown,
    kashier_merchant_id: resolvedKashierMerchantId,
    kashier_api_key: resolvedKashierApiKey,
    kashier_mode: resolvedKashierMode,
    kashier_allowed_methods: resolvedKashierAllowedMethods,
    kashier_display: resolvedKashierDisplay,
    updated_at: new Date().toISOString(),
    agency_id: agencyId,
  };

  let error;
  if (existing) {
    // Update
    const { error: updateError } = await supabase
      .from('settings')
      .update(payload)
      .eq('agency_id', agencyId);
    error = updateError;
  } else {
    // Insert
    const { error: insertError } = await supabase.from('settings').insert(payload);
    error = insertError;
  }

  if (error) {
    throw new Error(`Failed to save settings: ${error.message}`);
  }

  revalidatePath('/');
  revalidatePath('/about');
  revalidatePath('/contact');
  revalidatePath('/terms-and-condition');
  revalidatePath('/policy-security');
  revalidatePath('/tours');
  revalidatePath('/services');
  revalidatePath('/blog');
  revalidatePath('/destination');
  revalidatePath('/upsell-items');
  revalidatePath('/tailor-made');
  revalidatePath('/terms');
  revalidatePath('/privacy');
  revalidatePath('/admin/tours');
  revalidatePath('/admin/tours/new');
  revalidatePath('/admin/tours/settings');
  revalidatePath('/admin/settings');
}

export async function updateTourTaxonomy(input: { categories: string[]; destinations: string[] }) {
  const agencyId = await getCurrentAgencyId();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('You must be signed in to update tour settings.');
  }

  const { data: adminMembership, error: adminMembershipError } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminMembershipError) {
    throw new Error(adminMembershipError.message);
  }

  if (!adminMembership) {
    const { data: agencyMembership, error: agencyMembershipError } = await supabase
      .from('agency_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (agencyMembershipError) {
      throw new Error(agencyMembershipError.message);
    }

    const role = agencyMembership?.role;
    if (role !== 'owner' && role !== 'admin') {
      throw new Error('You are not authorized to update tour settings.');
    }
  }

  const adminClient = createServiceRoleClient();
  const now = new Date().toISOString();

  async function syncType(taxonomyType: TourTaxonomyType, values: string[]) {
    const normalizedValues = values.map(normalizeTaxonomyName).filter(Boolean);

    const seen = new Set<string>();
    const unique = normalizedValues.filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => a.localeCompare(b));

    const usedSlugs = new Set<string>();
    const upsertRows = unique.map((name, idx) => {
      let baseSlug = slugifyTaxonomyName(name);
      if (!baseSlug) {
        baseSlug = crypto.randomUUID();
      }

      let slug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      usedSlugs.add(slug);

      return {
        agency_id: agencyId,
        taxonomy_type: taxonomyType,
        name,
        slug,
        is_active: true,
        sort_order: idx,
        updated_at: now,
      };
    });

    if (upsertRows.length > 0) {
      const { error: upsertError } = await adminClient
        .from('tour_taxonomy')
        .upsert(upsertRows, { onConflict: 'agency_id,taxonomy_type,slug' });

      if (upsertError) {
        throw new Error(upsertError.message);
      }
    }

    const { data: existingActive, error: existingError } = await adminClient
      .from('tour_taxonomy')
      .select('id, name, slug, is_active')
      .eq('agency_id', agencyId)
      .eq('taxonomy_type', taxonomyType)
      .eq('is_active', true);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const desiredKeys = new Set(unique.map((name) => name.toLowerCase()));
    const toDeactivateIds = ((existingActive ?? []) as TourTaxonomyRow[])
      .filter((row) => !desiredKeys.has(normalizeTaxonomyName(row.name).toLowerCase()))
      .map((row) => row.id);

    if (toDeactivateIds.length > 0) {
      const { error: deactivateError } = await adminClient
        .from('tour_taxonomy')
        .update({ is_active: false, updated_at: now })
        .in('id', toDeactivateIds);

      if (deactivateError) {
        throw new Error(deactivateError.message);
      }
    }
  }

  await syncType('category', input.categories ?? []);
  await syncType('destination', input.destinations ?? []);

  revalidatePath('/');
  revalidatePath('/tours');
  revalidatePath('/destination');
  revalidatePath('/admin/tours');
  revalidatePath('/admin/tours/new');
  revalidatePath('/admin/tours/settings');
}

export async function getHomePageContent(options: { skipTranslation?: boolean } = {}) {
  const supabase = createPublicClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('home_page_content')
    .select('data')
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching home page content:', error);
    return null;
  }

  if (!data) return null;
  const home = data.data as HomeContent;
  if (options.skipTranslation) return home;
  const target = await getPublicTargetLocale();
  if (target === 'en') return home;
  return translateHomeContent(home, target);
}

export async function updateHomePageContent(content: HomeContent) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const existing = await getHomePageContent({ skipTranslation: true });

  const payload = {
    data: content,
    updated_at: new Date().toISOString(),
    agency_id: agencyId,
  };

  let error;
  if (existing) {
    const { error: updateError } = await supabase
      .from('home_page_content')
      .update(payload)
      .eq('agency_id', agencyId);
    error = updateError;
  } else {
    const { error: insertError } = await supabase.from('home_page_content').insert(payload);
    error = insertError;
  }

  if (error) {
    throw new Error(`Failed to save home page content: ${error.message}`);
  }

  revalidatePath('/');
}

export async function getPageMetadata(
  page: string,
  defaults?: { title?: string; description?: string }
): Promise<Metadata> {
  let settings;
  try {
    settings = await getAgencySettings();
  } catch {
    // ignore
  }

  const site = settings?.data?.seo?.site;
  const seoMap = settings?.data?.seo as Record<string, PageSeoSettings | undefined> | undefined;
  const seo = seoMap?.[page];

  const siteName = site?.siteName || settings?.data?.agencyName || 'Travel Agency';

  const title = seo?.title || defaults?.title || site?.defaultTitle || siteName;
  const description = seo?.description || defaults?.description || site?.description || '';

  const keywordsSource = seo?.keywords || site?.keywords;
  const keywords = (() => {
    if (!keywordsSource) return undefined;
    const arr = Array.isArray(keywordsSource) ? keywordsSource : keywordsSource.split(',');
    return (arr as string[]).map((k) => k.trim()).filter(Boolean);
  })();

  return {
    title,
    description,
    keywords,
  };
}
