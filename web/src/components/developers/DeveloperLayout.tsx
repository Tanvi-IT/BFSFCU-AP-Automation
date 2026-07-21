import { ReactNode, useState } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  Book, 
  Key, 
  Webhook, 
  Code2, 
  Shield, 
  FileText, 
  Zap,
  ChevronDown,
  ChevronRight,
  Users,
  Package,
  RefreshCcw,
  Menu,
  X
} from "lucide-react";
import clarusLogo from "@/assets/clarus-logo.png";
import { Button } from "@/components/ui/button";

interface DeveloperLayoutProps {
  children: ReactNode;
}

const navSections = [
  {
    title: "Getting Started",
    items: [
      { href: "/developers", label: "Introduction", icon: Book },
      { href: "/developers/authentication", label: "Authentication", icon: Key },
    ]
  },
  {
    title: "API Reference",
    items: [
      { href: "/developers/api/invoices", label: "Invoices API", icon: FileText },
      { href: "/developers/api/vendors", label: "Vendors API", icon: Users },
      { href: "/developers/api/exports", label: "Exports API", icon: Package },
      { href: "/developers/api/erp-sync", label: "ERP Sync API", icon: RefreshCcw },
    ]
  },
  {
    title: "Webhooks",
    items: [
      { href: "/developers/webhooks", label: "Overview", icon: Webhook },
      { href: "/developers/events", label: "Events Catalog", icon: Zap },
    ]
  },
  {
    title: "Resources",
    items: [
      { href: "/developers/security", label: "Security", icon: Shield },
      { href: "/developers/sdks", label: "SDKs & Libraries", icon: Code2 },
    ]
  }
];

export const DeveloperLayout = ({ children }: DeveloperLayoutProps) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(navSections.map(s => s.title));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  const isActive = (href: string) => location.pathname === href;

  const Sidebar = () => (
    <nav className="space-y-6">
      {navSections.map((section) => (
        <div key={section.title}>
          <button
            onClick={() => toggleSection(section.title)}
            className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground transition-colors"
          >
            {section.title}
            {expandedSections.includes(section.title) ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
          {expandedSections.includes(section.title) && (
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <RouterNavLink
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-all duration-200",
                      isActive(item.href)
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </RouterNavLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <RouterNavLink to="/" className="flex items-center gap-2">
              <img src={clarusLogo} alt="Clarus AP" className="h-8" />
            </RouterNavLink>
            <span className="text-sm font-medium text-muted-foreground border-l border-border pl-4 hidden sm:block">
              Developer Documentation
            </span>
          </div>
          <div className="flex items-center gap-4">
            <RouterNavLink to="/auth">
              <Button variant="outline" size="sm">Sign In</Button>
            </RouterNavLink>
            <RouterNavLink to="/dashboard">
              <Button size="sm">Go to App</Button>
            </RouterNavLink>
          </div>
        </div>
      </header>

      <div className="container mx-auto flex">
        {/* Mobile Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed left-0 top-16 bottom-0 w-72 bg-card border-r border-border p-6 overflow-y-auto">
              <Sidebar />
            </div>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border">
          <div className="sticky top-16 p-6 h-[calc(100vh-4rem)] overflow-y-auto">
            <Sidebar />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-6 lg:p-10">
          <div className="max-w-4xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
