import { ReactNode, CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import peapodLogo from "@/assets/tenant-logos/peapod-logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Shield, Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { signOut, user, isAdmin, userRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      // MSAL redirects to Entra to end the session, so nothing after this runs
      // on success; navigation is handled by the redirect.
      await signOut();
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to sign out",
      });
    }
  };

  const getRoleBadge = () => {
    if (!userRole) return null;
    if (isAdmin) {
      return (
        <div className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1">
          <Shield className="h-4 w-4 text-white" />
          <span className="text-sm font-medium text-white">Admin</span>
        </div>
      );
    }
    return <Badge className="bg-white/20 text-white border-white/30">{roleLabel(userRole)}</Badge>;
  };

  return (
    <SidebarProvider style={{ "--header-height": "4rem" } as CSSProperties}>
      {/* Full-width top banner. Fixed, so it sits above BOTH the sidebar and the
          content — the sidebar is offset below it via --header-height. */}
      <header
        className="fixed top-0 inset-x-0 z-30 h-16 border-b border-[#0C2D4D]"
        style={{ backgroundColor: "#0C2D4D" }}
      >
        <div className="flex h-full min-w-0 items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-4">
            <SidebarTrigger className="h-8 w-8 text-white hover:text-white/80">
              <Menu className="h-4 w-4" />
            </SidebarTrigger>
            <img
              src={peapodLogo}
              alt="PeaPod"
              className="h-10 w-auto cursor-pointer"
              onClick={() => navigate("/dashboard")}
            />
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-4">
            {getRoleBadge()}
            <span className="hidden max-w-48 truncate text-sm text-white/80 lg:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-2 bg-transparent border border-white text-white hover:bg-white/[0.12] hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <AppSidebar />

      <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-6 pb-6 pt-[calc(4rem+1.5rem)]">
        {children}
      </main>
    </SidebarProvider>
  );
};
