import { NextResponse } from 'next/server';
import { verifyKashierSignature } from '@/lib/kashier';
import { applyVerifiedPaymentStatusChange } from '@/lib/supabase/bookings';
import type { Booking } from '@/types';

type KashierWebhookPayload = {
  event?: string;
  data?: Record<string, unknown> & {
    merchantOrderId?: string;
    status?: string;
    signatureKeys?: string[];
  };
};

type PaymentFinalStatus = Extract<Booking['status'], 'Confirmed' | 'Cancelled'>;

const POSITIVE_STATUSES = new Set(['SUCCESS', 'PAID', 'APPROVED', 'CAPTURED']);
const NEGATIVE_STATUSES = new Set(['FAILED', 'FAILURE', 'CANCELLED', 'CANCELED', 'DECLINED']);

function mapPaymentStatus(raw: string): PaymentFinalStatus | null {
  const upper = raw.trim().toUpperCase();
  if (POSITIVE_STATUSES.has(upper)) return 'Confirmed';
  if (NEGATIVE_STATUSES.has(upper)) return 'Cancelled';
  return null;
}

export async function POST(request: Request) {
  let payload: KashierWebhookPayload | null = null;
  try {
    payload = (await request.json()) as KashierWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const signature = request.headers.get('x-kashier-signature');
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  const signatureKeysCandidate = payload?.data?.signatureKeys;
  const signatureKeys =
    Array.isArray(signatureKeysCandidate) &&
    signatureKeysCandidate.every((key) => typeof key === 'string')
      ? signatureKeysCandidate
      : null;

  const verification = await verifyKashierSignature({
    signature,
    signatureKeys,
    data,
  });

  if (!verification.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const merchantOrderId = typeof data.merchantOrderId === 'string' ? data.merchantOrderId : null;
  const paymentStatus = typeof data.status === 'string' ? data.status : null;

  if (!merchantOrderId || !paymentStatus) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const nextStatus = mapPaymentStatus(paymentStatus);

  if (!nextStatus) {
    return NextResponse.json({ ok: true });
  }

  try {
    await applyVerifiedPaymentStatusChange(merchantOrderId, nextStatus);
  } catch (err) {
    console.error('Kashier webhook: failed to apply status change', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
