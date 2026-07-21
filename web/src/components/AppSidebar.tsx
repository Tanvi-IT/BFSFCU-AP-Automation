import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { adminApi } from "@/services";
import {
  LayoutDashboard,
  FileText,
  Users,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  CheckCheck,
  XCircle,
  Upload,
  UserCog,
  Trash2,
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

/**
 * Daily review work. These were previously only reachable from POCSidebar,
 * which rendered when the signed-in tenant matched a hardcoded GUID. This
 * build is single-tenant, so that check could never pass and the queues had
 * no navigation at all despite the pages working.
 */
const queueNavItems = [
  { title: "Upload Invoices", url: "/poc/upload", icon: Upload },
  { title: "High-Confidence Queue", url: "/poc/high-confidence", icon: CheckCircle2 },
  { title: "Low-Confidence Queue", url: "/poc/low-confidence", icon: AlertTriangle },
  { title: "Exceptions", url: "/poc/exceptions", icon: AlertOctagon },
  { title: "Declined", url: "/poc/declined", icon: XCircle },
  // Approved is a filtered view of the invoice list, not its own page, so its
  // active state keys on the query string rather than the path.
  { title: "Approved", url: "/invoices?status=approved", icon: CheckCheck },
];

/**
 * Administration. Visible to any admin, matching the old shell — these were
 * briefly placed under the superadmin group, which hid them from admins.
 */
const adminNavItems = [
  { title: "AI Provider", url: "/poc/settings/ai-provider", icon: Brain },
  { title: "User Management", url: "/poc/user-management", icon: UserCog },
];

const tenantNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Vendors", url: "/vendors", icon: Users },
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
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [superadminOpen, setSuperadminOpen] = useState(true);
  const [intelligenceOpen, setIntelligenceOpen] = useState(true);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  
  const canAccessIntelligence = isSuperAdmin || isAdmin;

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    // Approved is /invoices with a filter — match on the query, otherwise it
    // would light up for every invoice-list view.
    if (path === "/invoices?status=approved") {
      return location.pathname === "/invoices" && location.search.includes("status=approved");
    }
    if (path === "/invoices") {
      return location.pathname.startsWith("/invoices") && !location.search.includes("status=approved");
    }
    return location.pathname.startsWith(path);
  };

  const handleReset = async () => {
    if (resetConfirmText !== "DELETE") return;
    setResetting(true);
    setResetMessage(null);
    try {
      await adminApi.demoReset();
      setResetMessage("Database cleared. Ready for fresh demo.");
      setResetConfirmText("");
      setTimeout(() => {
        setShowResetDialog(false);
        setResetMessage(null);
        navigate("/dashboard");
      }, 2000);
    } catch (err) {
      setResetMessage(`Error: ${err instanceof Error ? err.message : "Reset failed"}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="bg-sidebar">
        {/* Review Queues — the daily work */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
            Review Queues
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {queueNavItems.map((item) => (
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

        {/* Administration — any admin, matching the old shell */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
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

                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setShowResetDialog(true)}
                    tooltip="Reset Demo Database"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Reset Demo Database</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-full mx-4">
            <h2 className="text-lg font-bold text-red-600 mb-2">Reset Demo Database</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete all invoices, vendors, and audit records.
              This cannot be undone. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {resetMessage && (
              <p className={`text-sm mb-3 ${resetMessage.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                {resetMessage}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowResetDialog(false); setResetConfirmText(""); setResetMessage(null); }}
                className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetConfirmText !== "DELETE" || resetting}
                className="px-4 py-2 text-sm rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? "Resetting..." : "Reset Database"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Sidebar>
  );
}
