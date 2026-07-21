import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoicesApi } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  Loader2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/pocConfig";

interface DashboardStats {
  highConfidence: number;
  lowConfidence: number;
  exceptions: number;
  declined: number;
  dailyApprovals: number;
  oldestHighConfidence: string | null;
  oldestLowConfidence: string | null;
  oldestException: string | null;
  topLowConfidenceReasons: { reason: string; count: number }[];
}

export default function POCDashboard() {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    highConfidence: 0,
    lowConfidence: 0,
    exceptions: 0,
    declined: 0,
    dailyApprovals: 0,
    oldestHighConfidence: null,
    oldestLowConfidence: null,
    oldestException: null,
    topLowConfidenceReasons: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [tenantId]);

  const fetchDashboardData = async () => {
    if (!tenantId) return;
    try {
      // Fetch all invoices for stats
      // All invoices, ordered oldest first (the dashboard computes queue ages).
      const rows = await invoicesApi.list({ limit: 1000 });
      const invoices = [...rows]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((r) => ({
          ...r,
          vendors: { status: (r as any).vendor_status ?? "active" },
        }));


      let highConf = 0;
      let lowConf = 0;
      let exceptions = 0;
      let declined = 0;
      let dailyApprovals = 0;
      let oldestHighConfidence: string | null = null;
      let oldestLowConfidence: string | null = null;
      let oldestException: string | null = null;
      const reasonCounts: Record<string, number> = {};

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      (invoices || []).forEach((inv: any) => {
        if (inv.status === "rejected") {
          declined++;
        } else if (inv.status === "exception") {
          exceptions++;
          if (!oldestException) oldestException = inv.created_at;
        } else if (inv.status === "approved") {
          // Count daily approvals
          if (inv.approved_at) {
            const approvedDate = new Date(inv.approved_at);
            approvedDate.setHours(0, 0, 0, 0);
            if (approvedDate.getTime() === today.getTime()) {
              dailyApprovals++;
            }
          }
        } else if (inv.status === "validated") {
          const confidenceScore = 1 - (inv.anomaly_score || 0);
          const vendorVerified = inv.vendors?.status === "active";
          const hasDuplicate = inv.duplicate_type !== null && inv.duplicate_type !== 'possible_duplicate';
          
          // High Confidence = confidence >= threshold AND vendor verified AND no duplicates
          // NOTE: Anomalies (variation_flags) do NOT disqualify from High Confidence
          const hasAchMismatch = inv.variation_flags?.some((f: string) =>
            ["ach_account_changed", "ach_routing_changed", "ach_new_account_captured"].includes(f)
          ) ?? false;
          const qualifiesForHighConfidence = confidenceScore >= HIGH_CONFIDENCE_THRESHOLD && vendorVerified && !hasDuplicate && !inv.tax_flagged && !hasAchMismatch;
          
          if (qualifiesForHighConfidence) {
            highConf++;
            if (!oldestHighConfidence) oldestHighConfidence = inv.created_at;
          } else {
            // Low Confidence = NOT high confidence (low score OR unverified vendor OR tax flagged)
            // Duplicates go to Exceptions, handled by status='exception'
            if (!hasDuplicate) {
              lowConf++;
              if (!oldestLowConfidence) oldestLowConfidence = inv.created_at;
              
              // Track reasons
              if (confidenceScore < HIGH_CONFIDENCE_THRESHOLD) {
                reasonCounts["Low confidence score"] = (reasonCounts["Low confidence score"] || 0) + 1;
              }
              if (!vendorVerified) {
                reasonCounts["Vendor not verified"] = (reasonCounts["Vendor not verified"] || 0) + 1;
              }
            }
          }
        }
      });

      // Get top 5 reasons
      const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      setStats({
        highConfidence: highConf,
        lowConfidence: lowConf,
        exceptions,
        declined,
        dailyApprovals,
        oldestHighConfidence,
        oldestLowConfidence,
        oldestException,
        topLowConfidenceReasons: topReasons,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAge = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const days = differenceInDays(new Date(), new Date(dateStr));
    if (days === 0) return "Today";
    if (days === 1) return "1 day old";
    return `${days} days old`;
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Invoice processing overview
          </p>
        </div>

        {/* Queue Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* High-Confidence - Light Green */}
          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors border-success/30 bg-success/5"
            onClick={() => navigate("/poc/high-confidence")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-bold">Batch Approval</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">High confidence</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.highConfidence}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Oldest: {formatAge(stats.oldestHighConfidence)}
              </p>
            </CardContent>
          </Card>

          {/* Low-Confidence - Light Red */}
          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors border-destructive/30 bg-destructive/5"
            onClick={() => navigate("/poc/low-confidence")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-bold">Requires Review</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Low confidence</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.lowConfidence}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Oldest: {formatAge(stats.oldestLowConfidence)}
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate("/poc/exceptions")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exceptions</CardTitle>
              <AlertOctagon className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.exceptions}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Oldest: {formatAge(stats.oldestException)}
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate("/poc/declined")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Declined</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.declined}</div>
              <p className="text-xs text-muted-foreground">Read-only archive</p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Stats */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Approvals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Daily Approvals
              </CardTitle>
              <CardDescription>Invoices approved today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-success">{stats.dailyApprovals}</div>
              <p className="text-sm text-muted-foreground mt-2">
                {format(new Date(), "EEEE, MMMM d, yyyy")}
              </p>
            </CardContent>
          </Card>

          {/* Top Low-Confidence Reasons */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Top Low-Confidence Reasons
              </CardTitle>
              <CardDescription>Why invoices need review</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topLowConfidenceReasons.length === 0 ? (
                <p className="text-muted-foreground text-sm">No low-confidence invoices</p>
              ) : (
                <div className="space-y-3">
                  {stats.topLowConfidenceReasons.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm">{item.reason}</span>
                      <span className="text-sm font-medium text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
