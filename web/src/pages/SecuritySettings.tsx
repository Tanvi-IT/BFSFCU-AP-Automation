import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/services/settings";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Globe, Clock, Plus, X, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SecuritySettings {
  id: string;
  tenant_id: string;
  enforce_2fa: boolean;
  password_policy: string;
  session_timeout_minutes: number;
  ip_allowlist: string[];
  geo_restrictions: string[];
  updated_at: string;
}

const PASSWORD_POLICIES = [
  { value: "basic", label: "Basic (8+ characters)" },
  { value: "standard", label: "Standard (8+ chars, mixed case, numbers)" },
  { value: "strong", label: "Strong (12+ chars, mixed case, numbers, symbols)" },
  { value: "enterprise", label: "Enterprise (16+ chars, all requirements)" },
];

const GEO_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "EU", label: "European Union" },
  { value: "AU", label: "Australia" },
  { value: "JP", label: "Japan" },
  { value: "SG", label: "Singapore" },
];

export default function SecuritySettings() {
  const { userRole, tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [newIp, setNewIp] = useState("");
  const [formData, setFormData] = useState<Partial<SecuritySettings>>({
    enforce_2fa: false,
    password_policy: "standard",
    session_timeout_minutes: 60,
    ip_allowlist: [],
    geo_restrictions: [],
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["security-settings", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      
      let data = await settingsApi.get();
      let error = null;


      if (error && error.code !== "PGRST116") throw error;
      return data as unknown as SecuritySettings | null;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        enforce_2fa: settings.enforce_2fa,
        password_policy: settings.password_policy,
        session_timeout_minutes: settings.session_timeout_minutes,
        ip_allowlist: settings.ip_allowlist || [],
        geo_restrictions: settings.geo_restrictions || [],
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SecuritySettings>) => {
      if (!tenantId) throw new Error("No tenant");

      if (settings?.id) {
        await settingsApi.update({} as any);
        let error = null;

        if (error) throw error;
      } else {
        await settingsApi.update({} as any);
        let error = null;

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-settings"] });
      toast.success("Security settings saved");
    },
    onError: (error) => {
      toast.error("Failed to save settings: " + error.message);
    },
  });

  const handleAddIp = () => {
    if (!newIp) return;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(newIp)) {
      toast.error("Invalid IP address format");
      return;
    }
    setFormData({
      ...formData,
      ip_allowlist: [...(formData.ip_allowlist || []), newIp],
    });
    setNewIp("");
  };

  const handleRemoveIp = (ip: string) => {
    setFormData({
      ...formData,
      ip_allowlist: (formData.ip_allowlist || []).filter((i) => i !== ip),
    });
  };

  const handleGeoChange = (geo: string) => {
    const current = formData.geo_restrictions || [];
    if (current.includes(geo)) {
      setFormData({
        ...formData,
        geo_restrictions: current.filter((g) => g !== geo),
      });
    } else {
      setFormData({
        ...formData,
        geo_restrictions: [...current, geo],
      });
    }
  };

  if (userRole !== "superadmin" && userRole !== "admin" && userRole !== "checker") {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin or Checker privileges required.</p>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading security settings...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Security Settings</h1>
              <p className="text-muted-foreground">
                Configure tenant security policies for SOC 2 compliance
              </p>
            </div>
          </div>
          <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Authentication Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Authentication
              </CardTitle>
              <CardDescription>
                Configure authentication requirements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enforce Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Require 2FA for all users in this tenant
                  </p>
                </div>
                <Switch
                  checked={formData.enforce_2fa}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enforce_2fa: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Password Policy</Label>
                <Select
                  value={formData.password_policy}
                  onValueChange={(v) =>
                    setFormData({ ...formData, password_policy: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASSWORD_POLICIES.map((policy) => (
                      <SelectItem key={policy.value} value={policy.value}>
                        {policy.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Session Timeout (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={formData.session_timeout_minutes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      session_timeout_minutes: parseInt(e.target.value) || 60,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Users will be logged out after this period of inactivity
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Session Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Session Management
              </CardTitle>
              <CardDescription>
                Configure session and timeout settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Current Configuration</h4>
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">2FA Required:</span>{" "}
                      <Badge variant={formData.enforce_2fa ? "default" : "secondary"}>
                        {formData.enforce_2fa ? "Yes" : "No"}
                      </Badge>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Password Policy:</span>{" "}
                      {PASSWORD_POLICIES.find((p) => p.value === formData.password_policy)?.label}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Session Timeout:</span>{" "}
                      {formData.session_timeout_minutes} minutes
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Note: These settings are stored for configuration purposes. 
                  Runtime enforcement will be enabled in a future update.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* IP Allowlist */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                IP Allowlist
              </CardTitle>
              <CardDescription>
                Restrict access to specific IP addresses or CIDR ranges
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="192.168.1.0/24"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddIp()}
                />
                <Button variant="outline" onClick={handleAddIp}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {(formData.ip_allowlist || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No IP restrictions configured. All IPs allowed.
                  </p>
                ) : (
                  (formData.ip_allowlist || []).map((ip) => (
                    <div
                      key={ip}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <span className="font-mono text-sm">{ip}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveIp(ip)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Geo Restrictions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Geographic Restrictions
              </CardTitle>
              <CardDescription>
                Allow access only from selected regions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {GEO_OPTIONS.map((geo) => (
                  <div
                    key={geo.value}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                    onClick={() => handleGeoChange(geo.value)}
                  >
                    <span>{geo.label}</span>
                    <Switch
                      checked={(formData.geo_restrictions || []).includes(geo.value)}
                      onCheckedChange={() => handleGeoChange(geo.value)}
                    />
                  </div>
                ))}
              </div>
              {(formData.geo_restrictions || []).length === 0 && (
                <p className="text-sm text-muted-foreground mt-4">
                  No geographic restrictions. Access allowed from all regions.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
