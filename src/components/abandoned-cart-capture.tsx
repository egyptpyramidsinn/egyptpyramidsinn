'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/hooks/use-cart';
import type { CartItem } from '@/types';

const THROTTLE_MS = 5 * 60 * 1_000;

type EmailCapturedDetail = {
  email?: unknown;
  name?: unknown;
  phoneNumber?: unknown;
  nationality?: unknown;
};

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

function snapshotItems(items: CartItem[]): Array<Record<string, unknown>> {
  return items.map((item) => {
    if (item.productType === 'room') {
      return {
        productType: 'room',
        lineId: item.lineId,
        roomTypeId: item.roomTypeId,
        hotelId: item.hotelId,
        roomSlug: item.roomSlug,
        name: item.name,
        image: item.image ?? null,
        checkInDate: item.checkInDate,
        checkOutDate: item.checkOutDate,
        nights: item.nights,
        adults: item.adults,
        children: item.children,
        unitsBooked: item.unitsBooked,
        currency: item.currency,
        basePricePerNight: item.basePricePerNight,
        pricePerNightAvg: item.pricePerNightAvg,
        subtotal: item.subtotal,
        addons: item.addons,
        tier: item.tier ?? null,
      };
    }
    if (item.productType === 'tour') {
      return {
        productType: 'tour',
        productId: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        packageId: item.packageId ?? null,
        packageName: item.packageName ?? null,
        adults: item.adults ?? 0,
        children: item.children ?? 0,
        date: item.date ? new Date(item.date).toISOString() : null,
      };
    }
    return {
      productType: 'upsell',
      productId: item.product.id,
      name: item.product.name,
      packageId: item.packageId ?? null,
      packageName: item.packageName ?? null,
      quantity: item.quantity ?? 1,
      price: item.product.price,
    };
  });
}

function fingerprint(email: string, items: CartItem[]): string {
  const minimal = items.map((i) =>
    i.productType === 'room'
      ? `r:${i.lineId}:${i.subtotal}`
      : i.productType === 'tour'
        ? `t:${i.product.id}:${i.packageId ?? ''}:${i.adults ?? 0}:${i.children ?? 0}`
        : `u:${i.product.id}:${i.packageId ?? ''}:${i.quantity ?? 1}`
  );
  return djb2(`${email}|${minimal.sort().join('|')}`);
}

/**
 * Listens for the `checkout:email-captured` event dispatched by the
 * checkout stepper once the guest details step gates pass. Sends a
 * `sendBeacon` to `/api/cart/abandon` so the server can persist a
 * recoverable snapshot of the cart.
 *
 * Mounted from the checkout layout so the listener is only active while
 * the user is on `/checkout`. Throttled to one beacon per 5 minutes per
 * (email, cart fingerprint) pair to avoid spamming the endpoint.
 */
export function AbandonedCartCapture() {
  const { cartItems, getCartTotal, getDiscountAmount, getFinalTotal, promoCode } = useCart();
  const itemsRef = useRef(cartItems);
  const totalRef = useRef(getCartTotal);
  const finalRef = useRef(getFinalTotal);
  const discountRef = useRef(getDiscountAmount);
  const promoRef = useRef(promoCode);
  const lastSentRef = useRef<{ key: string; at: number } | null>(null);

  // Keep latest references without re-binding the listener.
  useEffect(() => {
    itemsRef.current = cartItems;
    totalRef.current = getCartTotal;
    finalRef.current = getFinalTotal;
    discountRef.current = getDiscountAmount;
    promoRef.current = promoCode;
  }, [cartItems, getCartTotal, getFinalTotal, getDiscountAmount, promoCode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function send(detail: EmailCapturedDetail) {
      const email = typeof detail.email === 'string' ? detail.email.trim() : '';
      if (!email) return;
      const items = itemsRef.current;
      if (!items || items.length === 0) return;

      const fp = fingerprint(email, items);
      const now = Date.now();
      const last = lastSentRef.current;
      if (last && last.key === fp && now - last.at < THROTTLE_MS) return;

      const total = finalRef.current();
      if (!Number.isFinite(total) || total <= 0) return;

      const sample = items[0];
      const currency = sample && sample.productType === 'room' ? sample.currency : 'USD';

      const snapshot: Record<string, unknown> = {
        items: snapshotItems(items),
        totals: {
          subtotal: totalRef.current(),
          discount: discountRef.current(),
          final: total,
        },
        promo: promoRef.current ? { code: promoRef.current.code } : null,
        capturedAt: new Date().toISOString(),
      };

      const payload = JSON.stringify({ email, total, currency, snapshot });

      try {
        const blob = new Blob([payload], { type: 'application/json' });
        const ok = navigator.sendBeacon?.('/api/cart/abandon', blob) ?? false;
        if (!ok) {
          // Fallback: fire-and-forget fetch with keepalive.
          void fetch('/api/cart/abandon', {
            method: 'POST',
            body: payload,
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
          }).catch(() => undefined);
        }
        lastSentRef.current = { key: fp, at: now };
      } catch {
        // ignore — best-effort
      }
    }

    function handler(ev: Event) {
      const ce = ev as CustomEvent<EmailCapturedDetail>;
      if (!ce.detail) return;
      send(ce.detail);
    }

    window.addEventListener('checkout:email-captured', handler as EventListener);
    return () => {
      window.removeEventListener('checkout:email-captured', handler as EventListener);
    };
  }, []);

  return null;
}
