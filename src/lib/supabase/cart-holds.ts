'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Best-effort, short-lived inventory holds for the cart UX. NOT a security
 * boundary — the authoritative inventory check happens in
 * `persistRoomBookings` at booking time.
 *
 * Backed by the `cart_holds` table from migration
 * `20260503100000_create_cart_holds.sql`. The table is RLS-enabled with
 * explicit deny-all policies for direct anon/authenticated access; all access
 * here uses the service-role client.
 * Helpers degrade gracefully when the table is missing (Postgres 42P01) so
 * deployments that have not yet applied the migration continue to function
 * with no holds applied.
 */
const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === PG_UNDEFINED_TABLE;
}

export async function placeCartHold(params: {
  agencyId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  units: number;
  lineId: string;
  sessionId: string;
  ttlMinutes?: number;
}): Promise<void> {
  const ttl = Math.max(1, params.ttlMinutes ?? 15);
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  const supabase = createServiceRoleClient();

  const row = {
    agency_id: params.agencyId,
    room_type_id: params.roomTypeId,
    check_in: params.checkIn,
    check_out: params.checkOut,
    units: params.units,
    line_id: params.lineId,
    session_id: params.sessionId,
    expires_at: expiresAt,
  };

  const { error } = await supabase.from('cart_holds').upsert(row, { onConflict: 'line_id' });
  if (error && !isUndefinedTable(error)) {
    console.error('[cart-holds] placeCartHold error:', error);
    // Non-blocking: holds are best-effort.
  }
}

export async function releaseCartHold(params: { lineId: string }): Promise<void> {
  if (!params.lineId) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('cart_holds').delete().eq('line_id', params.lineId);
  if (error && !isUndefinedTable(error)) {
    console.error('[cart-holds] releaseCartHold error:', error);
  }
}

/**
 * Sums non-expired held units for a given room/date, optionally excluding
 * holds owned by the caller's own session/line so a user's own hold does
 * not block their own quote.
 */
export async function getActiveHeldUnits(params: {
  roomTypeId: string;
  date: string; // YYYY-MM-DD
  excludeSessionId?: string;
  excludeLineId?: string;
}): Promise<number> {
  const supabase = createServiceRoleClient();
  // Best-effort opportunistic purge.
  void purgeExpiredHolds().catch(() => undefined);

  const nowIso = new Date().toISOString();
  let query = supabase
    .from('cart_holds')
    .select('units, session_id, line_id')
    .eq('room_type_id', params.roomTypeId)
    .lte('check_in', params.date)
    .gt('check_out', params.date)
    .gt('expires_at', nowIso);

  if (params.excludeSessionId) {
    query = query.neq('session_id', params.excludeSessionId);
  }
  if (params.excludeLineId) {
    query = query.neq('line_id', params.excludeLineId);
  }

  const { data, error } = await query;
  if (error) {
    if (isUndefinedTable(error)) return 0;
    console.error('[cart-holds] getActiveHeldUnits error:', error);
    return 0;
  }
  return (data ?? []).reduce((acc, row) => acc + Number((row as { units: number }).units ?? 0), 0);
}

export async function purgeExpiredHolds(): Promise<void> {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('cart_holds').delete().lt('expires_at', nowIso);
  if (error && !isUndefinedTable(error)) {
    console.error('[cart-holds] purgeExpiredHolds error:', error);
  }
}
