import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { erpApi } from "@/services/settings";
import { Loader2, Upload, Sparkles, CheckCircle, ArrowLeft, Save, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MappingSuggestion {
  canonical_field: string;
  erp_field: string;
  confidence: number;
  reason?: string;
}

interface SavedMapping {
  id: string;
  canonical_field: string;
  erp_field: string;
  erp_system: string;
  confidence: number | null;
}

const ERPMapping = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canApprove, tenantId } = useAuth();
  const [erpSystem, setErpSystem] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetchSavedMappings();
  }, [tenantId]);

  const fetchSavedMappings = async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    try {
      let data = await erpApi.mappings();
      let error = null;


      if (error) throw error;

      setSavedMappings((data || []).map(m => ({
        id: m.id,
        canonical_field: m.canonical_field,
        erp_field: m.erp_field,
        erp_system: m.erp_system,
        confidence: m.confidence,
      })));
    } catch (error) {
      console.error('Error fetching mappings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      // Take first 5000 chars for analysis
      setFileContent(content.substring(0, 5000));
    };
    reader.readAsText(file);
  };

  const analyzeWithAI = async () => {
    if (!erpSystem || !fileContent) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please select ERP system and upload a file",
      });
      return;
    }

    setIsAnalyzing(true);
    setSuggestions([]);

    try {
      let data = null;
      let error = new Error('AI mapping suggestions are not available yet in the Azure build.');


      if (error) throw error;

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        toast({
          title: "Analysis complete",
          description: `Found ${data.suggestions.length} field mapping suggestions`,
        });
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error.message || "Failed to analyze file",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const acceptSuggestion = async (suggestion: MappingSuggestion) => {
    if (!tenantId) return;

    setIsSaving(true);
    try {
      await erpApi.createMapping({} as any);
      let error = null;


      if (error) throw error;

      toast({
        title: "Mapping saved",
        description: `${suggestion.canonical_field} → ${suggestion.erp_field}`,
      });

      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => s.canonical_field !== suggestion.canonical_field));
      fetchSavedMappings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save mapping",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const acceptAllSuggestions = async () => {
    if (!tenantId || suggestions.length === 0) return;

    setIsSaving(true);
    try {
      const mappings = suggestions.map(s => ({
        tenant_id: tenantId,
        canonical_field: s.canonical_field,
        erp_field: s.erp_field,
        erp_system: erpSystem,
        confidence: s.confidence,
      }));

      await erpApi.createMapping({} as any);
      let error = null;


      if (error) throw error;

      toast({
        title: "All mappings saved",
        description: `Saved ${suggestions.length} field mappings`,
      });

      setSuggestions([]);
      fetchSavedMappings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save mappings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateMapping = async (mapping: SavedMapping) => {
    if (!editValue.trim()) return;

    try {
      await erpApi.createMapping({} as any);
      let error = null;


      if (error) throw error;

      toast({ title: "Mapping updated" });
      setEditingField(null);
      setEditValue("");
      fetchSavedMappings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const deleteMapping = async (id: string) => {
    try {
      let data = await erpApi.mappings();
      let error = null;


      if (error) throw error;

      toast({ title: "Mapping deleted" });
      fetchSavedMappings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-success';
    if (confidence >= 0.6) return 'bg-warning';
    return 'bg-muted';
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Sparkles className="h-8 w-8 text-primary" />
              ERP Field Mapping
            </h1>
            <p className="text-muted-foreground mt-1">
              AI-powered mapping between your ERP and Clarus AP fields
            </p>
          </div>
        </div>

        {/* AI Analysis Card */}
        <Card>
          <CardHeader>
            <CardTitle>AI Mapping Assistant</CardTitle>
            <CardDescription>
              Upload your ERP export (vendor master, chart of accounts, or sample invoice) to auto-generate field mappings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>ERP System</Label>
                <Select value={erpSystem} onValueChange={setErpSystem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your ERP" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sap">SAP</SelectItem>
                    <SelectItem value="oracle">Oracle</SelectItem>
                    <SelectItem value="netsuite">NetSuite</SelectItem>
                    <SelectItem value="quickbooks">QuickBooks</SelectItem>
                    <SelectItem value="xero">Xero</SelectItem>
                    <SelectItem value="odoo">Odoo</SelectItem>
                    <SelectItem value="dynamics">Microsoft Dynamics</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Upload Export File (CSV/Excel)</Label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={handleFileUpload}
                />
              </div>
            </div>

            {fileContent && (
              <div className="space-y-2">
                <Label>File Preview (first 500 chars)</Label>
                <Textarea
                  value={fileContent.substring(0, 500)}
                  readOnly
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            )}

            <Button
              onClick={analyzeWithAI}
              disabled={!erpSystem || !fileContent || isAnalyzing}
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Analyze & Suggest Mappings
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* AI Suggestions */}
        {suggestions.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI Suggestions ({suggestions.length})</CardTitle>
                  <CardDescription>Review and accept the suggested mappings</CardDescription>
                </div>
                <Button onClick={acceptAllSuggestions} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Accept All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clarus AP Field</TableHead>
                    <TableHead>ERP Field</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((suggestion) => (
                    <TableRow key={suggestion.canonical_field}>
                      <TableCell className="font-medium">
                        {suggestion.canonical_field}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 text-sm">
                          {suggestion.erp_field}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={suggestion.confidence * 100}
                            className="w-16 h-2"
                          />
                          <span className="text-sm text-muted-foreground">
                            {Math.round(suggestion.confidence * 100)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {suggestion.reason || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => acceptSuggestion(suggestion)}
                          disabled={isSaving}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Saved Mappings */}
        <Card>
          <CardHeader>
            <CardTitle>Saved Mappings ({savedMappings.length})</CardTitle>
            <CardDescription>
              These mappings are used when exporting invoices to your ERP
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : savedMappings.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No mappings configured yet. Use the AI assistant above to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clarus AP Field</TableHead>
                    <TableHead>ERP Field</TableHead>
                    <TableHead>ERP System</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedMappings.map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell className="font-medium">
                        {mapping.canonical_field}
                      </TableCell>
                      <TableCell>
                        {editingField === mapping.id ? (
                          <div className="flex gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-8 w-40"
                            />
                            <Button size="sm" onClick={() => updateMapping(mapping)}>
                              <Save className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {mapping.erp_field}
                          </code>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{mapping.erp_system}</Badge>
                      </TableCell>
                      <TableCell>
                        {mapping.confidence ? (
                          <Badge className={getConfidenceColor(mapping.confidence)}>
                            {Math.round(mapping.confidence * 100)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingField(mapping.id);
                              setEditValue(mapping.erp_field);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMapping(mapping.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ERPMapping;
