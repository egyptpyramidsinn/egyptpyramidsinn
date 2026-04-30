'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Booking } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreHorizontal,
  ArrowUpDown,
  FileDown,
  AlertTriangle,
  CreditCard,
  Banknote,
  Copy,
  Check,
  MailCheck,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resendBookingConfirmationEmail } from '@/lib/supabase/bookings';
import { useToast } from '@/hooks/use-toast';

interface ColumnsProps {
  onUpdateStatus: (bookingId: string, status: Booking['status']) => void;
  onDelete: (bookingId: string) => void;
}

interface ActionCellProps {
  booking: Booking;
  onUpdateStatus: (bookingId: string, status: Booking['status']) => void;
  onDelete: (bookingId: string) => void;
}

function BookingIdCopy({ bookingId }: { bookingId: string }) {
  const [copied, setCopied] = useState(false);
  const short = `#${bookingId.substring(0, 8).toUpperCase()}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(bookingId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-0.5 inline-flex w-fit items-center gap-1 rounded font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>{short}</span>
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>Copy booking ID</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ActionCell({ booking, onUpdateStatus, onDelete }: ActionCellProps) {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { toast } = useToast();

  const handleResend = async () => {
    setIsResending(true);
    try {
      await resendBookingConfirmationEmail(booking.id);
      toast({ title: 'Confirmation email resent' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to resend email',
        description: err instanceof Error ? err.message : 'Unexpected error.',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the booking and remove its
              data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(booking.id);
                setIsAlertOpen(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/bookings/${booking.id}`}>View Booking Details</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onUpdateStatus(booking.id, 'Confirmed')}>
            Mark as Confirmed
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onUpdateStatus(booking.id, 'Cancelled')}>
            Mark as Cancelled
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isResending || booking.status === 'Pending'}
            onSelect={(e) => {
              e.preventDefault();
              if (isResending || booking.status === 'Pending') return;
              void handleResend();
            }}
          >
            {isResending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="mr-2 h-4 w-4" />
            )}
            Resend confirmation email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={`/api/bookings/${booking.id}/voucher`} download>
              <FileDown className="mr-2 h-4 w-4" />
              Download Invoice
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setIsAlertOpen(true)}>
            Delete Booking
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export const columns = ({ onUpdateStatus, onDelete }: ColumnsProps): ColumnDef<Booking>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'customerName',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Customer
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const duplicateGroupId = (row.original as { _duplicateGroupId?: string })._duplicateGroupId;
      return (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.customerName}</span>
          <span className="text-xs text-muted-foreground">{row.original.customerEmail}</span>
          {duplicateGroupId && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="mt-0.5 w-fit gap-1 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Possible duplicate
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Same customer, tour, and date as another booking within 30 min — review before
                  confirming.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <BookingIdCopy bookingId={row.original.id} />
        </div>
      );
    },
  },
  {
    accessorKey: 'bookingItems',
    header: 'Tours',
    cell: ({ row }) => {
      const items = row.original.bookingItems;
      if (!items || items.length === 0)
        return <span className="text-muted-foreground">No items</span>;

      return (
        <div className="flex flex-col">
          {items.map((item) => (
            <span key={item.id}>{item.tours?.name || 'Unknown Tour'}</span>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'paymentMethod',
    header: 'Payment',
    cell: ({ row }) => {
      const method = row.getValue('paymentMethod') as Booking['paymentMethod'];
      if (method === 'online') {
        return (
          <Badge
            variant="outline"
            className="gap-1 border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <CreditCard className="h-3 w-3" />
            Online
          </Badge>
        );
      }
      if (method === 'cash') {
        return (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Banknote className="h-3 w-3" />
            Cash
          </Badge>
        );
      }
      return <span className="text-muted-foreground">—</span>;
    },
    filterFn: (row, id, value) => {
      if (!value) return true;
      return row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'bookingDate',
    header: 'Booking Date',
    cell: ({ row }) => {
      const date = new Date(row.getValue('bookingDate'));
      return format(date, 'PPP');
    },
    filterFn: (row, id, value) => {
      if (!value || !value.from) return true;
      const rowDate = new Date(row.getValue(id));
      const from = startOfDay(value.from);
      const to = value.to ? endOfDay(value.to) : endOfDay(value.from);

      return isWithinInterval(rowDate, { start: from, end: to });
    },
  },
  {
    accessorKey: 'totalPrice',
    header: 'Total Price',
    cell: ({ row }) => {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(row.getValue('totalPrice'));

      return <div className="font-mono">{formatted}</div>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      return (
        <Badge
          variant={
            status === 'Confirmed' ? 'default' : status === 'Pending' ? 'secondary' : 'destructive'
          }
          className={cn(
            status === 'Confirmed' && 'bg-green-100 text-green-800',
            status === 'Pending' && 'bg-yellow-100 text-yellow-800',
            status === 'Cancelled' && 'bg-red-100 text-red-800'
          )}
        >
          {status}
        </Badge>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <ActionCell booking={row.original} onUpdateStatus={onUpdateStatus} onDelete={onDelete} />
    ),
  },
];
