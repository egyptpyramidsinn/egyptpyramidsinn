'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  CreditCard,
  Download,
  Loader2,
  Ticket,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getBookingById } from '@/lib/supabase/bookings';
import type { Booking } from '@/types';
import { useCart } from '@/hooks/use-cart';
import { useLanguage } from '@/hooks/use-language';
import { finalizeKashierRedirect } from './actions';

type PaymentState = 'checking' | 'confirmed' | 'cancelled' | 'pending' | 'unknown';

function PaymentMethodBadge({ method }: { method: Booking['paymentMethod'] }) {
  if (method === 'online') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
      >
        <CreditCard className="h-3 w-3" />
        Online
      </Badge>
    );
  }
  if (method === 'cash') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <Banknote className="h-3 w-3" />
        Cash
      </Badge>
    );
  }
  return null;
}

function BookingIdCopyButton({ bookingId }: { bookingId: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookingId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Copy booking ID"
    >
      <span>Booking ID: {bookingId}</span>
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const { clearCart } = useCart();
  const { t } = useLanguage();
  const [paymentState, setPaymentState] = useState<PaymentState>('checking');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [hasVerifiedOnlineConfirmation, setHasVerifiedOnlineConfirmation] = useState(false);

  const merchantOrderId = useMemo(() => {
    return (
      searchParams.get('merchantOrderId') ||
      searchParams.get('merchantOrderID') ||
      searchParams.get('orderId') ||
      searchParams.get('orderID') ||
      null
    );
  }, [searchParams]);

  const paymentStatusParam = useMemo(
    () => searchParams.get('paymentStatus') || searchParams.get('status'),
    [searchParams]
  );

  const allParams = useMemo(() => {
    const obj: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }, [searchParams]);

  useEffect(() => {
    setHasVerifiedOnlineConfirmation(false);

    if (!merchantOrderId || !paymentStatusParam) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await finalizeKashierRedirect({
          merchantOrderId,
          paymentStatus: paymentStatusParam,
          signature: allParams.signature ?? null,
          signatureKeys: allParams.signatureKeys ?? null,
          params: allParams,
        });
        if (!cancelled && result.status === 'Confirmed') {
          setHasVerifiedOnlineConfirmation(true);
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to finalize Kashier redirect:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantOrderId, paymentStatusParam, allParams]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    async function checkBookingStatus() {
      if (!merchantOrderId) {
        setPaymentState('unknown');
        return;
      }

      const booking = await getBookingById(merchantOrderId);
      if (cancelled) return;

      if (!booking) {
        setPaymentState('unknown');
        return;
      }

      setBooking(booking);

      if (booking.status === 'Confirmed') {
        if (booking.paymentMethod === 'online' && !hasVerifiedOnlineConfirmation) {
          setPaymentState('pending');
          return;
        }

        setPaymentState('confirmed');
        clearCart();
        // Clear any stored provisional booking id from the checkout flow.
        try {
          if (typeof window !== 'undefined') {
            const keysToRemove: string[] = [];
            for (let i = 0; i < window.sessionStorage.length; i += 1) {
              const key = window.sessionStorage.key(i);
              if (key && key.startsWith('tourista:checkout:provisionalId:')) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
            window.sessionStorage.removeItem('tourista:checkout:lastSubmitAt');
          }
        } catch {
          /* sessionStorage unavailable; ignore */
        }
        window.clearInterval(intervalId);
        return;
      }

      if (booking.status === 'Cancelled') {
        setPaymentState('cancelled');
        window.clearInterval(intervalId);
        return;
      }

      setPaymentState('pending');
    }

    void checkBookingStatus();

    if (merchantOrderId) {
      intervalId = window.setInterval(() => {
        void checkBookingStatus();
      }, 2000);
    }

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [merchantOrderId, clearCart, hasVerifiedOnlineConfirmation]);

  const heroTitle =
    paymentState === 'confirmed'
      ? t('success.confirmed')
      : paymentState === 'cancelled'
        ? t('success.failed')
        : paymentState === 'pending' || paymentState === 'checking'
          ? t('success.pending')
          : t('success.complete');

  const heroSubtitle =
    paymentState === 'confirmed'
      ? t('success.confirmedDesc')
      : paymentState === 'cancelled'
        ? t('success.failedDesc')
        : paymentState === 'pending' || paymentState === 'checking'
          ? t('success.pendingDesc')
          : t('success.completeDesc');

  const isVerifiedOnlineConfirmedBooking =
    paymentState === 'confirmed' &&
    booking?.paymentMethod === 'online' &&
    hasVerifiedOnlineConfirmation;

  const confirmedCardTitle = isVerifiedOnlineConfirmedBooking
    ? t('success.paymentConfirmed')
    : t('success.confirmed');

  const confirmedTotalLabel =
    booking?.paymentMethod === 'cash' ? t('success.totalDueOnArrival') : t('success.totalPaid');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 py-10">
      <section className="relative overflow-hidden rounded-3xl border bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <div className="relative p-6 md:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit">
                {t('success.badge')}
              </Badge>
              <h1 className="font-headline text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                {heroTitle}
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">{heroSubtitle}</p>
            </div>
            <div className="grid w-full gap-3 sm:max-w-md sm:grid-cols-2">
              <Button asChild size="lg">
                <Link href="/tours">
                  {t('success.browseTours')} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/destination">{t('success.exploreDestinations')}</Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm font-medium">{t('success.step1')}</p>
              <p className="text-sm text-muted-foreground">{t('success.stateCart')}</p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm font-medium">{t('success.step2')}</p>
              <p className="text-sm text-muted-foreground">{t('success.stateCheckout')}</p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm font-medium">{t('success.step3')}</p>
              <p className="text-sm text-muted-foreground">{t('success.stateConfirmation')}</p>
            </div>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden rounded-3xl border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            {paymentState === 'confirmed' ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            ) : paymentState === 'cancelled' ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
                <XCircle className="h-6 w-6" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            <div className="space-y-0.5">
              <CardTitle className="text-2xl">
                {paymentState === 'confirmed'
                  ? confirmedCardTitle
                  : paymentState === 'cancelled'
                    ? t('success.paymentNotCompleted')
                    : t('success.processingPayment')}
              </CardTitle>
              {merchantOrderId ? (
                <BookingIdCopyButton bookingId={merchantOrderId} />
              ) : (
                <p className="text-sm text-muted-foreground">Return to the cart if needed.</p>
              )}
            </div>
          </div>
          {paymentState === 'confirmed' && booking && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {booking.paymentMethod && <PaymentMethodBadge method={booking.paymentMethod} />}
              <Badge variant="secondary" className="font-mono">
                {confirmedTotalLabel}:{' '}
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(booking.totalPrice)}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-muted/30 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background">
                <Ticket className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{t('success.bookingDetails')}</p>
                <p className="text-sm text-muted-foreground">{t('success.bookingDetailsSub')}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/30 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background">
                <Compass className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{t('success.nextIdeas')}</p>
                <p className="text-sm text-muted-foreground">{t('success.nextIdeasSub')}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/30 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{t('success.needHelp')}</p>
                <p className="text-sm text-muted-foreground">{t('success.needHelpSub')}</p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 sm:flex-row sm:justify-between">
          {paymentState === 'cancelled' ? (
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/cart">{t('success.backToCart')}</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/contact">{t('success.contactSupport')}</Link>
            </Button>
          )}

          {paymentState === 'confirmed' && merchantOrderId && (
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href={`/api/bookings/${merchantOrderId}/voucher`} download>
                <Download className="mr-2 h-4 w-4" />
                {t('success.downloadVoucher')}
              </a>
            </Button>
          )}

          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/">
              {t('success.continueExploring')} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
