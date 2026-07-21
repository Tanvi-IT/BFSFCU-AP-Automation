import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  Users,
  History,
  Upload,
  Brain,
  CheckCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { adminApi } from "@/services";

export function POCSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMaker, isChecker, isAdmin } = useAuth();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);


  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const approvedActive = location.pathname === '/invoices' && location.search.includes('status=approved');
  // Highlight the Declined queue when viewing a declined invoice's detail (opened with ?from=declined).
  const declinedActive = location.pathname.startsWith('/invoices/') && location.search.includes('from=declined');

  // Primary queues (daily work)
  const primaryQueues = [
    { 
      title: "High-Confidence Queue", 
      url: "/poc/high-confidence", 
      icon: CheckCircle2,
      readOnly: isMaker
    },
    { 
      title: "Low-Confidence Queue", 
      url: "/poc/low-confidence", 
      icon: AlertTriangle,
      readOnly: false
    },
    { 
      title: "Exceptions", 
      url: "/poc/exceptions", 
      icon: AlertOctagon,
      readOnly: false  // Checkers can now access and manage exceptions
    },
    { 
      title: "Declined", 
      url: "/poc/declined", 
      icon: XCircle,
      readOnly: true
    },
  ];

  // Secondary / Admin items
  const secondaryItems = [
    { 
      title: "Upload Invoices", 
      url: "/poc/upload", 
      icon: Upload,
      readOnly: false,
      adminOnly: false
    },
    { 
      title: "Vendors", 
      url: "/vendors", 
      icon: Users,
      readOnly: isMaker || isChecker,
      adminOnly: false
    },
    { 
      title: "Export History", 
      url: "/exports/history", 
      icon: History,
      readOnly: isMaker || isChecker,
      adminOnly: false
    },
    { 
      title: "AI Provider", 
      url: "/poc/settings/ai-provider", 
      icon: Brain,
      readOnly: false,
      adminOnly: true
    },
    { 
      title: "User Management", 
      url: "/poc/user-management", 
      icon: UserCog,
      readOnly: false,
      adminOnly: true
    },
  ];

  // Filter admin-only items
  const visibleSecondaryItems = secondaryItems.filter(
    item => !item.adminOnly || isAdmin
  );

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
        navigate("/poc/dashboard");
      }, 2000);
    } catch (err: any) {
      setResetMessage(`Error: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <aside className="w-64 border-r border-border bg-sidebar shrink-0">
      <div className="p-4">
        {/* Dashboard Link */}
        <NavLink
          to="/poc/dashboard"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm mb-4",
            "hover:bg-accent hover:text-accent-foreground",
            isActive("/poc/dashboard") && "bg-accent text-accent-foreground font-medium"
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>Dashboard</span>
        </NavLink>

        {/* Primary Queues Section */}
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Processing Queues
        </h2>
        <nav className="space-y-1">
          {primaryQueues.map((item) => (
            <NavLink
              key={item.title}
              to={item.url}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                (isActive(item.url) || (item.url === '/poc/declined' && declinedActive)) && "bg-accent text-accent-foreground font-medium"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>

            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => navigate('/invoices?status=approved')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm text-left",
              "hover:bg-accent hover:text-accent-foreground",
              approvedActive && "bg-accent text-accent-foreground font-medium"
            )}
          >
            <CheckCheck className="h-4 w-4 shrink-0" />
            <span>Approved</span>

          </button>
        </nav>

        {/* Separator */}
        <div className="my-6 border-t border-border" />

        {/* Secondary / Admin Section */}
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Administration
        </h2>
        <nav className="space-y-1">
          {visibleSecondaryItems.map((item) => (
            <NavLink
              key={item.title}
              to={item.url}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                isActive(item.url) && "bg-accent text-accent-foreground font-medium"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>

            </NavLink>
          ))}
        </nav>
      </div>
        {/* Demo Reset — Admin Only */}
        {isAdmin && (
          <>
            <div className="my-6 border-t border-border" />
            <button
              type="button"
              onClick={() => setShowResetDialog(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm text-left text-red-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>Reset Demo Database</span>
            </button>
          </>
        )}

      {/* Confirmation Dialog */}
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
    </aside>
  );
}
