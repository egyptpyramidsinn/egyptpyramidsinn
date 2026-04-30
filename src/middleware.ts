import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

const COUNTRY_COOKIE_NAME = 'NEXT_COUNTRY';
const COUNTRY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const COUNTRY_HEADER_PRIORITY = ['x-vercel-ip-country', 'cf-ipcountry', 'x-country-code'] as const;

function normalizeCountryCode(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const directMatch = /^[A-Za-z]{2}$/.exec(trimmedValue);
  if (directMatch) {
    return trimmedValue.toUpperCase();
  }

  const prefixedMatch = /^([A-Za-z]{2})(?:[-_].+)$/.exec(trimmedValue);
  if (prefixedMatch) {
    return prefixedMatch[1].toUpperCase();
  }

  return null;
}

function getCountryFromHeaders(request: NextRequest): string | null {
  for (const headerName of COUNTRY_HEADER_PRIORITY) {
    const headerValue = request.headers.get(headerName);
    if (!headerValue) {
      continue;
    }

    const normalizedCountryCode = normalizeCountryCode(headerValue);
    if (normalizedCountryCode) {
      return normalizedCountryCode;
    }
  }

  return null;
}

function withCountryCookie(request: NextRequest, response: NextResponse): NextResponse {
  const countryCode = getCountryFromHeaders(request);

  if (countryCode) {
    response.cookies.set(COUNTRY_COOKIE_NAME, countryCode, {
      path: '/',
      maxAge: COUNTRY_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = await createClient(request);
  const { pathname } = request.nextUrl;

  // Guard admin routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/super-admin')) {
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
    try {
      // Refresh session cookie for protected admin routes only.
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        const maybe = error as { status?: number; code?: string; message?: string };
        if (maybe.status === 429 || maybe.code === 'over_request_rate_limit') {
          console.warn('[middleware] Supabase auth rate-limited while checking admin session.');
        } else {
          console.error('[middleware] Failed to check admin session:', error);
        }
      } else {
        session = data.session;
      }
    } catch (error) {
      const maybe = error as { status?: number; code?: string; message?: string };
      if (maybe.status === 429 || maybe.code === 'over_request_rate_limit') {
        console.warn('[middleware] Supabase auth rate-limited while checking admin session.');
      } else {
        console.error('[middleware] Unexpected admin session check failure:', error);
      }
    }

    const isLoginPage = pathname === '/admin';

    // Super Admin route check
    if (pathname === '/admin/super') {
      const url = request.nextUrl.clone();
      url.pathname = '/super-admin';
      return withCountryCookie(request, NextResponse.redirect(url));
    }

    if (pathname.startsWith('/super-admin')) {
      if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin'; // Redirect to login
        return withCountryCookie(request, NextResponse.redirect(url));
      }
    }

    // Single-user app: never redirect admin routes to home.
    // Require login only for non-login admin pages.
    if (!session && !isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return withCountryCookie(request, NextResponse.redirect(url));
    }

    // If already logged in and visiting /admin (login page), send to dashboard.
    // This keeps the login experience simple while honoring the user's request
    // to avoid redirecting admin routes to the public home page.
    if (session && isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/dashboard';
      return withCountryCookie(request, NextResponse.redirect(url));
    }
  }

  return withCountryCookie(request, response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
