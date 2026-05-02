'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type HoldTimerProps = {
  /** ISO timestamp string. */
  expiresAt: string | null | undefined;
  /** Called when user clicks "re-confirm" after expiry. Should re-place a hold
   * and update `expiresAt`. */
  onRefresh?: () => void | Promise<void>;
  /** Compact display — no surrounding padding/border. */
  compact?: boolean;
  className?: string;
};

const TICK_MS = 1_000;
const AMBER_THRESHOLD_MS = 2 * 60 * 1_000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Renders a live countdown for a cart hold's `expiresAt`. Pauses while the
 * tab is hidden to avoid waking up offscreen pages every second.
 */
export function HoldTimer({ expiresAt, onRefresh, compact, className }: HoldTimerProps) {
  const [now, setNow] = useState<number>(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function start() {
      if (intervalRef.current != null) return;
      intervalRef.current = setInterval(() => setNow(Date.now()), TICK_MS);
    }
    function stop() {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    function handleVisibility() {
      if (typeof document === 'undefined') return;
      if (document.hidden) stop();
      else {
        setNow(Date.now());
        start();
      }
    }
    if (typeof document !== 'undefined' && document.hidden) {
      // Don't start while hidden, just listen.
    } else {
      start();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, []);

  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const validExpiry = Number.isFinite(expiresMs);
  const remaining = validExpiry ? expiresMs - now : 0;
  const expired = !validExpiry || remaining <= 0;

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    void Promise.resolve(onRefresh()).catch(() => undefined);
  }, [onRefresh]);

  if (!validExpiry) return null;

  const isAmber = !expired && remaining < AMBER_THRESHOLD_MS;

  const wrapperClass = cn(
    'inline-flex items-center gap-1.5 text-xs font-medium',
    compact ? '' : 'rounded-full border bg-background/70 px-2.5 py-1',
    expired
      ? 'text-destructive'
      : isAmber
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground',
    className
  );

  if (expired) {
    return (
      <span className={wrapperClass} role="status" aria-live="polite">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Hold expired — re-confirm dates.
        {onRefresh ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-1 h-6 gap-1 px-2 text-xs"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        ) : null}
      </span>
    );
  }

  return (
    <span className={wrapperClass} role="timer" aria-live="off">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Holding for {formatRemaining(remaining)}
    </span>
  );
}
