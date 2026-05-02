import { createClient } from '@/lib/supabase/server';
import { checkSuperAdmin } from '@/lib/supabase/super-admin';
import { redirect } from 'next/navigation';
import { AgencyDetailClient } from './agency-detail-client';
import { getAgencyAuditLog } from '@/lib/supabase/audit-log';
import type { AgencySettings } from '@/types/agency';

export default async function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) redirect('/admin/dashboard');

  const { id } = await params;
  const supabase = await createClient();

  const { data: agency, error } = await supabase.from('agencies').select('*').eq('id', id).single();

  if (error || !agency) redirect('/super-admin');

  // Fetch booking stats for this agency
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [totalBookingsRes, monthBookingsRes, paymentsRes, auditLog] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('agency_id', id),
    supabase
      .from('bookings')
      .select('total_price')
      .eq('agency_id', id)
      .gte('created_at', startOfMonth),
    supabase
      .from('agency_payments')
      .select('*')
      .eq('agency_id', id)
      .order('payment_date', { ascending: false }),
    getAgencyAuditLog(id, 50),
  ]);

  const totalBookings = totalBookingsRes.count ?? 0;
  const revenueThisMonth = (monthBookingsRes.data || []).reduce(
    (sum, b) => sum + (Number(b.total_price) || 0),
    0
  );
  const payments = (paymentsRes.data || []) as {
    id: string;
    amount: number;
    payment_date: string;
    method: string;
    reference_number: string | null;
    notes: string | null;
    created_at: string;
  }[];

  return (
    <AgencyDetailClient
      agency={{
        id: agency.id,
        name: agency.name,
        slug: agency.slug,
        domain: agency.domain || '',
        status: agency.status as 'active' | 'suspended',
        created_at: agency.created_at,
        settings: (agency.settings || {}) as AgencySettings,
        internal_notes: agency.internal_notes || '',
        suspended_reason: agency.suspended_reason || '',
        suspended_at: agency.suspended_at || null,
        last_admin_login_at: agency.last_admin_login_at || null,
        subscription_status: agency.subscription_status || 'active',
        trial_ends_at: agency.trial_ends_at || null,
        next_billing_date: agency.next_billing_date || null,
        monthly_price: Number(agency.monthly_price) || 0,
      }}
      totalBookings={totalBookings}
      revenueThisMonth={revenueThisMonth}
      payments={payments}
      auditLog={auditLog}
    />
  );
}
