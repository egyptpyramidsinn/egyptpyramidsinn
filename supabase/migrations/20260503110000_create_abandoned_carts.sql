-- Abandoned carts (Batch D / C). When a customer enters their email on the
-- checkout page but leaves without submitting, we persist a minimal cart
-- snapshot so a recovery email with a one-click resume link can be sent
-- later (out of band, by /api/cron/cart-recovery).
--
-- The snapshot can contain customer email + cart items, so the table is
-- locked down: RLS enabled with NO policies. Only service-role callers
-- (server actions / API routes / cron job) can read or write.

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  cart_snapshot jsonb NOT NULL,
  total numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'recovered', 'expired', 'sent')),
  recovery_token text NOT NULL UNIQUE,
  recovery_sent_at timestamptz NULL,
  recovered_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status_sent
  ON public.abandoned_carts (status, recovery_sent_at);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email_recent
  ON public.abandoned_carts (agency_id, customer_email, created_at DESC);

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated have no access. Service-role bypasses RLS.
