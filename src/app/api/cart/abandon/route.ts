import { NextResponse } from 'next/server';
import { getCurrentAgencyId } from '@/lib/supabase/agencies';
import { recordAbandonedCart } from '@/lib/supabase/abandoned-carts';

/**
 * POST /api/cart/abandon
 *
 * Called from the checkout client (typically via `navigator.sendBeacon`)
 * when the user has entered an email but is leaving the page without
 * submitting. Body:
 *   { email: string; total: number; currency: string;
 *     snapshot: Record<string, unknown> }
 *
 * Always returns 204 No Content (or 4xx for malformed input). The endpoint
 * deliberately does not echo whether a row was created — this is a
 * best-effort UX feature, not a confirmation flow.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AbandonBody = {
  email?: unknown;
  total?: unknown;
  currency?: unknown;
  snapshot?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  let body: AbandonBody;
  try {
    body = (await request.json()) as AbandonBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const total = typeof body.total === 'number' ? body.total : Number(body.total);
  const currency = typeof body.currency === 'string' ? body.currency.trim() : '';
  const snapshot =
    body.snapshot && typeof body.snapshot === 'object' && !Array.isArray(body.snapshot)
      ? (body.snapshot as Record<string, unknown>)
      : null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_total' }, { status: 400 });
  }
  if (!currency) {
    return NextResponse.json({ ok: false, error: 'invalid_currency' }, { status: 400 });
  }
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: 'invalid_snapshot' }, { status: 400 });
  }

  let agencyId: string;
  try {
    agencyId = await getCurrentAgencyId();
  } catch {
    return NextResponse.json({ ok: false, error: 'agency_unresolved' }, { status: 400 });
  }

  await recordAbandonedCart({
    agencyId,
    email,
    cartSnapshot: snapshot,
    total,
    currency,
  });

  return new NextResponse(null, { status: 204 });
}
