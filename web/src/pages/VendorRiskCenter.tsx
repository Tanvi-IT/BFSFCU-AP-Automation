import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { vendorsApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { VendorRiskBadge } from "@/components/VendorRiskBadge";
import {
  Loader2,
  Users,
  AlertTriangle,
  ShieldAlert,
  CreditCard,
  FileWarning,
  TrendingUp,
  Search,
  ExternalLink,
  Clock,
  AlertCircle,
  Ban,
  Activity,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface VendorWithRisk {
  id: string;
  name: string;
  status: string;
  vendor_risk_score: number | null;
  fraud_probability: number | null;
  contract_risk_score: number | null;
  bank_account: string | null;
  created_at: string;
  updated_at: string;
}

interface RiskEvent {
  id: string;
  vendor_id: string;
  event_type: string;
  severity: string;
  message: string;
  created_at: string;
  vendors?: { name: string };
}

interface ContractExpiry {
  vendor_id: string;
  vendor_name: string;
  expiry_date: string | null;
}

export default function VendorRiskCenter() {
  const { isSuperAdmin, isAdmin } = useAuth();
  
  const [vendors, setVendors] = useState<VendorWithRisk[]>([]);
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  // KPI stats
  const [stats, setStats] = useState({
    totalVendors: 0,
    highRiskVendors: 0,
    bankChangeAlerts: 0,
    contractExpiryAlerts: 0,
    fraudTrendChange: 0,
  });

  useEffect(() => {
    fetchVendorData();
  }, []);

  const fetchVendorData = async () => {
    try {
      // Fetch vendors with risk data
      const vendorData = (await vendorsApi.list()).sort(
        (a, b) => Number(b.vendor_risk_score ?? 0) - Number(a.vendor_risk_score ?? 0)
      );
      setVendors((vendorData || []) as any);

      // Calculate stats
      const total = vendorData?.length || 0;
      const highRisk = vendorData?.filter(v => (v.vendor_risk_score ?? 0) >= 70).length || 0;
      
      // Fetch risk events
      // vendor_risk_events is part of the fraud/risk subsystem, not yet ported.
      const eventsData: any[] = [];
      setRiskEvents(eventsData || []);

      // Count bank change alerts
      const bankChangeAlerts = eventsData?.filter(e => e.event_type === 'bank_change').length || 0;
      
      // Count contract expiry alerts
      const contractAlerts = eventsData?.filter(e => e.event_type === 'contract_expiry').length || 0;

      setStats({
        totalVendors: total,
        highRiskVendors: highRisk,
        bankChangeAlerts,
        contractExpiryAlerts: contractAlerts,
        fraudTrendChange: 12, // Placeholder - would calculate from historical data
      });
    } catch (error) {
      console.error("Error fetching vendor risk data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredVendors = vendors.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase());
    const score = v.vendor_risk_score ?? 0;
    
    if (riskFilter === "high") return matchesSearch && score >= 70;
    if (riskFilter === "medium") return matchesSearch && score >= 40 && score < 70;
    if (riskFilter === "low") return matchesSearch && score < 40;
    return matchesSearch;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-destructive/80 text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      case "low": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "bank_change": return <CreditCard className="h-4 w-4" />;
      case "fraud_detected": return <ShieldAlert className="h-4 w-4" />;
      case "duplicate_invoice": return <FileWarning className="h-4 w-4" />;
      case "contract_expiry": return <Clock className="h-4 w-4" />;
      case "amount_deviation": return <TrendingUp className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Vendor Risk & Fraud Center</h1>
          <p className="text-muted-foreground mt-1">
            Monitor vendor risk patterns, fraud indicators, and contract compliance
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Vendors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalVendors}</p>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                High-Risk Vendors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">{stats.highRiskVendors}</p>
            </CardContent>
          </Card>

          <Card className="border-warning/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-warning" />
                Bank Change Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-warning">{stats.bankChangeAlerts}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileWarning className="h-4 w-4" />
                Contract Expiry Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.contractExpiryAlerts}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Fraud Trend (30d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${stats.fraudTrendChange > 0 ? "text-destructive" : "text-success"}`}>
                {stats.fraudTrendChange > 0 ? "+" : ""}{stats.fraudTrendChange}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vendor Risk Table - 2/3 width */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Vendor Risk Overview</CardTitle>
                <CardDescription>All vendors sorted by risk score</CardDescription>
                <div className="flex gap-4 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search vendors..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Risk Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risks</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                      <SelectItem value="medium">Medium Risk</SelectItem>
                      <SelectItem value="low">Low Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Risk Score</TableHead>
                        <TableHead>Fraud Prob.</TableHead>
                        <TableHead>Contract Risk</TableHead>
                        <TableHead>Bank Change</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.map((vendor) => (
                        <TableRow key={vendor.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{vendor.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Updated {formatDistanceToNow(new Date(vendor.updated_at), { addSuffix: true })}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <VendorRiskBadge riskScore={vendor.vendor_risk_score} showLabel={false} />
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${
                              (vendor.fraud_probability ?? 0) > 0.25 ? "text-destructive" : 
                              (vendor.fraud_probability ?? 0) > 0.1 ? "text-warning" : "text-muted-foreground"
                            }`}>
                              {((vendor.fraud_probability ?? 0) * 100).toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              (vendor.contract_risk_score ?? 0) >= 70 ? "destructive" :
                              (vendor.contract_risk_score ?? 0) >= 40 ? "secondary" : "outline"
                            }>
                              {vendor.contract_risk_score ?? 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {vendor.bank_account ? (
                              <Badge variant="outline" className="text-xs">
                                ****{vendor.bank_account.slice(-4)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/vendors/${vendor.id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredVendors.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No vendors found matching your criteria.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Fraud Insight Feed - 1/3 width */}
          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Risk Event Feed
                </CardTitle>
                <CardDescription>Real-time fraud and risk alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {riskEvents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No risk events detected.</p>
                        <p className="text-sm mt-1">Events will appear here when detected.</p>
                      </div>
                    ) : (
                      riskEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full ${getSeverityColor(event.severity)}`}>
                              {getEventIcon(event.event_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {event.vendors?.name || "Unknown Vendor"}
                              </p>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {event.message}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge className={getSeverityColor(event.severity)}>
                                  {event.severity}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}