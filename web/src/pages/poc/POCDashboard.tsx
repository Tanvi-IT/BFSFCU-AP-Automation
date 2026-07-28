import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { getReasonLabels } from "@/lib/invoiceReasons";
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
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`;

      // Counts come from the exact GROUP BY status aggregate — the SAME status
      // column each queue page filters on — so the tiles always agree with the
      // queues. Oldest-age and today's approvals need row data, fetched with
      // small targeted queries (oldest-first, or filtered to today).
      const [counts, oldestHigh, lowRows, oldestExc, approvedToday] = await Promise.all([
        invoicesApi.stats(),
        invoicesApi.list({ status: QUEUE.highConfidence, order: "asc", limit: 1 }),
        invoicesApi.list({ status: QUEUE.lowConfidence, order: "asc", limit: 500 }),
        invoicesApi.list({ status: QUEUE.exceptions, order: "asc", limit: 1 }),
        invoicesApi.list({
          status: "approved" as any,
          dateField: "approved_at",
          dateFrom: todayStr,
          dateTo: todayStr,
          limit: 200,
        }),
      ]);

      // Top low-confidence reasons — the same labels the Low-Confidence queue
      // shows, so the two are consistent. Map vendor the way that queue does.
      const reasonCounts: Record<string, number> = {};
      lowRows.forEach((r) => {
        const inv = {
          ...r,
          vendor: r.vendor_name
            ? {
                id: r.vendor_id ?? "",
                name: r.vendor_name,
                status: r.vendor_id ? ((r as any).vendor_status ?? "active") : "unverified",
              }
            : null,
        };
        getReasonLabels(inv as any).forEach((reason) => {
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });
      });
      const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      setStats({
        highConfidence: counts[QUEUE.highConfidence] ?? 0,
        lowConfidence: counts[QUEUE.lowConfidence] ?? 0,
        exceptions: counts[QUEUE.exceptions] ?? 0,
        declined: counts[QUEUE.declined] ?? 0,
        dailyApprovals: approvedToday.length,
        oldestHighConfidence: oldestHigh[0]?.created_at ?? null,
        oldestLowConfidence: lowRows[0]?.created_at ?? null,
        oldestException: oldestExc[0]?.created_at ?? null,
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
            onClick={() => navigate("/high-confidence")}
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
            onClick={() => navigate("/low-confidence")}
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
            onClick={() => navigate("/exceptions")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-bold">Exceptions</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Needs investigation</p>
              </div>
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
            onClick={() => navigate("/declined")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-bold">Declined</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Rejected invoices</p>
              </div>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.declined}</div>
              <p className="text-xs text-muted-foreground mt-1">Read-only archive</p>
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
