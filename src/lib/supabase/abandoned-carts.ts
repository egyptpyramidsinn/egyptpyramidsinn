'use server';

import { randomBytes } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Abandoned-cart persistence. RLS denies anon access; only service-role
 * callers (server actions, API routes, the cron endpoint) may read/write.
 *
 * Backed by `abandoned_carts` table from
 * `20260503110000_create_abandoned_carts.sql`.
 */

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === PG_UNDEFINED_TABLE;
}

export type CartSnapshot = Record<string, unknown>;

export type AbandonedCartRow = {
  id: string;
  agencyId: string;
  customerEmail: string;
  cartSnapshot: CartSnapshot;
  total: number;
  currency: string;
  status: 'pending' | 'recovered' | 'expired' | 'sent';
  recoveryToken: string;
  recoverySentAt: string | null;
  recoveredAt: string | null;
  expiresAt: string;
  createdAt: string;
};

type DbRow = {
  id: string;
  agency_id: string;
  customer_email: string;
  cart_snapshot: CartSnapshot;
  total: string | number;
  currency: string;
  status: AbandonedCartRow['status'];
  recovery_token: string;
  recovery_sent_at: string | null;
  recovered_at: string | null;
  expires_at: string;
  created_at: string;
};

function rowToDomain(row: DbRow): AbandonedCartRow {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerEmail: row.customer_email,
    cartSnapshot: row.cart_snapshot,
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    recoveryToken: row.recovery_token,
    recoverySentAt: row.recovery_sent_at,
    recoveredAt: row.recovered_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function generateRecoveryToken(): string {
  // 32-byte token, URL-safe, ~43 chars.
  return randomBytes(32).toString('base64url');
}

export async function recordAbandonedCart(params: {
  agencyId: string;
  email: string;
  cartSnapshot: CartSnapshot;
  total: number;
  currency: string;
  ttlHours?: number;
}): Promise<{ ok: true; row: AbandonedCartRow } | { ok: false; reason: string }> {
  const ttlHours = Math.max(1, params.ttlHours ?? 72);
  const supabase = createServiceRoleClient();

  // Idempotency: if a `pending` row exists for the same agency+email created
  // within the last 30 minutes, update its snapshot rather than insert a
  // duplicate.
  const sinceIso = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: existing, error: lookupErr } = await supabase
    .from('abandoned_carts')
    .select('*')
    .eq('agency_id', params.agencyId)
    .eq('customer_email', params.email)
    .eq('status', 'pending')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (lookupErr) {
    if (isUndefinedTable(lookupErr)) return { ok: false, reason: 'table_missing' };
    console.error('[abandoned-carts] lookup error:', lookupErr);
    return { ok: false, reason: lookupErr.message };
  }

  if (existing && existing.length > 0) {
    const row = existing[0] as unknown as DbRow;
    const { data: updated, error: updErr } = await supabase
      .from('abandoned_carts')
      .update({
        cart_snapshot: params.cartSnapshot,
        total: params.total,
        currency: params.currency,
        expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single();
    if (updErr || !updated) {
      console.error('[abandoned-carts] update error:', updErr);
      return { ok: false, reason: updErr?.message ?? 'update_failed' };
    }
    return { ok: true, row: rowToDomain(updated as unknown as DbRow) };
  }

  const insertRow = {
    agency_id: params.agencyId,
    customer_email: params.email,
    cart_snapshot: params.cartSnapshot,
    total: params.total,
    currency: params.currency,
    status: 'pending' as const,
    recovery_token: generateRecoveryToken(),
    expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
  };

  const { data: inserted, error: insErr } = await supabase
    .from('abandoned_carts')
    .insert(insertRow)
    .select('*')
    .single();

  if (insErr || !inserted) {
    if (isUndefinedTable(insErr)) return { ok: false, reason: 'table_missing' };
    console.error('[abandoned-carts] insert error:', insErr);
    return { ok: false, reason: insErr?.message ?? 'insert_failed' };
  }
  return { ok: true, row: rowToDomain(inserted as unknown as DbRow) };
}

export async function getAbandonedCartByToken(token: string): Promise<AbandonedCartRow | null> {
  if (!token) return null;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('abandoned_carts')
    .select('*')
    .eq('recovery_token', token)
    .maybeSingle();

  if (error) {
    if (isUndefinedTable(error)) return null;
    console.error('[abandoned-carts] getByToken error:', error);
    return null;
  }
  if (!data) return null;
  const row = rowToDomain(data as unknown as DbRow);
  if (row.status === 'recovered') return null;
  if (Date.parse(row.expiresAt) < Date.now()) return null;
  return row;
}

export async function markRecovered(id: string): Promise<void> {
  if (!id) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('abandoned_carts')
    .update({ status: 'recovered', recovered_at: new Date().toISOString() })
    .eq('id', id);
  if (error && !isUndefinedTable(error)) {
    console.error('[abandoned-carts] markRecovered error:', error);
  }
}

export async function markSent(id: string): Promise<void> {
  if (!id) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('abandoned_carts')
    .update({ status: 'sent', recovery_sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error && !isUndefinedTable(error)) {
    console.error('[abandoned-carts] markSent error:', error);
  }
}

/**
 * Used by the cron endpoint. Returns rows older than `minAgeMinutes` that
 * have not been emailed yet and have not been recovered.
 */
export async function listPendingForRecovery(params: {
  minAgeMinutes?: number;
  limit?: number;
}): Promise<AbandonedCartRow[]> {
  const minAge = Math.max(1, params.minAgeMinutes ?? 30);
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  const supabase = createServiceRoleClient();
  const beforeIso = new Date(Date.now() - minAge * 60_000).toISOString();

  const { data, error } = await supabase
    .from('abandoned_carts')
    .select('*')
    .eq('status', 'pending')
    .is('recovery_sent_at', null)
    .lte('created_at', beforeIso)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (isUndefinedTable(error)) return [];
    console.error('[abandoned-carts] listPendingForRecovery error:', error);
    return [];
  }
  return ((data ?? []) as unknown as DbRow[]).map(rowToDomain);
}
