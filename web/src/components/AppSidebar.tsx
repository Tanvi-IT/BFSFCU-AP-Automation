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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
    </Sidebar>
  );
}
