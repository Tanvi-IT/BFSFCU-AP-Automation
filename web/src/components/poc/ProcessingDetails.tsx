import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Cpu, 
  FileSearch, 
  BrainCircuit, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Server
} from "lucide-react";
import { format } from "date-fns";

interface ProcessingDetailsProps {
  extractionProvider: string | null;
  reasoningProvider: string | null;
  rawExtractionJson: any;
  normalizedExtractionJson: any;
}

export function ProcessingDetails({
  extractionProvider,
  reasoningProvider,
  rawExtractionJson,
  normalizedExtractionJson,
}: ProcessingDetailsProps) {
  // Extract audit metadata from normalized JSON
  const auditMetadata = normalizedExtractionJson?.audit_metadata || {};
  const extractionTimestamp = auditMetadata.extraction_timestamp;
  const extractionModel = auditMetadata.extraction_model || "prebuilt-invoice";
  const reasoningDeployment = auditMetadata.reasoning_deployment;
  const reasoningTimestamp = auditMetadata.reasoning_timestamp;

  const getProviderDisplay = (provider: string | null) => {
    switch (provider) {
      case "azure_document_intelligence":
        return { label: "Azure Document Intelligence", color: "bg-blue-500" };
      case "azure_openai":
        return { label: "Azure OpenAI GPT-4o", color: "bg-purple-500" };
      case "gemini":
        return { label: "Google Gemini", color: "bg-green-500" };
      default:
        return { label: provider || "Unknown", color: "bg-muted" };
    }
  };

  const extractionDisplay = getProviderDisplay(extractionProvider);
  const reasoningDisplay = getProviderDisplay(reasoningProvider);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          Processing Details
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            Admin Only
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage 1: Extraction */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileSearch className="h-4 w-4" />
            Stage 1: Document Extraction
          </div>
          <div className="ml-6 space-y-1.5">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Provider:</span>
              <Badge 
                variant="secondary" 
                className={`${extractionDisplay.color} text-white text-xs`}
              >
                {extractionDisplay.label}
              </Badge>
            </div>
            {extractionProvider === "azure_document_intelligence" && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-muted-foreground">Model:</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    {extractionModel}
                  </code>
                </div>
                {extractionTimestamp && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Processed:</span>
                    <span className="text-xs">
                      {format(new Date(extractionTimestamp), "MMM dd, yyyy HH:mm:ss")}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Stage 2: Reasoning */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BrainCircuit className="h-4 w-4" />
            Stage 2: Normalization & Validation
          </div>
          <div className="ml-6 space-y-1.5">
            {reasoningProvider ? (
              <>
                <div className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Provider:</span>
                  <Badge 
                    variant="secondary" 
                    className={`${reasoningDisplay.color} text-white text-xs`}
                  >
                    {reasoningDisplay.label}
                  </Badge>
                </div>
                {reasoningProvider === "azure_openai" && reasoningDeployment && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    <span className="text-muted-foreground">Deployment:</span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {reasoningDeployment}
                    </code>
                  </div>
                )}
                {reasoningTimestamp && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Processed:</span>
                    <span className="text-xs">
                      {format(new Date(reasoningTimestamp), "MMM dd, yyyy HH:mm:ss")}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Reasoning stage not applied</span>
              </div>
            )}
          </div>
        </div>

        {/* Demo statement removed - provider proof available via admin diagnostics only */}
      </CardContent>
    </Card>
  );
}
