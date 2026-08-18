import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { settingsApi, type PrologueSettings as Settings, type PrologueUpdate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, PlugZap, CheckCircle2, XCircle, Save } from "lucide-react";

/**
 * Admin page to configure the Fiserv Prologue (SQL Server) write-back connection
 * — moved out of env vars so it can be set, tested, and enabled/disabled from the
 * UI. The password is write-only: it's never returned by the API (only whether
 * one is set), and it's stored encrypted at rest.
 */
export default function PrologueSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("1433");
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [encrypt, setEncrypt] = useState(true);
  const [trustServerCertificate, setTrustServerCertificate] = useState(false);

  const applySettings = (c: Settings) => {
    setEnabled(c.enabled);
    setHost(c.host ?? "");
    setPort(String(c.port ?? 1433));
    setDatabase(c.database ?? "");
    setUser(c.user ?? "");
    setEncrypt(c.encrypt);
    setTrustServerCertificate(c.trustServerCertificate);
    setPasswordSet(c.passwordSet);
    setPassword("");
  };

  useEffect(() => {
    settingsApi
      .getPrologue()
      .then(applySettings)
      .catch(() => {
        /* leave defaults; admin can still configure */
      })
      .finally(() => setLoading(false));
  }, []);

  /** The form values as a payload; `password` included only when the admin typed one. */
  const payload = (): PrologueUpdate => ({
    enabled,
    host: host.trim() || null,
    port: Number(port) || 1433,
    database: database.trim() || null,
    user: user.trim() || null,
    encrypt,
    trustServerCertificate,
    ...(password ? { password } : {}),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await settingsApi.testPrologue(payload());
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error)?.message ?? "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (enabled && (!host.trim() || !database.trim() || !user.trim())) {
      toast({
        variant: "destructive",
        title: "Missing values",
        description: "Host, Database, and User are required to enable Prologue.",
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await settingsApi.putPrologue(payload());
      applySettings(saved);
      toast({
        title: "Prologue settings saved",
        description: saved.enabled
          ? "Prologue write-back on approval is enabled."
          : "Prologue write-back is disabled.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: (err as Error)?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <Database className="h-8 w-8 text-primary" />
            Prologue (Fiserv) Integration
          </h1>
          <p className="text-muted-foreground mt-1">
            SQL Server connection used to stage an unposted AP transaction in Fiserv
            Prologue when an invoice is approved. Off unless enabled and connected.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Connection</CardTitle>
                <CardDescription>
                  The app login needs EXECUTE on the two Prologue stored procedures. The
                  password is stored encrypted and never shown again.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/40">
                  <Switch checked={enabled} onCheckedChange={setEnabled} id="pg-enabled" />
                  <Label htmlFor="pg-enabled" className="cursor-pointer">
                    Enable Prologue write-back on approval
                  </Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pg-host">Host</Label>
                    <Input
                      id="pg-host"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="prologue-sql.bankfund.internal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-port">Port</Label>
                    <Input
                      id="pg-port"
                      value={port}
                      onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
                      inputMode="numeric"
                      placeholder="1433"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pg-db">Database</Label>
                    <Input
                      id="pg-db"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder="Prologue"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional to test; required to save &amp; enable.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-user">User</Label>
                    <Input
                      id="pg-user"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="ap_service"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pg-pass">Password</Label>
                  <Input
                    id="pg-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      passwordSet ? "•••••••• (leave blank to keep current)" : "SQL Server password"
                    }
                    autoComplete="new-password"
                  />
                  {passwordSet && (
                    <p className="text-xs text-muted-foreground">
                      A password is stored (encrypted). Enter a new one only to change it.
                    </p>
                  )}
                </div>

                <div className="space-y-4 rounded-lg border p-3 bg-muted/40">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="pg-encrypt" className="cursor-pointer">
                        Encrypt connection (TLS)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        On by default. Turn off only if the SQL Server has no TLS configured.
                      </p>
                    </div>
                    <Switch
                      id="pg-encrypt"
                      checked={encrypt}
                      onCheckedChange={setEncrypt}
                      className="mt-0.5 shrink-0"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="pg-trust" className="cursor-pointer">
                        Trust server certificate
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Accept a self-signed certificate. Keep on for an on-prem SQL Server
                        reached over a private network.
                      </p>
                    </div>
                    <Switch
                      id="pg-trust"
                      checked={trustServerCertificate}
                      onCheckedChange={setTrustServerCertificate}
                      className="mt-0.5 shrink-0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  testResult.ok
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-red-50 border-red-300 text-red-800"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0" />
                )}
                <span className="break-words">{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => void test()} disabled={testing || saving}>
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4 mr-2" />
                )}
                Test Connection
              </Button>
              <Button onClick={() => void save()} disabled={saving || testing}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
