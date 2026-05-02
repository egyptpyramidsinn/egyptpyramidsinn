import { createClient } from '@/lib/supabase/server';
import { checkSuperAdmin } from '@/lib/supabase/super-admin';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard } from 'lucide-react';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentEmail = user?.email || 'Not logged in';
  const isSuper = await checkSuperAdmin();

  if (!isSuper) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-4">
        <div className="rounded-xl border bg-white p-8 shadow-sm text-card-foreground max-w-md w-full text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <LogOut className="h-6 w-6 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Access Denied</h1>
          <p className="mb-6 text-zinc-500 text-sm">
            This area is restricted to Super Administrators only.
          </p>

          <div className="space-y-2 text-xs border rounded-lg p-4 bg-zinc-50 mb-6 text-left">
            <div className="flex justify-between">
              <span className="font-semibold text-zinc-700">Current User:</span>
              <span className="font-mono text-zinc-600">{currentEmail}</span>
            </div>
          </div>

          <a
            href="/admin/dashboard"
            className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50/50">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white/80 backdrop-blur-md px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-indigo-200 shadow-md">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-zinc-900 leading-none">Tourista</span>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
              Super Admin
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-indigo-50 text-indigo-700 font-medium">
                    SA
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Super Admin</p>
                  <p className="text-xs leading-none text-muted-foreground truncate">
                    {currentEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/admin/dashboard" className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Exit to Dashboard</span>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
