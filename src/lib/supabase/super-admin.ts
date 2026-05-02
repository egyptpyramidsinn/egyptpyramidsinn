'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export type PlatformStats = {
  totalAgencies: number;
  activeAgencies: number;
  suspendedAgencies: number;
  newThisMonth: number;
  totalBookings: number;
  totalRevenue: number;
  trialsExpiringThisWeek: number;
  pastDueAgencies: number;
  currentMRR: number;
  previousMRR: number;
  churnedThisMonth: number;
};

export type AgencyHealthRow = {
  agencyId: string;
  totalBookings: number;
  revenueThisMonth: number;
  lastBookingDate: string | null;
  lastAdminLoginAt: string | null;
};

/**
 * Checks whether the currently authenticated user is a super admin.
 *
 * Primary check: queries the `profiles` table for `is_super_admin = true`.
 * Fallback: compares email against `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` env var so
 * that existing deployments keep working until the DB flag is set.
 */
export async function checkSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_super_admin === true) return true;

  const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
  if (superAdminEmail && user.email) {
    return user.email.toLowerCase() === superAdminEmail.toLowerCase();
  }

  return false;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [agenciesRes, bookingsRes, newAgenciesRes] = await Promise.all([
    supabase
      .from('agencies')
      .select('id, status, subscription_status, trial_ends_at, monthly_price, churned_at'),
    supabase.from('bookings').select('total_price'),
    supabase.from('agencies').select('id').gte('created_at', startOfMonth),
  ]);

  const agencies = agenciesRes.data || [];
  const bookings = bookingsRes.data || [];
  const newAgencies = newAgenciesRes.data || [];

  const now7 = new Date();
  now7.setDate(now7.getDate() + 7);
  const weekFromNow = now7.toISOString();

  // Current MRR: sum of monthly_price for active subscriptions
  const currentMRR = agencies
    .filter((a) => a.status === 'active' && a.subscription_status !== 'cancelled')
    .reduce((sum, a) => sum + (Number(a.monthly_price) || 0), 0);

  // Previous MRR approximation: current MRR minus new agencies this month + churned this month
  const churnedThisMonth = agencies.filter(
    (a) => a.churned_at && a.churned_at >= startOfMonth
  ).length;

  const churnedMRR = agencies
    .filter((a) => a.churned_at && a.churned_at >= startOfMonth)
    .reduce((sum, a) => sum + (Number(a.monthly_price) || 0), 0);

  const newMRR = agencies
    .filter((a) => newAgencies.some((n) => n.id === a.id))
    .reduce((sum, a) => sum + (Number(a.monthly_price) || 0), 0);

  const previousMRR = currentMRR - newMRR + churnedMRR;

  return {
    totalAgencies: agencies.length,
    activeAgencies: agencies.filter((a) => a.status === 'active').length,
    suspendedAgencies: agencies.filter((a) => a.status === 'suspended').length,
    newThisMonth: newAgencies.length,
    totalBookings: bookings.length,
    totalRevenue: bookings.reduce((sum, b) => sum + (Number(b.total_price) || 0), 0),
    trialsExpiringThisWeek: agencies.filter(
      (a) =>
        a.subscription_status === 'trial' &&
        a.trial_ends_at &&
        new Date(a.trial_ends_at).getTime() <= new Date(weekFromNow).getTime() &&
        new Date(a.trial_ends_at).getTime() > Date.now()
    ).length,
    pastDueAgencies: agencies.filter((a) => a.subscription_status === 'past_due').length,
    currentMRR,
    previousMRR,
    churnedThisMonth,
  };
}

export async function getAgencyHealthData(): Promise<Record<string, AgencyHealthRow>> {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [bookingsRes, agenciesRes] = await Promise.all([
    supabase.from('bookings').select('agency_id, total_price, created_at'),
    supabase.from('agencies').select('id, last_admin_login_at'),
  ]);

  const bookings = bookingsRes.data || [];
  const agencies = agenciesRes.data || [];

  const healthMap: Record<string, AgencyHealthRow> = {};

  // Initialize all agencies
  for (const agency of agencies) {
    healthMap[agency.id] = {
      agencyId: agency.id,
      totalBookings: 0,
      revenueThisMonth: 0,
      lastBookingDate: null,
      lastAdminLoginAt: agency.last_admin_login_at || null,
    };
  }

  // Aggregate booking data per agency
  for (const b of bookings) {
    const row = healthMap[b.agency_id];
    if (!row) continue;

    row.totalBookings += 1;

    if (b.created_at >= startOfMonth) {
      row.revenueThisMonth += Number(b.total_price) || 0;
    }

    if (!row.lastBookingDate || b.created_at > row.lastBookingDate) {
      row.lastBookingDate = b.created_at;
    }
  }

  return healthMap;
}

export type RevenueDataPoint = { name: string; total: number };

export async function getGlobalRevenueData(days: number): Promise<RevenueDataPoint[]> {
  const supabase = await createClient();

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('total_price, created_at')
    .gte('created_at', startDate.toISOString());

  const allBookings = bookings || [];

  // Build daily buckets
  const dailyMap: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyMap[key] = 0;
  }

  for (const b of allBookings) {
    const d = new Date(b.created_at);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (dailyMap[key] !== undefined) {
      dailyMap[key] += Number(b.total_price) || 0;
    }
  }

  return Object.entries(dailyMap).map(([name, total]) => ({ name, total }));
}

export async function recordAdminLogin(agencyId: string): Promise<void> {
  // Use service role to bypass RLS - this is a non-blocking audit record
  const supabase = createServiceRoleClient();
  await supabase
    .from('agencies')
    .update({ last_admin_login_at: new Date().toISOString() })
    .eq('id', agencyId);
}

// --- S6 Analytics ---

export type ChurnedAgency = {
  id: string;
  name: string;
  churn_reason: string | null;
  churned_at: string;
  monthly_price: number;
  tier: string;
};

export async function getChurnedAgencies(limit = 20): Promise<ChurnedAgency[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agencies')
    .select('id, name, churn_reason, churned_at, monthly_price, settings')
    .not('churned_at', 'is', null)
    .order('churned_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching churned agencies:', error);
    return [];
  }

  return (data || []).map((a) => ({
    id: a.id,
    name: a.name,
    churn_reason: a.churn_reason,
    churned_at: a.churned_at,
    monthly_price: Number(a.monthly_price) || 0,
    tier: ((a.settings as Record<string, unknown>)?.tier as string) || 'free',
  }));
}

export type BookingLeaderboardRow = {
  agencyId: string;
  agencyName: string;
  bookingsThisMonth: number;
  revenueThisMonth: number;
};

export async function getBookingLeaderboard(): Promise<BookingLeaderboardRow[]> {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [bookingsRes, agenciesRes] = await Promise.all([
    supabase.from('bookings').select('agency_id, total_price').gte('created_at', startOfMonth),
    supabase.from('agencies').select('id, name'),
  ]);

  const bookings = bookingsRes.data || [];
  const agencies = agenciesRes.data || [];
  const agencyMap = new Map(agencies.map((a) => [a.id, a.name]));

  const stats: Record<string, { count: number; revenue: number }> = {};
  for (const b of bookings) {
    if (!stats[b.agency_id]) stats[b.agency_id] = { count: 0, revenue: 0 };
    stats[b.agency_id].count += 1;
    stats[b.agency_id].revenue += Number(b.total_price) || 0;
  }

  return Object.entries(stats)
    .map(([agencyId, s]) => ({
      agencyId,
      agencyName: agencyMap.get(agencyId) || 'Unknown',
      bookingsThisMonth: s.count,
      revenueThisMonth: s.revenue,
    }))
    .sort((a, b) => b.bookingsThisMonth - a.bookingsThisMonth);
}

export type GrowthDataPoint = { month: string; agencies: number; mrr: number };

export async function getPlatformGrowthData(): Promise<GrowthDataPoint[]> {
  const supabase = await createClient();

  const now = new Date();
  const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const { data: agencies } = await supabase
    .from('agencies')
    .select('created_at, monthly_price, status, subscription_status, churned_at');

  const allAgencies = agencies || [];

  const points: GrowthDataPoint[] = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    // New agencies in this month
    const newInMonth = allAgencies.filter((a) => {
      const created = new Date(a.created_at);
      return created >= monthStart && created < monthEnd;
    }).length;

    // MRR at end of month: agencies created before month end, not churned before month end
    const mrrAtEnd = allAgencies
      .filter((a) => {
        const created = new Date(a.created_at);
        if (created >= monthEnd) return false;
        if (a.churned_at && new Date(a.churned_at) < monthEnd) return false;
        return true;
      })
      .reduce((sum, a) => sum + (Number(a.monthly_price) || 0), 0);

    points.push({ month: label, agencies: newInMonth, mrr: mrrAtEnd });
  }

  return points;
}

export type AgencyExportRow = {
  name: string;
  slug: string;
  domain: string;
  status: string;
  tier: string;
  subscription_status: string;
  monthly_price: number;
  contact_email: string;
  total_bookings: number;
  total_revenue: number;
  created_at: string;
};

export async function getAgencyExportData(): Promise<AgencyExportRow[]> {
  const supabase = await createClient();

  const [agenciesRes, bookingsRes] = await Promise.all([
    supabase
      .from('agencies')
      .select(
        'id, name, slug, domain, status, settings, subscription_status, monthly_price, created_at'
      )
      .order('created_at', { ascending: false }),
    supabase.from('bookings').select('agency_id, total_price'),
  ]);

  const agencies = agenciesRes.data || [];
  const bookings = bookingsRes.data || [];

  // Aggregate bookings per agency
  const bookingStats: Record<string, { count: number; revenue: number }> = {};
  for (const b of bookings) {
    if (!bookingStats[b.agency_id]) bookingStats[b.agency_id] = { count: 0, revenue: 0 };
    bookingStats[b.agency_id].count += 1;
    bookingStats[b.agency_id].revenue += Number(b.total_price) || 0;
  }

  return agencies.map((a) => {
    const settings = (a.settings || {}) as Record<string, unknown>;
    const contact = (settings.contact || {}) as Record<string, string>;
    const stats = bookingStats[a.id] || { count: 0, revenue: 0 };

    return {
      name: a.name,
      slug: a.slug,
      domain: a.domain || '',
      status: a.status,
      tier: (settings.tier as string) || 'free',
      subscription_status: a.subscription_status || 'active',
      monthly_price: Number(a.monthly_price) || 0,
      contact_email: contact.email || '',
      total_bookings: stats.count,
      total_revenue: stats.revenue,
      created_at: a.created_at,
    };
  });
}
