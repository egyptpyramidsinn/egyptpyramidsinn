'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CheckoutStep = {
  id: string;
  label: string;
  description?: string;
};

export type CheckoutStepperProps = {
  steps: ReadonlyArray<CheckoutStep>;
  /** Index of the currently active step (0-based). */
  currentStep: number;
  /** Highest step index the user has reached so far. */
  maxReachedStep: number;
  /** Called when the user clicks an unlocked previous step. */
  onStepSelect?: (index: number) => void;
  className?: string;
};

/**
 * Three-segment progress bar / stepper for the guided checkout flow.
 *
 * - Active step gets `aria-current="step"`.
 * - Completed and previously-visited steps are clickable.
 * - Future / not-yet-reached steps are disabled (`aria-disabled`).
 */
export function CheckoutStepper({
  steps,
  currentStep,
  maxReachedStep,
  onStepSelect,
  className,
}: CheckoutStepperProps) {
  const total = steps.length;
  const safeIndex = Math.min(Math.max(currentStep, 0), total - 1);
  const percent = total > 1 ? Math.round((safeIndex / (total - 1)) * 100) : 0;

  return (
    <nav
      aria-label="Checkout progress"
      className={cn('rounded-3xl border bg-card p-4 shadow-sm md:p-5', className)}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">
          Step {safeIndex + 1} of {total}
        </span>
        <span className="text-muted-foreground" aria-hidden="true">
          {percent}%
        </span>
      </div>

      {/* Progress track */}
      <div
        className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Checkout completion"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-4 grid grid-cols-3 gap-2 md:gap-4">
        {steps.map((step, index) => {
          const isActive = index === safeIndex;
          const isComplete = index < safeIndex;
          const isClickable = index <= maxReachedStep && index !== safeIndex;
          const isDisabled = index > maxReachedStep;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => {
                  if (isClickable) onStepSelect?.(index);
                }}
                disabled={isDisabled}
                aria-current={isActive ? 'step' : undefined}
                aria-disabled={isDisabled || undefined}
                aria-label={`${step.label}${
                  isActive ? ' (current step)' : isComplete ? ' (completed)' : ''
                }`}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                  isActive && 'border-primary bg-primary/5',
                  !isActive && !isDisabled && 'hover:bg-muted/50',
                  isDisabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isComplete
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'
                  )}
                  aria-hidden="true"
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-semibold',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description ? (
                    <span className="hidden truncate text-xs text-muted-foreground md:block">
                      {step.description}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
