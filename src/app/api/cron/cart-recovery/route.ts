import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  listPendingForRecovery,
  markSent,
  type AbandonedCartRow,
} from '@/lib/supabase/abandoned-carts';
import { sendEmail } from '@/lib/email';
import {
  renderCartRecoveryEmail,
  type CartRecoveryEmailItem,
} from '@/lib/email/templates/cart-recovery';

/**
 * POST /api/cron/cart-recovery
 *
 * Header-protected cron endpoint that emails recovery links for abandoned
 * carts older than 30 minutes that have not yet been emailed. Marks each
 * row as `sent` after a successful (or attempted) send.
 *
 * Auth: requires `x-cron-secret` request header equal to env `CRON_SECRET`.
 *       Returns 503 if `CRON_SECRET` is unset (fail closed).
 *
 * Operator: wire this to a scheduler that hits the endpoint every 10–15
 * minutes. Examples:
 *   - Vercel Cron: add an entry under `vercel.json:crons`.
 *   - Supabase Scheduled Function (pg_cron + pg_net) → POST this URL.
 *   - External cron (cron-job.org / Cloudflare Workers) → same.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgencyMeta = {
  name: string;
  logoUrl?: string;
  emailSettings?: {
    resendApiKey?: string;
    fromName?: string;
    fromEmail?: string;
  };
};

async function loadAgencyMeta(agencyId: string): Promise<AgencyMeta | null> {
  const supabase = createServiceRoleClient();
  const { data: agency } = await supabase
    .from('agencies')
    .select('name, settings')
    .eq('id', agencyId)
    .maybeSingle();
  if (!agency) return null;

  const settings = ((agency as { settings?: Record<string, unknown> }).settings ?? {}) as Record<
    string,
    unknown
  >;
  const emailSettings =
    settings.emailSettings && typeof settings.emailSettings === 'object'
      ? (settings.emailSettings as AgencyMeta['emailSettings'])
      : undefined;
  const logoUrl = typeof settings.logoUrl === 'string' ? settings.logoUrl : undefined;

  return {
    name: String((agency as { name?: string }).name ?? 'Tourista'),
    logoUrl,
    emailSettings,
  };
}

function summarizeSnapshot(row: AbandonedCartRow): CartRecoveryEmailItem[] {
  const snap = row.cartSnapshot;
  const itemsRaw = (snap as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) return [];

  const items: CartRecoveryEmailItem[] = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== 'object') continue;
    const obj = it as Record<string, unknown>;
    const name =
      typeof obj.name === 'string'
        ? obj.name
        : typeof (obj.product as { name?: unknown })?.name === 'string'
          ? String((obj.product as { name: string }).name)
          : 'Item';
    const priceRaw = obj.subtotal ?? obj.price ?? obj.total ?? 0;
    const price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || 0;
    const quantityRaw = obj.quantity ?? obj.unitsBooked;
    const quantity =
      typeof quantityRaw === 'number'
        ? quantityRaw
        : typeof quantityRaw === 'string' && quantityRaw.trim() !== ''
          ? Number(quantityRaw)
          : undefined;
    items.push({ name, price, quantity });
  }
  return items;
}

export async function POST(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    // Fail closed: refuse to run if the secret is unconfigured.
    return NextResponse.json({ ok: false, error: 'cron_unconfigured' }, { status: 503 });
  }

  const provided = request.headers.get('x-cron-secret')?.trim();
  if (provided !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!appUrl) {
    return NextResponse.json({ ok: false, error: 'app_url_unconfigured' }, { status: 503 });
  }

  const rows = await listPendingForRecovery({ minAgeMinutes: 30, limit: 50 });
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      note: 'wire a scheduler (Vercel Cron / Supabase scheduled function) to hit this endpoint every 10–15 minutes',
    });
  }

  // Cache agency metadata to avoid duplicate lookups within the batch.
  const agencyCache = new Map<string, AgencyMeta | null>();

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    let meta = agencyCache.get(row.agencyId);
    if (meta === undefined) {
      meta = await loadAgencyMeta(row.agencyId);
      agencyCache.set(row.agencyId, meta);
    }
    if (!meta) {
      failed += 1;
      continue;
    }

    const recoveryUrl = `${appUrl}/cart/recover/${encodeURIComponent(row.recoveryToken)}`;
    const html = renderCartRecoveryEmail({
      agencyName: meta.name,
      agencyLogoUrl: meta.logoUrl,
      recoveryUrl,
      items: summarizeSnapshot(row),
      total: row.total,
      currency: row.currency,
    });

    const result = await sendEmail({
      to: row.customerEmail,
      subject: `Your ${meta.name} cart is waiting`,
      html,
      agencyEmailSettings: meta.emailSettings,
    });

    // Always mark sent — Resend failures are logged but we don't retry to
    // avoid spamming customers if the API key is misconfigured.
    await markSent(row.id);
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    sent,
    failed,
    note: 'wire a scheduler (Vercel Cron / Supabase scheduled function) to hit this endpoint every 10–15 minutes',
  });
}
