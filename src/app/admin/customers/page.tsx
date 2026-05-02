import { getCustomers } from '@/lib/supabase/customers';
import { CustomersClient } from './customers-client';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const customers = await getCustomers();

  return <CustomersClient initialCustomers={customers} />;
}
