'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CartItem } from '@/types';

type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'redirecting' };

type RecoverResponse = {
  ok: boolean;
  snapshot?: { items?: unknown };
  error?: string;
};

const CART_STORAGE_VERSION = 'v2';

function isSupportedCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const pt = (value as { productType?: unknown }).productType;
  return pt === 'tour' || pt === 'upsell' || pt === 'room';
}

export default function CartRecoverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(`/api/cart/recover/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) {
            setStatus({
              kind: 'error',
              message:
                res.status === 404
                  ? 'This recovery link has expired or already been used.'
                  : 'Could not recover your cart. Please try again.',
            });
          }
          return;
        }
        const json = (await res.json()) as RecoverResponse;
        const itemsRaw = json.snapshot?.items;
        const items: CartItem[] = Array.isArray(itemsRaw)
          ? itemsRaw.filter(isSupportedCartItem)
          : [];

        if (typeof window !== 'undefined') {
          try {
            const host = window.location.host;
            const key = `${host}-cart-${CART_STORAGE_VERSION}`;
            window.localStorage.setItem(key, JSON.stringify(items));
          } catch {
            // ignore — fall through to redirect anyway
          }
        }

        if (cancelled) return;
        setStatus({ kind: 'redirecting' });
        if (typeof window !== 'undefined') {
          // Hard navigation so CartProvider re-reads the freshly hydrated key.
          window.location.replace('/checkout');
        }
      } catch {
        if (!cancelled) {
          setStatus({
            kind: 'error',
            message: 'Could not recover your cart. Please try again.',
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-md items-center justify-center py-16">
      <Card className="w-full overflow-hidden rounded-3xl border bg-card">
        <CardContent className="space-y-4 p-8 text-center">
          {status.kind === 'error' ? (
            <>
              <h1 className="text-xl font-semibold">Recovery link invalid</h1>
              <p className="text-sm text-muted-foreground">{status.message}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button asChild variant="outline">
                  <Link href="/cart">Open cart</Link>
                </Button>
                <Button asChild>
                  <Link href="/tours">Browse tours</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <h1 className="text-lg font-semibold">
                {status.kind === 'redirecting'
                  ? 'Bringing you to checkout…'
                  : 'Restoring your cart…'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Hold tight — this only takes a moment.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
