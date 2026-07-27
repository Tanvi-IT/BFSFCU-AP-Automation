import { useState } from "react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  CheckCheck,
  XCircle,
  Upload,
  UserCog,
  ShieldCheck,
  Database,
  Loader2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { demoApi } from "@/services";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Demo-only: a build with VITE_DEMO_MODE="true" shows a "Reset Demo Data"
 * control. Production builds leave the flag unset, so the control never
 * renders — and the API refuses the reset anyway unless DEMO_MODE is on.
 */
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

/** Top-level, standalone. */
const dashboardItem = { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard };

/** Processing queues — the daily work, visible to everyone. */
const queueNavItems = [
  { title: "High-Confidence Queue", url: "/poc/high-confidence", icon: CheckCircle2 },
  { title: "Low-Confidence Queue", url: "/poc/low-confidence", icon: AlertTriangle },
  { title: "Exceptions", url: "/poc/exceptions", icon: AlertOctagon },
  { title: "Declined", url: "/poc/declined", icon: XCircle },
  // Approved is a filtered view of the invoice list, not its own page.
  { title: "Approved", url: "/invoices?status=approved", icon: CheckCheck },
];

/** Administration — everyone sees the first three; the rest are admin-only. */
const adminNavItems: { title: string; url: string; icon: typeof Upload; adminOnly?: boolean }[] = [
  { title: "Upload Invoices", url: "/poc/upload", icon: Upload },
  { title: "Vendors", url: "/vendors", icon: Users },
  { title: "User Management", url: "/poc/user-management", icon: UserCog, adminOnly: true },
  { title: "Audit", url: "/settings/audit", icon: ShieldCheck, adminOnly: true },
];

/** The "Reset Demo Data" control. Rendered only in demo builds. */
function DemoReset() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await demoApi.reset();
      toast({
        title: "Demo data reset",
        description: "All invoices and vendors were cleared. Reloading…",
      });
      // Reload so every queue reflects the clean slate.
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setIsResetting(false);
      setOpen(false);
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: (err as Error)?.message || "Could not reset the demo data.",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <Database className="h-4 w-4 shrink-0" />
          <span>Reset Demo Data</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the demo database?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes all invoices and vendors (and their notes,
            attachments, and history). User accounts and the audit trail are
            kept. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleReset();
            }}
            disabled={isResetting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting…
              </>
            ) : (
              "Delete all data"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AppSidebar() {
  const { isAdmin } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    if (path === "/invoices?status=approved") {
      return location.pathname === "/invoices" && location.search.includes("status=approved");
    }
    return location.pathname.startsWith(path);
  };

  const link = (item: { title: string; url: string; icon: typeof Upload }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
        <NavLink
          to={item.url}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            isActive(item.url) && "bg-accent text-accent-foreground font-medium"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const visibleAdminItems = adminNavItems.filter((i) => !i.adminOnly || isAdmin);

  return (
    <Sidebar className="border-r border-border">
      <SidebarContent className="bg-sidebar">
        {/* Dashboard — standalone */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{link(dashboardItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Processing Queues */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
            Processing Queues
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{queueNavItems.map(link)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Administration */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
            Administration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{visibleAdminItems.map(link)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Demo-only, admin-only: reset the database between demos. */}
      {DEMO_MODE && isAdmin && (
        <SidebarFooter className="border-t border-border bg-sidebar">
          <DemoReset />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
