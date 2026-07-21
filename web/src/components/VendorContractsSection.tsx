import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Upload, Loader2, Calendar, DollarSign, Clock, AlertCircle, RefreshCw, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VendorContract {
  id: string;
  file_path: string;
  payment_terms: string | null;
  discount_terms: string | null;
  service_period: string | null;
  termination_clauses: string | null;
  renewal_rules: string | null;
  price_change_clauses: string | null;
  net_terms: string | null;
  delivery_obligations: string | null;
  ai_summary: string | null;
  created_at: string;
}

interface VendorContractsSectionProps {
  vendorId: string;
  tenantId: string;
  contracts: VendorContract[];
  onContractUploaded?: () => void;
  canUpload?: boolean;
}

export function VendorContractsSection({
  vendorId,
  tenantId,
  contracts,
  onContractUploaded,
  canUpload = false,
}: VendorContractsSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("pdf")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload a PDF document.",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Upload file to storage
      const fileName = `contracts/${tenantId}/${vendorId}/${Date.now()}_${file.name}`;
      const uploadError = null;


      if (uploadError) throw uploadError;

      // Process contract with AI
      // Contract processing (AI extraction) has not been ported yet.
      const data = null;
      const error = new Error('Contract processing is not available yet in the Azure build.');


      if (error) throw error;

      toast({
        title: "Contract uploaded",
        description: "Contract has been processed and key terms extracted.",
      });

      onContractUploaded?.();
    } catch (error: any) {
      console.error("Contract upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload contract.",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Contracts ({contracts.length})
            </CardTitle>
            <CardDescription>
              Supplier contracts with AI-extracted terms
            </CardDescription>
          </div>
          {/* Contract upload button - always visible but locked */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button variant="outline" size="sm" disabled className="opacity-60">
                    <Lock className="h-4 w-4 mr-2" />
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Contract
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Contracts module will be activated if required</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No contracts uploaded for this vendor.</p>
            <p className="text-sm mt-2 text-muted-foreground/70">
              Contracts module will be activated if required.
            </p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {contracts.map((contract, index) => (
              <AccordionItem key={contract.id} value={contract.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Contract {index + 1}</span>
                    <Badge variant="secondary" className="text-xs">
                      {new Date(contract.created_at).toLocaleDateString()}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {contract.ai_summary && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4 text-primary" />
                        AI Summary
                      </h4>
                      <p className="text-sm text-muted-foreground">{contract.ai_summary}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contract.payment_terms && (
                      <div className="flex items-start gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Payment Terms</p>
                          <p className="text-sm">{contract.payment_terms}</p>
                        </div>
                      </div>
                    )}

                    {contract.net_terms && (
                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Net Terms</p>
                          <p className="text-sm">{contract.net_terms}</p>
                        </div>
                      </div>
                    )}

                    {contract.discount_terms && (
                      <div className="flex items-start gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Discount Terms</p>
                          <p className="text-sm">{contract.discount_terms}</p>
                        </div>
                      </div>
                    )}

                    {contract.service_period && (
                      <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Service Period</p>
                          <p className="text-sm">{contract.service_period}</p>
                        </div>
                      </div>
                    )}

                    {contract.renewal_rules && (
                      <div className="flex items-start gap-2">
                        <RefreshCw className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Renewal Rules</p>
                          <p className="text-sm">{contract.renewal_rules}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {contract.termination_clauses && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Termination Clauses</p>
                      <p className="text-sm">{contract.termination_clauses}</p>
                    </div>
                  )}

                  {contract.price_change_clauses && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Price Change Clauses</p>
                      <p className="text-sm">{contract.price_change_clauses}</p>
                    </div>
                  )}

                  {contract.delivery_obligations && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Delivery Obligations</p>
                      <p className="text-sm">{contract.delivery_obligations}</p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
