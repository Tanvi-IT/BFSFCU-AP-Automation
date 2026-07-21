import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import peapodLogo from "@/assets/tenant-logos/peapod-logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Shield, ArrowLeft, Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { signOut, user, isSuperAdmin, isMaker, isChecker, userRole, tenantId, tenantResolved } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const showBackButton = location.pathname !== "/dashboard" && 
    location.pathname !== "/" &&
    !location.pathname.match(/^\/poc\/(low-confidence|high-confidence|exceptions)\/[^/]+$/);

  // Block rendering until tenant is resolved to prevent sidebar flicker
  if (!tenantResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }
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
    if (isSuperAdmin) {
      return (
        <div className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1">
          <Shield className="h-4 w-4 text-white" />
          <span className="text-sm font-medium text-white">Superadmin</span>
        </div>
      );
    }
    if (isMaker) {
      return <Badge className="bg-white/20 text-white border-white/30">AP Origination</Badge>;
    }
    if (userRole) {
      return <Badge className="bg-white/20 text-white border-white/30">{userRole === 'ap_analyst' ? 'AP Origination' : userRole}</Badge>;
    }
    return null;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full max-w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <header className="border-b border-[#0C2D4D] h-16 shrink-0 max-w-full overflow-hidden" style={{ backgroundColor: "#0C2D4D" }}>
            <div className="flex h-full min-w-0 items-center justify-between gap-4 px-4">
              <div className="flex min-w-0 items-center gap-4">
                <SidebarTrigger className="h-8 w-8 text-white hover:text-white/80">
                  <Menu className="h-4 w-4" />
                </SidebarTrigger>
                {showBackButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-white hover:text-white/80 hover:bg-white/10"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                )}
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
          <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};
