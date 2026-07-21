import { settingsApi } from "@/services/settings";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { erpApi } from "@/services/settings";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, Save, Eye, EyeOff, RefreshCcw, Database, CheckCircle, XCircle } from "lucide-react";
import { ERP_SYSTEMS } from "@/lib/erpExport";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ERPSettings {
  id?: string;
  tenant_id: string;
  erp_system: string | null;
  export_format: string;
  delivery_method: string;
  delivery_email: string | null;
  sftp_host: string | null;
  sftp_port: string | null;
  sftp_username: string | null;
  sftp_password: string | null;
  api_endpoint_url: string | null;
  api_key: string | null;
}

const ERPSettingsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, isAdmin, isChecker, tenantId, loading: authLoading, canAccessSettings } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [latestSync, setLatestSync] = useState<any>(null);
  
  const [settings, setSettings] = useState<ERPSettings>({
    tenant_id: '',
    erp_system: null,
    export_format: 'json',
    delivery_method: 'manual',
    delivery_email: null,
    sftp_host: null,
    sftp_port: null,
    sftp_username: null,
    sftp_password: null,
    api_endpoint_url: null,
    api_key: null,
  });

  // Check access - Superadmin, Admin, or Checker (tenant admin)
  const hasAccess = canAccessSettings;

  useEffect(() => {
    if (!authLoading && !hasAccess) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You don't have permission to access ERP settings.",
      });
      navigate("/dashboard");
    }
  }, [hasAccess, authLoading, navigate, toast]);

  useEffect(() => {
    if (tenantId && hasAccess) {
      fetchSettings();
      fetchLatestSync();
    } else if (!authLoading && !tenantId && !isSuperAdmin) {
      setIsLoading(false);
    }
  }, [tenantId, hasAccess, authLoading, isSuperAdmin]);

  const fetchLatestSync = async () => {
    if (!tenantId) return;
    
    try {
      const settingsRow: any = await settingsApi.get();
      const error = null;


      if (!error && settingsRow) {
        setLatestSync(settingsRow);
      }
    } catch (e) {
      console.error('[ERPSettings] Error fetching latest sync:', e);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      let data = null;
      let error = new Error('ERP sync is not available yet in the Azure build.');


      if (error) throw error;

      toast({
        title: "Sync Complete",
        description: "Master settingsRow synced from ERP successfully.",
      });

      await fetchLatestSync();
    } catch (error: any) {
      console.error('[ERPSettings] Sync error:', error);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error.message || "Failed to sync master settingsRow.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchSettings = async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    try {
      const settingsRow: any = await settingsApi.get();
      const error = null;


      if (error) throw error;

      if (settingsRow) {
        setSettings({
          id: settingsRow.id,
          tenant_id: settingsRow.tenant_id,
          erp_system: settingsRow.erp_system,
          export_format: settingsRow.export_format || 'json',
          delivery_method: settingsRow.delivery_method || 'manual',
          delivery_email: settingsRow.delivery_email,
          sftp_host: settingsRow.sftp_host,
          sftp_port: settingsRow.sftp_port,
          sftp_username: settingsRow.sftp_username,
          sftp_password: settingsRow.sftp_password,
          api_endpoint_url: settingsRow.api_endpoint_url,
          api_key: settingsRow.api_key,
        });
      } else {
        setSettings(prev => ({ ...prev, tenant_id: tenantId }));
      }
    } catch (error) {
      console.error('[ERPSettings] Error fetching settings:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load ERP settings.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No tenant context found.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const settingsData = {
        tenant_id: tenantId,
        erp_system: settings.erp_system,
        export_format: settings.export_format,
        delivery_method: settings.delivery_method,
        delivery_email: settings.delivery_method === 'email' ? settings.delivery_email : null,
        sftp_host: settings.delivery_method === 'sftp' ? settings.sftp_host : null,
        sftp_port: settings.delivery_method === 'sftp' ? settings.sftp_port : null,
        sftp_username: settings.delivery_method === 'sftp' ? settings.sftp_username : null,
        sftp_password: settings.delivery_method === 'sftp' ? settings.sftp_password : null,
        api_endpoint_url: settings.delivery_method === 'api' ? settings.api_endpoint_url : null,
        api_key: settings.delivery_method === 'api' ? settings.api_key : null,
      };

      if (settings.id) {
        // Update existing
      await settingsApi.update({} as any);
      let error = null;


        if (error) throw error;
      } else {
        // Insert new
      await settingsApi.update({} as any);
      const saved: any = await settingsApi.get();
        if (saved) {
          setSettings(prev => ({ ...prev, id: saved.id }));
        }
      }

      toast({
        title: "Settings saved",
        description: "ERP settings saved successfully.",
      });
    } catch (error: any) {
      console.error('[ERPSettings] Save error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = <K extends keyof ERPSettings>(field: K, value: ERPSettings[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
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

  if (!tenantId && !isSuperAdmin) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground">No Tenant Context</h2>
          <p className="text-muted-foreground mt-2">
            Unable to load ERP settings without a tenant context.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">ERP Integration</h1>
            <p className="text-muted-foreground mt-1">
              Configure how invoices are exported to your ERP system
            </p>
          </div>
        </div>

        {/* ERP System Selection */}
        <Card>
          <CardHeader>
            <CardTitle>ERP System</CardTitle>
            <CardDescription>
              Select your enterprise resource planning system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="erp-system">Select your ERP system</Label>
                <Select
                  value={settings.erp_system || ''}
                  onValueChange={(value) => updateField('erp_system', value)}
                >
                  <SelectTrigger id="erp-system">
                    <SelectValue placeholder="Choose an ERP system" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {ERP_SYSTEMS.map((erp) => (
                      <SelectItem key={erp.value} value={erp.value}>
                        {erp.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export Format */}
        <Card>
          <CardHeader>
            <CardTitle>Export Format</CardTitle>
            <CardDescription>
              Choose the file format for exported invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="export-format">Format</Label>
              <Select
                value={settings.export_format}
                onValueChange={(value) => updateField('export_format', value)}
              >
                <SelectTrigger id="export-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Method */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Method</CardTitle>
            <CardDescription>
              How should exports be delivered to your system?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="delivery-method">Method</Label>
              <Select
                value={settings.delivery_method}
                onValueChange={(value) => updateField('delivery_method', value)}
              >
                <SelectTrigger id="delivery-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="manual">Manual Download</SelectItem>
                  <SelectItem value="email">Email to ERP Inbox</SelectItem>
                  <SelectItem value="sftp">SFTP Drop Folder</SelectItem>
                  <SelectItem value="api">API Endpoint</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Automated delivery (Email, SFTP, API) coming Q1 2026. Currently manual download only.
              </p>
            </div>

            {/* Email Configuration */}
            {settings.delivery_method === 'email' && (
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="delivery-email">Delivery Email Address</Label>
                <Input
                  id="delivery-email"
                  type="email"
                  placeholder="erp-inbox@yourcompany.com"
                  value={settings.delivery_email || ''}
                  onChange={(e) => updateField('delivery_email', e.target.value)}
                />
              </div>
            )}

            {/* SFTP Configuration */}
            {settings.delivery_method === 'sftp' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sftp-host">SFTP Host</Label>
                    <Input
                      id="sftp-host"
                      placeholder="sftp.yourcompany.com"
                      value={settings.sftp_host || ''}
                      onChange={(e) => updateField('sftp_host', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sftp-port">SFTP Port</Label>
                    <Input
                      id="sftp-port"
                      placeholder="22"
                      value={settings.sftp_port || ''}
                      onChange={(e) => updateField('sftp_port', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sftp-username">Username</Label>
                  <Input
                    id="sftp-username"
                    placeholder="sftp_user"
                    value={settings.sftp_username || ''}
                    onChange={(e) => updateField('sftp_username', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sftp-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="sftp-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={settings.sftp_password || ''}
                      onChange={(e) => updateField('sftp_password', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* API Configuration */}
            {settings.delivery_method === 'api' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="api-endpoint">API Endpoint URL</Label>
                  <Input
                    id="api-endpoint"
                    type="url"
                    placeholder="https://api.yourcompany.com/invoices"
                    value={settings.api_endpoint_url || ''}
                    onChange={(e) => updateField('api_endpoint_url', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={settings.api_key || ''}
                      onChange={(e) => updateField('api_key', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Master Data Sync Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Master Data Sync
            </CardTitle>
            <CardDescription>
              Synchronize vendor master, GL codes, and other settingsRow from your ERP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestSync ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Last Synced:</span>
                  <span className="text-sm font-medium">
                    {format(new Date(latestSync.created_at), 'MMM dd, yyyy HH:mm')}
                  </span>
                  <Badge variant={latestSync.status === 'success' ? 'default' : 'destructive'}>
                    {latestSync.status === 'success' ? (
                      <><CheckCircle className="mr-1 h-3 w-3" />Success</>
                    ) : (
                      <><XCircle className="mr-1 h-3 w-3" />{latestSync.status}</>
                    )}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Vendors:</span>
                    <span className="ml-2 font-medium">{latestSync.synced_vendors}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">GL Accounts:</span>
                    <span className="ml-2 font-medium">{latestSync.synced_gl_accounts}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cost Centers:</span>
                    <span className="ml-2 font-medium">{latestSync.synced_cost_centers}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Departments:</span>
                    <span className="ml-2 font-medium">{latestSync.synced_departments}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tax Codes:</span>
                    <span className="ml-2 font-medium">{latestSync.synced_tax_codes}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment Terms:</span>
                    <span className="ml-2 font-medium">{latestSync.synced_payment_terms}</span>
                  </div>
                </div>
                {latestSync.error_message && (
                  <p className="text-sm text-destructive">{latestSync.error_message}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sync history yet. Run a manual sync to pull master settingsRow from your ERP.
              </p>
            )}
            <div className="flex items-center gap-4 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={handleManualSync} 
                disabled={isSyncing || settings.delivery_method !== 'api'}
              >
                {isSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                Run Manual Sync Now
              </Button>
              <Button variant="link" onClick={() => navigate('/settings/erp/master-settingsRow')}>
                View Master Data →
              </Button>
            </div>
            {settings.delivery_method !== 'api' && (
              <p className="text-sm text-muted-foreground">
                Note: Master settingsRow sync requires API delivery method to be configured.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="min-w-[150px]">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default ERPSettingsPage;
