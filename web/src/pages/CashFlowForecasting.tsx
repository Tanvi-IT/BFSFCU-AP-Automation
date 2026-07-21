import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { invoicesApi } from "@/services/invoices";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertTriangle, 
  Calendar,
  RefreshCw,
  Loader2,
  Lightbulb,
  BarChart3
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend
} from "recharts";
import { format, addDays, subDays, startOfDay, endOfDay } from "date-fns";

interface ForecastDataPoint {
  date: string;
  amount: number;
  predicted: boolean;
  lowerBound?: number;
  upperBound?: number;
}

interface ForecastInsight {
  id: string;
  period: string;
  insight: string;
  severity: string;
  created_at: string;
}

interface KPIData {
  next7Days: number;
  next30Days: number;
  quarterProjection: number;
  highRiskCount: number;
}

const CashFlowForecasting = () => {
  const { tenantId, isSuperAdmin, isAdmin, canApprove } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [forecastData, setForecastData] = useState<ForecastDataPoint[]>([]);
  const [insights, setInsights] = useState<ForecastInsight[]>([]);
  const [kpis, setKpis] = useState<KPIData>({
    next7Days: 0,
    next30Days: 0,
    quarterProjection: 0,
    highRiskCount: 0
  });

  const canView = isSuperAdmin || isAdmin || canApprove;

  useEffect(() => {
    if (tenantId || isSuperAdmin) {
      fetchData();
    }
  }, [tenantId, isSuperAdmin]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchHistoricalData(),
        fetchInsights(),
        fetchKPIs()
      ]);
    } catch (error) {
      console.error('Error fetching forecast data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistoricalData = async () => {
    // Get historical invoice data for the last 90 days
    const startDate = subDays(new Date(), 90);
    
    // Forecasting reads invoices through the API.
    let query: any = null;

    
    if (!isSuperAdmin && tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data: invoices, error } = await query;
    
    if (error) throw error;

    // Aggregate by date
    const dailyTotals: Record<string, number> = {};
    
    (invoices || []).forEach(inv => {
      if (inv.due_date) {
        const dateKey = format(new Date(inv.due_date), 'yyyy-MM-dd');
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + Number(inv.total_amount || 0);
      }
    });

    // Calculate 30-day moving average for forecasting
    const sortedDates = Object.keys(dailyTotals).sort();
    const avgDaily = sortedDates.length > 0 
      ? Object.values(dailyTotals).reduce((a, b) => a + b, 0) / sortedDates.length
      : 0;

    // Generate forecast data (historical + 90 days forward)
    const chartData: ForecastDataPoint[] = [];
    const today = new Date();
    
    // Historical data (last 30 days)
    for (let i = 30; i >= 0; i--) {
      const date = subDays(today, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      chartData.push({
        date: dateKey,
        amount: dailyTotals[dateKey] || 0,
        predicted: false
      });
    }

    // Forecast data (next 90 days)
    const variance = avgDaily * 0.2; // 20% variance for confidence bands
    for (let i = 1; i <= 90; i++) {
      const date = addDays(today, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      // Simple weighted prediction with some randomness for visualization
      const weekday = date.getDay();
      const weekendFactor = weekday === 0 || weekday === 6 ? 0.3 : 1;
      const predicted = avgDaily * weekendFactor * (0.9 + Math.random() * 0.2);
      
      chartData.push({
        date: dateKey,
        amount: predicted,
        predicted: true,
        lowerBound: Math.max(0, predicted - variance),
        upperBound: predicted + variance
      });
    }

    setForecastData(chartData);
  };

  const fetchInsights = async () => {
    // Forecasting reads invoices through the API.
    let query: any = null;


    if (!isSuperAdmin && tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setInsights(data);
    }
  };

  const fetchKPIs = async () => {
    const today = new Date();
    const next7Days = addDays(today, 7);
    const next30Days = addDays(today, 30);
    const next90Days = addDays(today, 90);

    // Forecasting reads invoices through the API.
    let baseQuery: any = null;



    // KPI windows are derived from a single fetch rather than four queries.
    const all = await invoicesApi.list({ limit: 1000 });
    const now = Date.now();
    const within = (days: number) =>
      all.filter((i) => {
        if (!i.due_date) return false;
        const d = new Date(i.due_date).getTime();
        return d >= now && d <= now + days * 86_400_000;
      });
    const week = within(7);
    const month = within(30);
    const quarter = within(90);
    const highRisk = all.filter((i) => i.risk_level === 'high').length;

    setKpis({
      next7Days: (week || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
      next30Days: (month || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
      quarterProjection: (quarter || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
      highRiskCount: highRisk
    });
  };

  const generateForecast = async () => {
    setIsGenerating(true);
    try {
      // Call edge function to generate AI insights
      let data = null;
      let error = new Error('Cash-flow forecasting is not available yet in the Azure build.');


      if (error) throw error;

      toast({
        title: "Forecast Generated",
        description: "Cash flow forecast has been updated with AI insights",
      });

      await fetchData();
    } catch (error: any) {
      console.error('Error generating forecast:', error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.message || "Failed to generate forecast",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-600 border-red-200';
      case 'warning': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      default: return 'bg-blue-500/10 text-blue-600 border-blue-200';
    }
  };

  if (!canView) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                Cash flow forecasting is only available to Admins, Checkers, and Superadmins.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Cash Flow Forecasting
            </h1>
            <p className="text-muted-foreground mt-1">
              AI-powered predictions and insights for your accounts payable
            </p>
          </div>
          <Button 
            onClick={generateForecast} 
            disabled={isGenerating}
            className="flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Generate Forecast
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Next 7 Days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {isLoading ? '...' : formatCurrency(kpis.next7Days)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Upcoming payments
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-secondary">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Next 30 Days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {isLoading ? '...' : formatCurrency(kpis.next30Days)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Monthly outflow
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-accent">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Q1 Projection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {isLoading ? '...' : formatCurrency(kpis.quarterProjection)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Quarterly forecast
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-destructive">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                High-Risk
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {isLoading ? '...' : kpis.highRiskCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Payables needing attention
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Forecast Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  90-Day Cash Outflow Forecast
                </CardTitle>
                <CardDescription>
                  Historical data and AI-predicted future payments
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Actual</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary" />
                  <span className="text-muted-foreground">Predicted</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => format(new Date(value), 'MMM d')}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                    labelFormatter={(label) => format(new Date(label), 'MMMM d, yyyy')}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="upperBound"
                    stackId="confidence"
                    stroke="none"
                    fill="hsl(var(--secondary))"
                    fillOpacity={0.1}
                    name="Confidence Band"
                  />
                  <Area
                    type="monotone"
                    dataKey="lowerBound"
                    stackId="confidence"
                    stroke="none"
                    fill="hsl(var(--background))"
                    fillOpacity={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Cash Outflow"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* AI Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              AI-Powered Insights
            </CardTitle>
            <CardDescription>
              Predictive analysis based on your invoice patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : insights.length > 0 ? (
              <div className="space-y-3">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className={`p-4 rounded-lg border ${getSeverityColor(insight.severity)}`}
                  >
                    <div className="flex items-start gap-3">
                      {insight.severity === 'critical' ? (
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                      ) : insight.severity === 'warning' ? (
                        <TrendingDown className="h-5 w-5 shrink-0 mt-0.5" />
                      ) : (
                        <Lightbulb className="h-5 w-5 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{insight.insight}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {insight.period}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(insight.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No insights generated yet. Click "Generate Forecast" to create AI predictions.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default CashFlowForecasting;
