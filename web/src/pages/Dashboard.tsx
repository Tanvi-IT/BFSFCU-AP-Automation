import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Building2,
  Upload,
  Clock,
  Zap,
  AlertOctagon,
  Loader2
} from "lucide-react";
import { invoicesApi } from "@/services/invoices";
import { vendorsApi } from "@/services";

const Dashboard = () => {
  const { user, isSuperAdmin, tenantId } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    exceptions: 0,
    approved: 0,
    rejected: 0,
    pendingVendors: 0,
    autoRouted: 0,
    criticalExceptions: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      try {
        const [invoicesRes, vendorsRes] = await Promise.all([
          invoicesApi.list({ limit: 1000 }).then((r) => ({ data: r, error: null })),
          vendorsApi.list({ status: 'pending_verification' }).then((r) => ({ data: r, error: null })),
        ]);

        if (invoicesRes.error) throw invoicesRes.error;

        const invoices = invoicesRes.data || [];
        const pendingVendors = vendorsRes.data?.length || 0;

        setStats({
          total: invoices.length,
          exceptions: invoices.filter(i => i.status === 'exception').length,
          approved: invoices.filter(i => i.status === 'approved').length,
          rejected: invoices.filter(i => i.status === 'rejected').length,
          pendingVendors,
          autoRouted: invoices.filter(i => i.auto_routed === true).length,
          criticalExceptions: invoices.filter(i => i.is_critical === true).length,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back! Here's your invoice processing overview.
            </p>
          </div>
          <Button onClick={() => navigate("/poc/upload")} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Invoice
          </Button>
        </div>

        {statsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">All processed invoices</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Exceptions</CardTitle>
                  <AlertCircle className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">{stats.exceptions}</div>
                  <p className="text-xs text-muted-foreground">Require review</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Approved</CardTitle>
                  <CheckCircle className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">{stats.approved}</div>
                  <p className="text-xs text-muted-foreground">Ready for export</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rejected</CardTitle>
                  <XCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{stats.rejected}</div>
                  <p className="text-xs text-muted-foreground">Declined invoices</p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => navigate("/vendors/pending")}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Vendors</CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-500">{stats.pendingVendors}</div>
                  <p className="text-xs text-muted-foreground">Awaiting verification</p>
                </CardContent>
              </Card>
            </div>

            {/* Variation Engine Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Auto-Routed Invoices</CardTitle>
                  <Zap className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{stats.autoRouted}</div>
                  <p className="text-xs text-muted-foreground">
                    Clean invoices automatically submitted for approval
                  </p>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Critical Exceptions</CardTitle>
                  <AlertOctagon className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{stats.criticalExceptions}</div>
                  <p className="text-xs text-muted-foreground">
                    Require mandatory manual approval (bank change, duplicates, tax mismatch)
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and navigation</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => navigate("/invoices")}
                >
                  <FileText className="h-6 w-6" />
                  <span>View All Invoices</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => navigate("/exceptions")}
                >
                  <AlertCircle className="h-6 w-6" />
                  <span>Exception Queue</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => navigate("/vendors")}
                >
                  <Building2 className="h-6 w-6" />
                  <span>Manage Vendors</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2 relative"
                  onClick={() => navigate("/vendors/pending")}
                >
                  <Clock className="h-6 w-6" />
                  <span>Pending Vendors</span>
                  {stats.pendingVendors > 0 && (
                    <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {stats.pendingVendors}
                    </span>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Invoices</CardTitle>
                <CardDescription>Latest processed invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate("/invoices")} className="w-full">
                  View All Invoices
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Dashboard;
