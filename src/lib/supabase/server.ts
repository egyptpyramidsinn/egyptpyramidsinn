import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Anonymous, no-auth Supabase client for public reads on server components.
 *
 * Why this exists:
 *   The cookie-aware SSR client (`createClient` below) attaches the user's
 *   access token to every PostgREST query. When that token is expired it
 *   triggers an internal `auth/v1/token?grant_type=refresh_token` call which
 *   is heavily rate-limited by Supabase Auth. On a public, anonymous home
 *   render we have no business touching auth at all, so we use this client
 *   for tables that allow anon SELECT (agencies, settings, home_page_content,
 *   tour_taxonomy, etc.). It avoids all auth traffic entirely.
 */
let cachedPublicClient: SupabaseClient | null = null;
export function createPublicClient(): SupabaseClient {
  if (cachedPublicClient) return cachedPublicClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing Supabase public configuration.');
  }
  cachedPublicClient = createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'studio-public-ssr' },
    },
  });
  return cachedPublicClient;
}

/**
 * Returns true when the request carries a Supabase auth cookie. When false,
 * we can safely use a no-auth anon client to read public tables — this avoids
 * any internal `auth/v1/token` refresh traffic that would otherwise rate-limit
 * (HTTP 429 `over_request_rate_limit`) under load.
 */
export async function hasSupabaseAuthCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    const name = cookie.name;
    // Supabase SSR cookies look like `sb-<projectRef>-auth-token` (and `.0`/`.1` chunks).
    if (name.startsWith('sb-') && name.includes('-auth-token')) return true;
  }
  return false;
}

export async function createClient() {
  const cookieStore = await cookies();
  const hasAuth = await hasSupabaseAuthCookie();

  // Fast path for anonymous public requests: when there is no Supabase auth
  // cookie we still build a `@supabase/ssr` server client (so types and
  // call-sites are unchanged) but feed it an empty cookie shim. With no
  // access token attached to PostgREST queries, the SDK will not attempt a
  // token refresh — eliminating the `over_request_rate_limit` 429s that
  // otherwise occur on public, anonymous renders.
  if (!hasAuth) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get() {
            return undefined;
          },
          set() {
            /* no-op on public anon path */
          },
          remove() {
            /* no-op on public anon path */
          },
        },
      }
    );
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY configuration.');
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
