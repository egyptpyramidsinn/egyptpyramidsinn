import { NextResponse } from 'next/server';
import { getAbandonedCartByToken, markRecovered } from '@/lib/supabase/abandoned-carts';

/**
 * GET /api/cart/recover/[token]
 *
 * Returns the cart snapshot for a still-valid recovery token, marks the
 * row as recovered, and lets the client hydrate its localStorage cart.
 * The client is expected to redirect the user to /checkout.
 *
 * Validation:
 *  - 404 when the token is unknown / already recovered / expired.
 *  - 200 with `{ ok: true, snapshot, total, currency, email }` on success.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 });
  }

  const row = await getAbandonedCartByToken(token);
  if (!row) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  await markRecovered(row.id);

  return NextResponse.json({
    ok: true,
    snapshot: row.cartSnapshot,
    total: row.total,
    currency: row.currency,
    email: row.customerEmail,
  });
}
