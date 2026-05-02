'use server';

import { verifyKashierSignature } from '@/lib/kashier';
import { applyVerifiedPaymentStatusChange } from '@/lib/supabase/bookings';
import type { Booking } from '@/types';

type FinalizeInput = {
  merchantOrderId: string;
  paymentStatus?: string | null;
  signature?: string | null;
  /** Either an array (already split) or a CSV string of keys. */
  signatureKeys?: string[] | string | null;
  /** All raw query params from the redirect, used to compute the signature payload. */
  params?: Record<string, string | null | undefined>;
};

type FinalizeResult = {
  status: Booking['status'] | 'unknown';
  changed: boolean;
  reason?: string;
};

const POSITIVE_STATUSES = new Set(['SUCCESS', 'PAID', 'APPROVED', 'CAPTURED']);
const NEGATIVE_STATUSES = new Set(['FAILED', 'FAILURE', 'CANCELLED', 'CANCELED', 'DECLINED']);
type PaymentFinalStatus = Extract<Booking['status'], 'Confirmed' | 'Cancelled'>;

function mapStatus(raw?: string | null): PaymentFinalStatus | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (POSITIVE_STATUSES.has(upper)) return 'Confirmed';
  if (NEGATIVE_STATUSES.has(upper)) return 'Cancelled';
  return null;
}

function parseSignatureKeys(input: FinalizeInput['signatureKeys']): string[] | null {
  if (!input) return null;
  if (Array.isArray(input)) {
    return input.map((k) => String(k).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return null;
}

async function verifyRedirectSignature(input: FinalizeInput) {
  const keys = parseSignatureKeys(input.signatureKeys);

  if (!input.signature?.trim()) {
    return { ok: false as const, reason: 'missing_signature' as const };
  }

  if (!keys || keys.length === 0) {
    return { ok: false as const, reason: 'missing_signature_keys' as const };
  }

  if (!input.params) {
    return { ok: false as const, reason: 'missing_params' as const };
  }

  const data: Record<string, unknown> = {};
  for (const key of keys) {
    data[key] = input.params[key] ?? '';
  }

  return verifyKashierSignature({
    signature: input.signature,
    signatureKeys: keys,
    data,
  });
}

/**
 * Finalize a Kashier redirect on the checkout success page.
 *
 * Strategy:
 * 1. Require `signature`, `signatureKeys`, and raw query params, then verify
 *    them. Unsigned redirect query params are never trusted for finalization.
 * 2. Map `paymentStatus` to a booking status (only Confirmed/Cancelled).
 * 3. Only update when the booking is currently in `Pending` (never downgrade
 *    a Confirmed booking, never overwrite a Cancelled one).
 *
 * Webhook is still the source of truth in production; this exists so users
 * are not stuck on "Processing payment" when the webhook is delayed or not
 * reachable (e.g. local development).
 */
export async function finalizeKashierRedirect(input: FinalizeInput): Promise<FinalizeResult> {
  if (!input.merchantOrderId) {
    return { status: 'unknown', changed: false, reason: 'missing_order_id' };
  }

  const target = mapStatus(input.paymentStatus);
  if (!target) {
    return { status: 'unknown', changed: false, reason: 'unmapped_payment_status' };
  }

  const verification = await verifyRedirectSignature(input);
  if (!verification.ok) {
    return { status: 'unknown', changed: false, reason: verification.reason };
  }

  return applyVerifiedPaymentStatusChange(input.merchantOrderId, target);
}
