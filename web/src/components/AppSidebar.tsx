import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  FileText,
  Users,
  AlertTriangle,
  GitCompare,
  History,
  Settings,
  ShieldCheck,
  Lock,
  Database,
  RefreshCw,
  Server,
  KeyRound,
  Webhook,
  ChevronDown,
  Building2,
  Brain,
  Zap,
  Mail,
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { cn } from "@/lib/utils";

const tenantNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Vendors", url: "/vendors", icon: Users },
  { title: "Exceptions", url: "/exceptions", icon: AlertTriangle },
  { title: "Email Ingestion", url: "/email-ingestion-instructions", icon: Mail },
  { title: "ERP Mapping", url: "/erp-mapping", icon: GitCompare },
  { title: "Export History", url: "/exports/history", icon: History },
  { title: "Settings", url: "/settings/erp", icon: Settings },
];

import { TrendingUp, ShieldAlert } from "lucide-react";

const intelligenceNavItems = [
  { title: "Cash Flow Forecasting", url: "/intelligence/cashflow", icon: TrendingUp },
  { title: "Automated Approvals", url: "/intelligence/auto-approvals", icon: Zap },
  { title: "Vendor Risk & Fraud", url: "/intelligence/vendor-risk", icon: ShieldAlert },
];

const superadminNavItems = [
  { title: "Email Routing Debugger", url: "/email-routing-debugger", icon: Mail },
  { title: "Audit", url: "/settings/audit", icon: ShieldCheck },
  { title: "Security", url: "/settings/security", icon: Lock },
  { title: "Master Data", url: "/settings/erp/master-data", icon: Database },
  { title: "ERP Sync", url: "/reconciliation/events", icon: RefreshCw },
  { title: "ERP Connectors", url: "/settings/erp/connectors", icon: Settings },
  { title: "API Keys", url: "/settings/api-keys", icon: KeyRound },
  { title: "Webhooks", url: "/settings/webhooks", icon: Webhook },
  { title: "System", url: "/system", icon: Server },
];

export function AppSidebar() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [superadminOpen, setSuperadminOpen] = useState(true);
  const [intelligenceOpen, setIntelligenceOpen] = useState(true);
  
  const canAccessIntelligence = isSuperAdmin || isAdmin;

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="bg-sidebar">
        {/* Tenant Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tenantNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        isActive(item.url) && "bg-accent text-accent-foreground font-medium"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* AP Intelligence - Visible for Admin and Superadmin */}
        {canAccessIntelligence && (
          <SidebarGroup>
            <Collapsible open={intelligenceOpen} onOpenChange={setIntelligenceOpen}>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 cursor-pointer hover:bg-accent/50 rounded-md flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    <span>AP Intelligence</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      intelligenceOpen && "rotate-180"
                    )}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {intelligenceNavItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.url)}
                          tooltip={item.title}
                        >
                          <NavLink
                            to={item.url}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              isActive(item.url) && "bg-accent text-accent-foreground font-medium"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {/* Superadmin Tools - Only visible for superadmin */}
        {isSuperAdmin && (
          <SidebarGroup>
            <Collapsible open={superadminOpen} onOpenChange={setSuperadminOpen}>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 cursor-pointer hover:bg-accent/50 rounded-md flex items-center justify-between">
                  <span>Superadmin Tools</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      superadminOpen && "rotate-180"
                    )}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {superadminNavItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.url)}
                          tooltip={item.title}
                        >
                          <NavLink
                            to={item.url}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              isActive(item.url) && "bg-accent text-accent-foreground font-medium"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
