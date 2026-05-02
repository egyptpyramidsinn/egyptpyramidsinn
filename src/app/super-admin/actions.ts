'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { checkSuperAdmin } from '@/lib/supabase/super-admin';
import { logAudit } from '@/lib/supabase/audit-log';

export async function createAgency(formData: FormData) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) {
    throw new Error('Unauthorized');
  }

  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const domain = formData.get('domain') as string;
  const contactEmail = formData.get('contactEmail') as string;
  const contactPhone = formData.get('contactPhone') as string;
  const tier = (formData.get('tier') as string) || 'free';

  // Module flags (checkboxes send "on" when checked)
  const moduleTours = formData.get('module_tours') === 'on';
  const moduleHotels = formData.get('module_hotels') === 'on';
  const moduleBlog = formData.get('module_blog') === 'on';
  const moduleUpsell = formData.get('module_upsell') === 'on';
  const moduleContact = formData.get('module_contact') === 'on';
  const moduleReviews = formData.get('module_reviews') === 'on';

  if (!name || !slug) {
    throw new Error('Name and Slug are required');
  }

  // Use service role to bypass RLS for agency creation
  const supabase = createServiceRoleClient();
  const { data: newAgency, error } = await supabase
    .from('agencies')
    .insert({
      name,
      slug,
      domain: domain || null,
      status: 'active',
      settings: {
        tier,
        modules: {
          tours: moduleTours,
          hotels: moduleHotels,
          blog: moduleBlog,
          upsell: moduleUpsell,
          contact: moduleContact,
          reviews: moduleReviews,
        },
        contact: {
          ...(contactEmail && { email: contactEmail }),
          ...(contactPhone && { phone: contactPhone }),
        },
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // If a contact email was provided and matches an existing auth user, add them as owner
  if (contactEmail && newAgency?.id) {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const ownerUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === contactEmail.toLowerCase()
    );
    if (ownerUser) {
      await supabase.from('agency_users').insert({
        user_id: ownerUser.id,
        agency_id: newAgency.id,
        role: 'owner',
      });
    }
  }

  await logAudit({
    action: `Created agency "${name}" (${slug})`,
    category: 'agency',
    metadata: { name, slug, tier },
  });

  revalidatePath('/super-admin');
}

export async function switchAgency(slug: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) {
    throw new Error('Unauthorized');
  }

  const cookieStore = await cookies();
  cookieStore.set('admin_agency_override', slug, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  revalidatePath('/');
}

export async function resetAgency() {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) {
    throw new Error('Unauthorized');
  }

  const cookieStore = await cookies();
  cookieStore.delete('admin_agency_override');

  revalidatePath('/');
}

import { AgencyModules } from '@/types/agency';

export async function updateAgencyModules(agencyId: string, modules: AgencyModules) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();

  // First fetch existing settings to preserve other keys
  const { data: existing } = await supabase
    .from('agencies')
    .select('settings')
    .eq('id', agencyId)
    .single();
  const currentSettings = existing?.settings || {};

  const { error } = await supabase
    .from('agencies')
    .update({
      settings: {
        ...currentSettings,
        modules: modules,
      },
    })
    .eq('id', agencyId);

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: 'Updated agency modules',
    category: 'agency',
    metadata: { modules },
  });

  revalidatePath('/super-admin');
}

// --- Broadcast Actions ---

export async function createBroadcast(formData: FormData) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const message = formData.get('message') as string;
  const variant = formData.get('variant') as string;

  if (!message) throw new Error('Message is required');

  const supabase = await createClient();
  const { error } = await supabase.from('system_broadcasts').insert({
    message,
    variant,
    is_active: true,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/super-admin');
  revalidatePath('/', 'layout'); // Revalidate globally so all admins see it
}

export async function toggleBroadcast(id: string, isActive: boolean) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { error } = await supabase
    .from('system_broadcasts')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/super-admin');
  revalidatePath('/', 'layout');
}

export async function deleteBroadcast(id: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { error } = await supabase.from('system_broadcasts').delete().eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/super-admin');
  revalidatePath('/', 'layout');
}

// --- Agency Management Actions (S2) ---

export async function updateAgencyDetails(
  agencyId: string,
  data: {
    name?: string;
    slug?: string;
    domain?: string | null;
    status?: 'active' | 'suspended';
    tier?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
  }
) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();

  // Fetch existing settings
  const { data: existing } = await supabase
    .from('agencies')
    .select('settings')
    .eq('id', agencyId)
    .single();
  const currentSettings = (existing?.settings || {}) as Record<string, unknown>;

  const updatePayload: Record<string, unknown> = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.slug !== undefined) updatePayload.slug = data.slug;
  if (data.domain !== undefined) updatePayload.domain = data.domain || null;
  if (data.status !== undefined) updatePayload.status = data.status;

  // Merge settings fields
  const newSettings = { ...currentSettings };
  if (data.tier !== undefined) newSettings.tier = data.tier;
  if (
    data.contactEmail !== undefined ||
    data.contactPhone !== undefined ||
    data.contactAddress !== undefined
  ) {
    const currentContact = (currentSettings.contact || {}) as Record<string, string>;
    newSettings.contact = {
      ...currentContact,
      ...(data.contactEmail !== undefined && { email: data.contactEmail }),
      ...(data.contactPhone !== undefined && { phone: data.contactPhone }),
      ...(data.contactAddress !== undefined && { address: data.contactAddress }),
    };
  }
  updatePayload.settings = newSettings;

  const { error } = await supabase.from('agencies').update(updatePayload).eq('id', agencyId);

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: 'Updated agency details',
    category: 'agency',
    metadata: { fields: Object.keys(data) },
  });

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function updateAgencyNotes(agencyId: string, notes: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { error } = await supabase
    .from('agencies')
    .update({ internal_notes: notes })
    .eq('id', agencyId);

  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function suspendAgency(agencyId: string, reason: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();

  // Fetch existing settings to set maintenance_mode
  const { data: existing } = await supabase
    .from('agencies')
    .select('settings')
    .eq('id', agencyId)
    .single();
  const currentSettings = (existing?.settings || {}) as Record<string, unknown>;
  const currentModules = (currentSettings.modules || {}) as Record<string, boolean>;

  const { error } = await supabase
    .from('agencies')
    .update({
      status: 'suspended',
      suspended_reason: reason,
      suspended_at: new Date().toISOString(),
      churned_at: new Date().toISOString(),
      churn_reason: reason,
      settings: {
        ...currentSettings,
        modules: { ...currentModules, maintenance_mode: true },
      },
    })
    .eq('id', agencyId);

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: 'Suspended agency',
    category: 'agency',
    metadata: { reason },
  });

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function unsuspendAgency(agencyId: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('agencies')
    .select('settings')
    .eq('id', agencyId)
    .single();
  const currentSettings = (existing?.settings || {}) as Record<string, unknown>;
  const currentModules = (currentSettings.modules || {}) as Record<string, boolean>;

  const { error } = await supabase
    .from('agencies')
    .update({
      status: 'active',
      suspended_reason: null,
      suspended_at: null,
      churned_at: null,
      churn_reason: null,
      settings: {
        ...currentSettings,
        modules: { ...currentModules, maintenance_mode: false },
      },
    })
    .eq('id', agencyId);

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: 'Unsuspended agency',
    category: 'agency',
  });

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function duplicateAgency(sourceAgencyId: string, newName: string, newSlug: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  if (!newName || !newSlug) throw new Error('Name and slug are required');

  const supabase = await createClient();

  // Fetch source agency
  const { data: source, error: fetchError } = await supabase
    .from('agencies')
    .select('*')
    .eq('id', sourceAgencyId)
    .single();

  if (fetchError || !source) throw new Error('Source agency not found');

  const { error } = await supabase.from('agencies').insert({
    name: newName,
    slug: newSlug,
    status: 'active',
    settings: source.settings,
  });

  if (error) throw new Error(error.message);

  await logAudit({
    action: `Cloned agency to "${newName}" (${newSlug})`,
    category: 'agency',
    metadata: { sourceAgencyId, newName, newSlug },
  });

  revalidatePath('/super-admin');
}

export async function deleteAgency(agencyId: string) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();

  // Safety check: count bookings
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId);

  if (count && count > 0) {
    throw new Error(`Cannot delete: agency has ${count} booking(s). Archive it instead.`);
  }

  const { error } = await supabase.from('agencies').delete().eq('id', agencyId);

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: 'Deleted agency',
    category: 'agency',
  });

  revalidatePath('/super-admin');
}

// --- Billing & Payment Actions (S3) ---

export async function updateAgencyBilling(
  agencyId: string,
  data: {
    subscription_status?: string;
    trial_ends_at?: string | null;
    next_billing_date?: string | null;
    monthly_price?: number;
  }
) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const supabase = await createClient();
  const updatePayload: Record<string, unknown> = {};
  if (data.subscription_status !== undefined)
    updatePayload.subscription_status = data.subscription_status;
  if (data.trial_ends_at !== undefined) updatePayload.trial_ends_at = data.trial_ends_at || null;
  if (data.next_billing_date !== undefined)
    updatePayload.next_billing_date = data.next_billing_date || null;
  if (data.monthly_price !== undefined) updatePayload.monthly_price = data.monthly_price;

  // Track churn when subscription is cancelled
  if (data.subscription_status === 'cancelled') {
    updatePayload.churned_at = new Date().toISOString();
    updatePayload.churn_reason = 'Subscription cancelled';
  } else if (data.subscription_status === 'active') {
    // Clear churn when reactivated
    updatePayload.churned_at = null;
    updatePayload.churn_reason = null;
  }

  const { error } = await supabase.from('agencies').update(updatePayload).eq('id', agencyId);

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: 'Updated billing settings',
    category: 'billing',
    metadata: data,
  });

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function recordPayment(
  agencyId: string,
  data: {
    amount: number;
    payment_date: string;
    method: string;
    reference_number?: string;
    notes?: string;
  }
) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  if (!data.amount || data.amount <= 0) throw new Error('Amount must be positive');

  const supabase = await createClient();

  // Get current user for recorded_by
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('agency_payments').insert({
    agency_id: agencyId,
    amount: data.amount,
    payment_date: data.payment_date,
    method: data.method,
    reference_number: data.reference_number || null,
    notes: data.notes || null,
    recorded_by: user?.id || null,
  });

  if (error) throw new Error(error.message);

  // Update subscription status to active and set next billing date
  const nextBilling = new Date(data.payment_date);
  nextBilling.setMonth(nextBilling.getMonth() + 1);

  await supabase
    .from('agencies')
    .update({
      subscription_status: 'active',
      next_billing_date: nextBilling.toISOString(),
    })
    .eq('id', agencyId);

  await logAudit({
    agencyId,
    action: `Recorded payment of $${data.amount}`,
    category: 'billing',
    metadata: { amount: data.amount, method: data.method },
  });

  revalidatePath(`/super-admin/agencies/${agencyId}`);
  revalidatePath('/super-admin');
}

// --- Communication Actions (S4) ---

export async function sendAgencyEmail(
  agencyId: string,
  data: { to: string; subject: string; body: string }
) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  if (!data.to || !data.subject || !data.body) throw new Error('All fields are required');

  // Send via Resend
  const { sendEmail } = await import('@/lib/email');
  const result = await sendEmail({
    to: data.to,
    subject: data.subject,
    html: data.body,
    fromName: 'Tourista Platform',
  });

  if (!result.ok) throw new Error(result.error || 'Failed to send email');

  // Log the email
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from('agency_emails').insert({
    agency_id: agencyId,
    subject: data.subject,
    body: data.body,
    recipient_email: data.to,
    sent_by: user?.id || null,
  });

  await logAudit({
    agencyId,
    action: `Sent email: "${data.subject}"`,
    category: 'communication',
    metadata: { to: data.to, subject: data.subject },
  });

  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function sendBroadcastEmail(data: {
  subject: string;
  body: string;
  filter: 'all' | 'active' | 'trial_expiring' | string;
}) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  if (!data.subject || !data.body) throw new Error('Subject and body are required');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch agencies based on filter
  let query = supabase.from('agencies').select('id, name, settings, subscription_status');

  if (data.filter === 'active') {
    query = query.eq('status', 'active');
  } else if (data.filter === 'trial_expiring') {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    query = query
      .eq('subscription_status', 'trial')
      .lte('trial_ends_at', weekFromNow.toISOString());
  } else if (data.filter !== 'all') {
    // Filter by tier
    query = query.eq('status', 'active');
  }

  const { data: agencies } = await query;

  if (!agencies || agencies.length === 0) throw new Error('No agencies match the filter');

  // Filter by tier if specific tier selected
  let filteredAgencies = agencies;
  if (!['all', 'active', 'trial_expiring'].includes(data.filter)) {
    filteredAgencies = agencies.filter(
      (a) =>
        (a.settings as Record<string, unknown>)?.tier === data.filter ||
        (!(a.settings as Record<string, unknown>)?.tier && data.filter === 'free')
    );
  }

  const { sendEmail } = await import('@/lib/email');
  let sentCount = 0;

  for (const agency of filteredAgencies) {
    const contact = (agency.settings as Record<string, unknown>)?.contact as
      | Record<string, string>
      | undefined;
    const email = contact?.email;
    if (!email) continue;

    const result = await sendEmail({
      to: email,
      subject: data.subject,
      html: data.body,
      fromName: 'Tourista Platform',
    });

    if (result.ok) {
      sentCount++;
      // Log each email
      await supabase.from('agency_emails').insert({
        agency_id: agency.id,
        subject: data.subject,
        body: data.body,
        recipient_email: email,
        sent_by: user?.id || null,
      });
    }
  }

  await logAudit({
    action: `Sent broadcast email: "${data.subject}"`,
    category: 'communication',
    metadata: { filter: data.filter, sentCount, total: filteredAgencies.length },
  });

  revalidatePath('/super-admin');
  return { sentCount, totalAgencies: filteredAgencies.length };
}

export async function createBroadcastWithTargeting(formData: FormData) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  const message = formData.get('message') as string;
  const variant = formData.get('variant') as string;
  const targetTier = formData.get('target_tier') as string;
  const targetStatus = formData.get('target_status') as string;
  const expiresAt = formData.get('expires_at') as string;

  if (!message) throw new Error('Message is required');

  const supabase = await createClient();
  const { error } = await supabase.from('system_broadcasts').insert({
    message,
    variant,
    is_active: true,
    target_tier: targetTier || null,
    target_status: targetStatus || null,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
  });

  if (error) throw new Error(error.message);

  await logAudit({
    action: 'Created targeted broadcast',
    category: 'broadcast',
    metadata: {
      message,
      variant,
      targetTier: targetTier || 'all',
      targetStatus: targetStatus || 'all',
    },
  });

  revalidatePath('/super-admin');
  revalidatePath('/', 'layout');
}

export async function sendNotification(
  agencyId: string,
  data: { title: string; message: string; type?: string }
) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  if (!data.title || !data.message) throw new Error('Title and message are required');

  const supabase = await createClient();
  const { error } = await supabase.from('agency_notifications').insert({
    agency_id: agencyId,
    title: data.title,
    message: data.message,
    type: data.type || 'info',
  });

  if (error) throw new Error(error.message);

  await logAudit({
    agencyId,
    action: `Sent notification: "${data.title}"`,
    category: 'communication',
    metadata: { title: data.title, type: data.type || 'info' },
  });

  revalidatePath(`/super-admin/agencies/${agencyId}`);
}

export async function sendBulkNotification(data: {
  title: string;
  message: string;
  type?: string;
  filter: 'all' | 'active' | 'trial_expiring' | string;
}) {
  const isSuper = await checkSuperAdmin();
  if (!isSuper) throw new Error('Unauthorized');

  if (!data.title || !data.message) throw new Error('Title and message are required');

  const supabase = await createClient();

  let query = supabase.from('agencies').select('id, settings, subscription_status');

  if (data.filter === 'active') {
    query = query.eq('status', 'active');
  } else if (data.filter === 'trial_expiring') {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    query = query
      .eq('subscription_status', 'trial')
      .lte('trial_ends_at', weekFromNow.toISOString());
  }

  const { data: agencies } = await query;
  if (!agencies || agencies.length === 0) throw new Error('No agencies match the filter');

  let filteredAgencies = agencies;
  if (!['all', 'active', 'trial_expiring'].includes(data.filter)) {
    filteredAgencies = agencies.filter(
      (a) =>
        (a.settings as Record<string, unknown>)?.tier === data.filter ||
        (!(a.settings as Record<string, unknown>)?.tier && data.filter === 'free')
    );
  }

  const rows = filteredAgencies.map((a) => ({
    agency_id: a.id,
    title: data.title,
    message: data.message,
    type: data.type || 'info',
  }));

  const { error } = await supabase.from('agency_notifications').insert(rows);

  if (error) throw new Error(error.message);

  await logAudit({
    action: `Sent bulk notification: "${data.title}"`,
    category: 'communication',
    metadata: { filter: data.filter, sentCount: rows.length },
  });

  revalidatePath('/super-admin');
  return { sentCount: rows.length };
}
