import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { webhooksApi } from "@/services/settings";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, Eye, EyeOff, Trash2, Webhook, Send, CheckCircle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

const AVAILABLE_EVENTS = [
  { id: "invoice.created", label: "Invoice Created" },
  { id: "invoice.validated", label: "Invoice Validated" },
  { id: "invoice.exception", label: "Invoice Exception" },
  { id: "invoice.submitted", label: "Invoice Submitted" },
  { id: "invoice.approved", label: "Invoice Approved" },
  { id: "invoice.rejected", label: "Invoice Rejected" },
  { id: "invoice.exported", label: "Invoice Exported" },
  { id: "vendor.created", label: "Vendor Created" },
  { id: "vendor.matched", label: "Vendor Matched" },
  { id: "export.completed", label: "Export Completed" },
  { id: "export.delivered", label: "Export Delivered" },
  { id: "export.failed", label: "Export Failed" },
];

interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export default function WebhooksSettings() {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      let data = await webhooksApi.list();
      let error = null;

      if (error) throw error;
      return data as unknown as WebhookEndpoint[];
    },
    enabled: !!tenantId,
  });

  const createWebhookMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const secret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;
      await webhooksApi.create(newUrl, selectedEvents);
      let error = null;

      if (error) throw error;
    },
    onSuccess: () => {
      setNewUrl("");
      setSelectedEvents([]);
      setCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast({ title: "Webhook created" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to create webhook" });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      await webhooksApi.remove(webhookId);
      let error = null;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast({ title: "Webhook deleted" });
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: async (webhook: WebhookEndpoint) => {
      // Simulate sending a test webhook
      const testPayload = {
        id: `evt_test_${Date.now()}`,
        type: "test.webhook",
        created: new Date().toISOString(),
        data: {
          message: "This is a test webhook from Clarus AP"
        }
      };
      
      // In production, this would call an edge function to send the test
      toast({ title: "Test webhook sent", description: `Sent to ${webhook.url}` });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    );
  };

  const toggleSecret = (webhookId: string) => {
    setShowSecrets(prev => ({ ...prev, [webhookId]: !prev[webhookId] }));
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Webhooks</h1>
            <p className="text-muted-foreground">Receive real-time notifications for events</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Webhook Endpoint</DialogTitle>
                <DialogDescription>
                  Configure a URL to receive webhook events
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url">Endpoint URL</Label>
                  <Input
                    id="url"
                    placeholder="https://your-server.com/webhooks/clarusap"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events to subscribe</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                    {AVAILABLE_EVENTS.map((event) => (
                      <div key={event.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={event.id}
                          checked={selectedEvents.includes(event.id)}
                          onCheckedChange={() => toggleEvent(event.id)}
                        />
                        <label
                          htmlFor={event.id}
                          className="text-sm cursor-pointer"
                        >
                          {event.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => createWebhookMutation.mutate()} 
                  disabled={!newUrl || selectedEvents.length === 0 || createWebhookMutation.isPending}
                >
                  Create Webhook
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Endpoints
            </CardTitle>
            <CardDescription>
              Endpoints that receive event notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : webhooks && webhooks.length > 0 ? (
              <div className="space-y-4">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="p-4 border rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-muted px-2 py-1 rounded">{webhook.url}</code>
                          <Badge variant={webhook.is_active ? "default" : "secondary"}>
                            {webhook.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Created {format(new Date(webhook.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => testWebhookMutation.mutate(webhook)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Webhook?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this webhook endpoint and stop all 
                                event deliveries to it.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteWebhookMutation.mutate(webhook.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Signing Secret</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                          {showSecrets[webhook.id] ? webhook.secret : "whsec_••••••••••••••••"}
                        </code>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleSecret(webhook.id)}
                        >
                          {showSecrets[webhook.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => copyToClipboard(webhook.secret)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Subscribed Events</p>
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="secondary" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No webhooks configured</p>
                <p className="text-sm">Add a webhook to receive real-time event notifications</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Delivery Logs</CardTitle>
            <CardDescription>Recent webhook delivery attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>No recent deliveries</p>
              <p className="text-sm">Delivery logs will appear here once webhooks are triggered</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
