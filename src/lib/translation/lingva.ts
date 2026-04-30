/**
 * Lingva Translate client (server-only).
 *
 * Lingva REST: GET {base}/api/v1/{source}/{target}/{encodeURIComponent(text)}
 *   → 200 { translation: string }
 *   → non-2xx or { error: string } on failure
 *
 * On any error (network / timeout / non-2xx / error payload), we log a
 * short warning and return the original text — translation must never
 * throw to callers.
 */

import { getCached, setCached, makeKey } from './cache';

const DEFAULT_BASES = [
  'https://lingva-translatevercel.vercel.app',
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
  'https://lingva.lunar.icu',
] as const;
const TIMEOUT_MS = 4000;
const REVALIDATE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const CONCURRENCY = 6;
const loggedWarnings = new Set<string>();

function warnOnce(key: string, message: string) {
  if (loggedWarnings.has(key)) return;
  loggedWarnings.add(key);
  console.warn(message);
}

function baseUrls(): string[] {
  const v = process.env.LINGVA_BASE_URL;
  if (typeof v === 'string' && v.trim().length > 0) {
    // Comma-separated list supported, falls back to defaults if all fail.
    const overrides = v
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    return overrides.length ? [...overrides, ...DEFAULT_BASES] : [...DEFAULT_BASES];
  }
  return [...DEFAULT_BASES];
}

function shouldSkip(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  if (sourceLang === targetLang) return true;
  return false;
}

type LingvaResponse = { translation?: string; error?: string };

export async function lingvaTranslate(
  text: string,
  targetLang: string,
  sourceLang: string = 'en'
): Promise<string> {
  if (typeof text !== 'string') return text as unknown as string;

  // Preserve leading/trailing whitespace on return so placement in wrappers is stable.
  const trimmed = text.trim();

  if (shouldSkip(trimmed, sourceLang, targetLang)) return text;

  const cacheKey = makeKey(sourceLang, targetLang, trimmed);
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const path = `/api/v1/${encodeURIComponent(sourceLang)}/${encodeURIComponent(
    targetLang
  )}/${encodeURIComponent(trimmed)}`;

  const bases = baseUrls();
  let lastFailure: { kind: 'http' | 'payload' | 'error'; detail: string } | null = null;

  for (const base of bases) {
    const url = `${base}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        next: { revalidate: REVALIDATE_SECONDS },
        headers: { accept: 'application/json' },
      });

      if (!res.ok) {
        lastFailure = { kind: 'http', detail: String(res.status) };
        continue;
      }

      const json = (await res.json()) as LingvaResponse;
      if (json.error || typeof json.translation !== 'string') {
        lastFailure = { kind: 'payload', detail: json.error || 'no-translation' };
        continue;
      }

      setCached(cacheKey, json.translation);
      return json.translation;
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      lastFailure = { kind: 'error', detail: name };
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastFailure) {
    warnOnce(
      `${lastFailure.kind}:${lastFailure.detail}:${targetLang}`,
      `[lingva] all mirrors failed (${lastFailure.kind}=${lastFailure.detail}) target=${targetLang} len=${trimmed.length}`
    );
  }
  return text;
}

/**
 * Translate many strings in parallel, capped at 6 concurrent requests.
 * Preserves input order. Empty / skipped strings pass through unchanged.
 */
export async function lingvaTranslateMany(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'en'
): Promise<string[]> {
  const out = new Array<string>(texts.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= texts.length) return;
      const input = texts[idx];
      out[idx] = await lingvaTranslate(input, targetLang, sourceLang);
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(CONCURRENCY, Math.max(1, texts.length));
  for (let i = 0; i < n; i += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}
