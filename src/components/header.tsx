'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Mail,
  Phone,
  MapPin,
  Twitter,
  Facebook,
  Instagram,
  Heart,
  Menu,
  ChevronDown,
  Globe,
  Check,
} from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { useWishlist } from '@/hooks/use-wishlist';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { Language } from '@/hooks/use-language';
import type { Currency } from '@/hooks/use-currency';
import { useLanguage, languages } from '@/hooks/use-language';
import { useCurrency, currencies } from '@/hooks/use-currency';
import { cn } from '@/lib/utils';
import { AgencySettingsData } from '@/lib/supabase/agency-content';
import { useSettings } from '@/components/providers/settings-provider';
import { getHotelHubHref } from '@/lib/routing/hotel-links';

type SettingsData = AgencySettingsData;

function normalizeNavHref(href: string | undefined | null) {
  const raw = String(href || '').trim();
  if (!raw) return '/';

  const lower = raw.toLowerCase();
  const withoutTrailingSlash = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;

  if (lower === '/#about' || lower === '#about' || lower === 'about') return '/about';
  if (lower === '/#services' || lower === '#services' || lower === 'services') return '/services';
  if (lower === '/#contact' || lower === '#contact' || lower === 'contact') return '/contact';
  if (lower === '/#tours' || lower === '#tours' || lower === 'tours') return '/tours';

  if (withoutTrailingSlash.startsWith('#')) return `/${withoutTrailingSlash}`;
  return withoutTrailingSlash;
}

function getNavHref(label: string, href: string) {
  const normalizedLabel = String(label || '')
    .trim()
    .toLowerCase();
  if (normalizedLabel === 'destination') return '/destination';
  return normalizeNavHref(href);
}

function TopBar({
  contactEmail,
  phoneNumber,
  address,
  socialMedia,
}: {
  contactEmail?: string;
  phoneNumber?: string;
  address?: string;
  socialMedia?: SettingsData['socialMedia'];
}) {
  return (
    <div className="bg-secondary text-secondary-foreground text-sm py-2 border-b">
      <div className="container flex justify-between items-center max-w-screen-2xl">
        <div className="flex items-center gap-6">
          {contactEmail ? (
            <a
              href={`mailto:${contactEmail}`}
              className="flex items-center gap-2 hover:text-primary"
            >
              <Mail className="w-4 h-4" />
              <span>{contactEmail}</span>
            </a>
          ) : null}
          {phoneNumber ? (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span>{phoneNumber}</span>
            </div>
          ) : null}
          {address ? (
            <div className="hidden md:flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>{address}</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {socialMedia?.twitter ? (
            <a href={socialMedia.twitter} className="hover:text-primary" aria-label="Twitter">
              <Twitter className="w-4 h-4" />
            </a>
          ) : null}
          {socialMedia?.facebook ? (
            <a href={socialMedia.facebook} className="hover:text-primary" aria-label="Facebook">
              <Facebook className="w-4 h-4" />
            </a>
          ) : null}
          {socialMedia?.instagram ? (
            <a href={socialMedia.instagram} className="hover:text-primary" aria-label="Instagram">
              <Instagram className="w-4 h-4" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LanguageCurrencySelector({ isHero }: { isHero?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const currentLang = languages.find((l) => l.code === language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'hidden lg:flex items-center gap-2 px-3 transition-colors',
            isHero ? 'hover:bg-white/10' : 'hover:bg-muted/50'
          )}
        >
          <Globe className={cn('h-4 w-4', isHero ? 'text-white/80' : 'text-muted-foreground')} />
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              isHero ? 'text-white/90' : 'text-foreground'
            )}
          >
            <span>{currentLang?.flag}</span>
            <span className={cn('mx-1 h-3 w-[1px]', isHero ? 'bg-white/30' : 'bg-border')} />
            <span>{currency}</span>
          </div>
          <ChevronDown
            className={cn('h-3 w-3 opacity-50', isHero ? 'text-white/80' : 'text-muted-foreground')}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider px-2 py-1.5">
          {t('header.language')}
        </DropdownMenuLabel>
        <div className="grid grid-cols-1 gap-1 mb-2">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code as Language)}
              className={cn(
                'flex items-center justify-between px-3 py-2 cursor-pointer rounded-md',
                language === lang.code
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{lang.flag}</span>
                <span>{lang.name}</span>
              </div>
              {language === lang.code && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider px-2 py-1.5 mt-2">
          {t('header.currency')}
        </DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1">
          {currencies.map((curr) => (
            <DropdownMenuItem
              key={curr.code}
              onClick={() => setCurrency(curr.code as Currency)}
              className={cn(
                'flex items-center justify-center gap-1.5 px-2 py-2 cursor-pointer rounded-md text-xs',
                currency === curr.code
                  ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <span>{curr.symbol}</span>
              <span>{curr.code}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { cartItems } = useCart();
  const { wishlistItems } = useWishlist();
  const { t } = useLanguage();
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    setIsClient(true);
    const handleScroll = () => setIsScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isHero = pathname === '/' && !isScrolled;

  const itemCount = isClient ? cartItems.length : 0;
  const wishlistItemCount = isClient ? wishlistItems.length : 0;

  /** Returns Tailwind classes for a desktop nav link, including active-state underline */
  const navLinkClass = (href: string) => {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return cn(
      'relative text-sm font-medium transition-all duration-200 py-1',
      'after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:rounded-full after:transition-all after:duration-200',
      isHero
        ? cn(
            'drop-shadow',
            isActive
              ? 'text-white after:bg-white'
              : 'text-white/80 hover:text-white after:bg-transparent hover:after:bg-white/40'
          )
        : cn(
            isActive
              ? 'text-primary after:bg-primary'
              : 'text-foreground/75 hover:text-foreground after:bg-transparent hover:after:bg-primary/30'
          )
    );
  };

  const iconClass = cn('h-5 w-5', isHero ? 'text-white/90' : 'text-foreground/80');
  const badgeClass =
    'absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-1 ring-background';

  const mobileNavLinkClass = (href: string) => {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return cn(
      'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
    );
  };

  const mobileNavItems = settings?.data?.navLinks?.length
    ? settings.data.navLinks.map((l) => ({
        href: getNavHref(l.label, l.href),
        label: l.label,
      }))
    : ([
        { href: '/', label: t('nav.home') },
        { href: '/about', label: t('nav.about') },
        { href: '/destination', label: t('nav.destination') },
        ...(settings?.data?.modules?.tours !== false
          ? [{ href: '/tours', label: t('nav.tours') }]
          : []),
        ...(settings?.data?.modules?.hotels !== false
          ? [
              {
                href: getHotelHubHref(settings?.data),
                label: settings?.data?.singleHotelMode ? t('nav.ourRooms') : t('nav.hotels'),
              },
            ]
          : []),
        { href: '/services', label: t('nav.services') },
        { href: '/upsell-items', label: t('nav.extras') },
        ...(settings?.data?.modules?.blog !== false
          ? [{ href: '/blog', label: t('nav.blog') }]
          : []),
        { href: '/contact', label: t('nav.contact') },
      ] as { href: string; label: string }[]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Info top-bar — only visible when not on hero */}
      {!isHero && (
        <div className="hidden md:block">
          <TopBar
            contactEmail={settings?.data?.contactEmail}
            phoneNumber={settings?.data?.phoneNumber}
            address={settings?.data?.address}
            socialMedia={settings?.data?.socialMedia}
          />
        </div>
      )}

      {/* ── Floating pill ── */}
      <div className={cn('px-3 sm:px-5 transition-all duration-300', isHero ? 'pt-4' : 'pt-2')}>
        <div
          className={cn(
            'mx-auto max-w-screen-xl rounded-2xl transition-all duration-500',
            isHero
              ? 'bg-black/25 backdrop-blur-md border border-white/15 shadow-2xl shadow-black/20'
              : 'bg-background/95 backdrop-blur-xl border border-border/40 shadow-lg'
          )}
        >
          <div className="flex h-14 md:h-16 items-center justify-between gap-4 px-4 md:px-6">
            {/* Logo */}
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <Logo
                logoUrl={settings?.logo_url ?? undefined}
                alt={settings?.data?.agencyName || 'Travel Agency'}
              />
              <div className="hidden sm:block leading-tight">
                <span
                  className={cn(
                    'font-headline text-lg md:text-xl font-bold block',
                    isHero ? 'text-white drop-shadow' : 'text-foreground'
                  )}
                >
                  {settings?.data?.agencyName || 'Travel Agency'}
                </span>
                {settings?.data?.tagline ? (
                  <span
                    className={cn(
                      'text-[10px]',
                      isHero ? 'text-white/70' : 'text-muted-foreground'
                    )}
                  >
                    {settings.data.tagline}
                  </span>
                ) : null}
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-5 xl:gap-7">
              {settings?.data?.navLinks && settings.data.navLinks.length > 0 ? (
                settings.data.navLinks.map((l) => {
                  const href = getNavHref(l.label, l.href);
                  return (
                    <Link key={`${l.label}-${l.href}`} href={href} className={navLinkClass(href)}>
                      {l.label}
                    </Link>
                  );
                })
              ) : (
                <>
                  <Link href="/" className={navLinkClass('/')}>
                    {t('nav.home')}
                  </Link>
                  <Link href="/about" className={navLinkClass('/about')}>
                    {t('nav.about')}
                  </Link>
                  <Link href="/destination" className={navLinkClass('/destination')}>
                    {t('nav.destination')}
                  </Link>
                  {settings?.data?.modules?.tours !== false ? (
                    <Link href="/tours" className={navLinkClass('/tours')}>
                      {t('nav.tours')}
                    </Link>
                  ) : null}
                  {settings?.data?.modules?.hotels !== false ? (
                    <Link
                      href={getHotelHubHref(settings?.data)}
                      className={navLinkClass(getHotelHubHref(settings?.data))}
                    >
                      {settings?.data?.singleHotelMode ? t('nav.ourRooms') : t('nav.hotels')}
                    </Link>
                  ) : null}
                  <Link href="/services" className={navLinkClass('/services')}>
                    {t('nav.services')}
                  </Link>
                  <Link href="/upsell-items" className={navLinkClass('/upsell-items')}>
                    {t('nav.extras')}
                  </Link>
                  {settings?.data?.modules?.blog !== false ? (
                    <Link href="/blog" className={navLinkClass('/blog')}>
                      {t('nav.blog')}
                    </Link>
                  ) : null}
                  <Link href="/contact" className={navLinkClass('/contact')}>
                    {t('nav.contact')}
                  </Link>
                </>
              )}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-0.5">
              <LanguageCurrencySelector isHero={isHero} />

              <Button variant="ghost" size="icon" asChild className="relative">
                <Link href="/wishlist">
                  <Heart className={iconClass} />
                  {isClient && wishlistItemCount > 0 && (
                    <span className={badgeClass}>{wishlistItemCount}</span>
                  )}
                  <span className="sr-only">{t('header.wishlist')}</span>
                </Link>
              </Button>

              <Button variant="ghost" size="icon" asChild className="relative">
                <Link href="/cart">
                  <ShoppingCart className={iconClass} />
                  {isClient && itemCount > 0 && <span className={badgeClass}>{itemCount}</span>}
                  <span className="sr-only">{t('header.cart')}</span>
                </Link>
              </Button>

              {/* Click-to-call — mobile only */}
              {settings?.data?.phoneNumber && (
                <Button variant="ghost" size="icon" className="lg:hidden" asChild>
                  <a href={`tel:${settings.data.phoneNumber}`} aria-label="Call us">
                    <Phone className={iconClass} />
                  </a>
                </Button>
              )}

              {/* Mobile menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden ml-0.5">
                    <Menu className={iconClass} />
                    <span className="sr-only">Menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetHeader>
                    <SheetTitle>{t('header.menu')}</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-6 mt-8">
                    <nav className="flex flex-col gap-1">
                      {mobileNavItems.map(({ href, label }) => (
                        <Link key={href} href={href} className={mobileNavLinkClass(href)}>
                          {label}
                        </Link>
                      ))}
                    </nav>
                    <div className="flex flex-col gap-3 border-t pt-5">
                      {settings?.data?.phoneNumber && (
                        <a
                          href={`tel:${settings.data.phoneNumber}`}
                          className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary"
                        >
                          <Phone className="w-4 h-4" />
                          <span>{settings.data.phoneNumber}</span>
                        </a>
                      )}
                      {settings?.data?.contactEmail && (
                        <a
                          href={`mailto:${settings.data.contactEmail}`}
                          className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary"
                        >
                          <Mail className="w-4 h-4" />
                          <span>{settings.data.contactEmail}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
