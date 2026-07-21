import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { settingsApi } from "@/services/settings";
type Json = unknown;
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Eye, EyeOff, Loader2, Shield, AlertTriangle, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type AIProvider = "gemini" | "azure_openai";

interface AIConfig {
  provider: AIProvider;
  azure_endpoint: string;
  azure_api_key: string;
  azure_deployment_name: string;
  azure_api_version: string;
  azure_doc_intel_endpoint: string;
  azure_doc_intel_key: string;
}

export default function AIProviderSettings() {
  const { tenantId, isAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDocIntelKey, setShowDocIntelKey] = useState(false);
  const [config, setConfig] = useState<AIConfig>({
    provider: "gemini",
    azure_endpoint: "",
    azure_api_key: "",
    azure_deployment_name: "",
    azure_api_version: "2024-02-15-preview",
    azure_doc_intel_endpoint: "",
    azure_doc_intel_key: "",
  });

  const canAccess = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (tenantId && canAccess) {
      fetchConfig();
    } else {
      setIsLoading(false);
    }
  }, [tenantId, canAccess]);

  const fetchConfig = async () => {
    try {
      let data: any = await settingsApi.get();

      if (data) {
        setConfig({
          provider: data.provider as AIProvider,
          azure_endpoint: data.azure_endpoint || "",
          azure_api_key: data.azure_api_key_encrypted ? "••••••••••••••••" : "",
          azure_deployment_name: data.azure_deployment_name || "",
          azure_api_version: data.azure_api_version || "2024-02-15-preview",
          azure_doc_intel_endpoint: data.azure_doc_intel_endpoint || "",
          azure_doc_intel_key: data.azure_doc_intel_key_encrypted ? "••••••••••••••••" : "",
        });
      }
    } catch (error) {
      console.error("Error fetching AI config:", error);
      toast({
        title: "Error",
        description: "Failed to load AI configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;

    // Validation: Azure OpenAI requires Document Intelligence
    if (config.provider === "azure_openai") {
      if (!config.azure_endpoint || !config.azure_api_key) {
        toast({
          title: "Validation Error",
          description: "Azure OpenAI requires endpoint and API key",
          variant: "destructive",
        });
        return;
      }
      if (!config.azure_doc_intel_endpoint || !config.azure_doc_intel_key) {
        toast({
          title: "Validation Error",
          description: "Azure OpenAI requires Azure Document Intelligence for PDF invoice processing",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      let data: any = await settingsApi.get();
      // API client throws on failure
      type TenantAIConfigUpdate = any["public"]["Tables"]["tenant_ai_config"]["Update"];

      const basePayload: TenantAIConfigUpdate = {
        provider: config.provider,
        azure_endpoint: config.provider === "azure_openai" ? config.azure_endpoint : null,
        azure_deployment_name: config.provider === "azure_openai" ? config.azure_deployment_name : null,
        azure_api_version: config.provider === "azure_openai" ? config.azure_api_version : null,
        azure_doc_intel_endpoint: config.provider === "azure_openai" ? config.azure_doc_intel_endpoint : null,
        updated_at: new Date().toISOString(),
      };

      // Only update keys if they're not the masked placeholder
      if (config.azure_api_key && !config.azure_api_key.includes("•")) {
        basePayload.azure_api_key_encrypted = config.azure_api_key;
      }
      if (config.azure_doc_intel_key && !config.azure_doc_intel_key.includes("•")) {
        basePayload.azure_doc_intel_key_encrypted = config.azure_doc_intel_key;
      }

      // Settings are saved through one API call; the client throws on failure.
      await settingsApi.update(basePayload as any);

      toast({
        title: "Settings Saved",
        description: "AI provider configuration has been updated",
      });
    } catch (error) {
      console.error("Error saving AI config:", error);
      toast({
        title: "Error",
        description: "Failed to save AI configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Shield className="h-5 w-5" />
                Access Denied
              </CardTitle>
              <CardDescription>
                Only Administrators can access AI Provider settings.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            AI Provider Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure the AI provider used for invoice processing and extraction.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider Selection</CardTitle>
            <CardDescription>
              Choose which AI provider to use for document processing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">AI Provider</Label>
              <Select
                value={config.provider}
                onValueChange={(value: AIProvider) =>
                  setConfig((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">
                    <div className="flex items-center gap-2">
                      <span>Gemini (Default)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="azure_openai">
                    <div className="flex items-center gap-2">
                      <span>Azure OpenAI + Document Intelligence</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.provider === "gemini"
                  ? "Uses Lovable AI Gateway with Gemini models. No additional configuration required."
                  : "Uses Azure Document Intelligence for OCR extraction and Azure OpenAI GPT-4o for reasoning."}
              </p>
            </div>
          </CardContent>
        </Card>

        {config.provider === "azure_openai" && (
          <>
            {/* Azure Document Intelligence Section - REQUIRED */}
            <Card className="border-amber-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Azure Document Intelligence (Required)
                </CardTitle>
                <CardDescription>
                  Required for PDF invoice processing. Handles OCR and structured extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Required for PDF Processing</AlertTitle>
                  <AlertDescription>
                    Azure OpenAI requires Azure Document Intelligence for PDF invoice processing. 
                    GPT-4o is used only for normalization and validation after extraction.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="azure_doc_intel_endpoint">Document Intelligence Endpoint *</Label>
                  <Input
                    id="azure_doc_intel_endpoint"
                    placeholder="https://your-resource.cognitiveservices.azure.com"
                    value={config.azure_doc_intel_endpoint}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, azure_doc_intel_endpoint: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Your Azure Document Intelligence (Form Recognizer) endpoint URL.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure_doc_intel_key">Document Intelligence API Key *</Label>
                  <div className="relative">
                    <Input
                      id="azure_doc_intel_key"
                      type={showDocIntelKey ? "text" : "password"}
                      placeholder="Enter your API key"
                      value={config.azure_doc_intel_key}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, azure_doc_intel_key: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowDocIntelKey(!showDocIntelKey)}
                    >
                      {showDocIntelKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your Azure Document Intelligence API key. This will be stored securely.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Azure OpenAI Section */}
            <Card>
              <CardHeader>
                <CardTitle>Azure OpenAI Configuration</CardTitle>
                <CardDescription>
                  Used for normalization, validation, and reasoning after extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="azure_endpoint">Azure OpenAI Endpoint *</Label>
                  <Input
                    id="azure_endpoint"
                    placeholder="https://your-resource.openai.azure.com"
                    value={config.azure_endpoint}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, azure_endpoint: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Your Azure OpenAI resource endpoint URL.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure_api_key">Azure OpenAI API Key *</Label>
                  <div className="relative">
                    <Input
                      id="azure_api_key"
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your API key"
                      value={config.azure_api_key}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, azure_api_key: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your Azure OpenAI API key. This will be stored securely.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure_deployment_name">Deployment Name</Label>
                  <Input
                    id="azure_deployment_name"
                    placeholder="gpt-4o"
                    value={config.azure_deployment_name}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        azure_deployment_name: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    The name of your deployed GPT-4o model in Azure OpenAI.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure_api_version">API Version</Label>
                  <Input
                    id="azure_api_version"
                    placeholder="2024-02-15-preview"
                    value={config.azure_api_version}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        azure_api_version: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Azure OpenAI API version (e.g., 2024-02-15-preview).
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Configuration
          </Button>
        </div>
      </div>
    </Layout>
  );
}
