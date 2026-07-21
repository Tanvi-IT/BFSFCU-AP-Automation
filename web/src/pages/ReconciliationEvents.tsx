import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { erpApi } from "@/services/settings";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCcw, Eye, CheckCircle, XCircle, Clock, Send, FileCheck, DollarSign, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface ReconciliationEvent {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
  erp_system: string;
  event_type: string;
  erp_reference_id: string | null;
  payload: any;
  status: string;
  error_message: string | null;
  created_at: string;
  invoice?: {
    invoice_number: string;
  };
}

const ReconciliationEvents = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, isAdmin, isChecker, tenantId, loading: authLoading } = useAuth();

  const [events, setEvents] = useState<ReconciliationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPayload, setSelectedPayload] = useState<any>(null);
  const [payloadDialogOpen, setPayloadDialogOpen] = useState(false);

  const hasAccess = isSuperAdmin || isAdmin || isChecker;

  useEffect(() => {
    if (!authLoading && !hasAccess) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You don't have permission to view reconciliation events.",
      });
      navigate("/dashboard");
    }
  }, [hasAccess, authLoading, navigate, toast]);

  useEffect(() => {
    if (hasAccess && !authLoading) {
      fetchEvents();
    }
  }, [hasAccess, authLoading, tenantId]);

  const fetchEvents = async () => {
    try {
      let query: any = null;


      if (!isSuperAdmin && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setEvents((data || []) as ReconciliationEvent[]);
    } catch (error) {
      console.error('[ReconciliationEvents] Error fetching events:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load reconciliation events.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    switch (eventType) {
      case 'delivered':
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600">
            <Send className="mr-1 h-3 w-3" />
            Delivered
          </Badge>
        );
      case 'accepted':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="mr-1 h-3 w-3" />
            Accepted
          </Badge>
        );
      case 'posted':
        return (
          <Badge className="bg-emerald-500 hover:bg-emerald-600">
            <FileCheck className="mr-1 h-3 w-3" />
            Posted
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      case 'paid':
        return (
          <Badge className="bg-purple-500 hover:bg-purple-600">
            <DollarSign className="mr-1 h-3 w-3" />
            Paid
          </Badge>
        );
      default:
        return <Badge variant="outline">{eventType}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="mr-1 h-3 w-3" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleViewPayload = (payload: any) => {
    setSelectedPayload(payload);
    setPayloadDialogOpen(true);
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <RefreshCcw className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">ERP Sync History</h1>
              <p className="text-muted-foreground mt-1">
                View reconciliation events from ERP systems
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchEvents}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Events</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <RefreshCcw className="mx-auto h-12 w-12 opacity-30 mb-4" />
                <p>No reconciliation events found</p>
                <p className="text-sm mt-1">Events will appear here when ERPs send callbacks</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>ERP System</TableHead>
                    <TableHead>ERP Reference</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(event.created_at), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {event.invoice?.invoice_number ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() => navigate(`/invoices/${event.invoice_id}`)}
                          >
                            {event.invoice.invoice_number}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{event.erp_system}</TableCell>
                      <TableCell>
                        {event.erp_reference_id || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{getEventTypeBadge(event.event_type)}</TableCell>
                      <TableCell>
                        {getStatusBadge(event.status)}
                        {event.error_message && (
                          <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={event.error_message}>
                            {event.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.payload && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewPayload(event.payload)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Payload
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-start gap-3 text-muted-foreground">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">About ERP Reconciliation</p>
                <p className="mt-1">
                  Reconciliation events are recorded when your ERP system sends callbacks via API webhook
                  or when files are processed from SFTP. Events update invoice statuses automatically.
                </p>
                <p className="mt-2">
                  <strong>Event Types:</strong> delivered → accepted → posted → paid (or rejected)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payload Dialog */}
      <Dialog open={payloadDialogOpen} onOpenChange={setPayloadDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Event Payload</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
            {JSON.stringify(selectedPayload, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ReconciliationEvents;
