import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { erpApi } from "@/services/settings";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ERPSystem, ERP_SYSTEMS, generateERPExport, downloadExport, ExportedInvoice } from "@/lib/erpExport";
import { Download, Loader2, ChevronDown, Star } from "lucide-react";

interface ERPExportButtonProps {
  invoiceId: string;
  tenantId: string;
  invoiceNumber: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

interface TenantERPSettings {
  erp_system: string | null;
  export_format: string;
}

export function ERPExportButton({ 
  invoiceId, 
  tenantId, 
  invoiceNumber,
  variant = "outline",
  size = "default" 
}: ERPExportButtonProps) {
  const { toast } = useToast();
  const { tenantId: userTenantId } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [exportingSystem, setExportingSystem] = useState<ERPSystem | null>(null);
  const [tenantSettings, setTenantSettings] = useState<TenantERPSettings | null>(null);

  // Fetch tenant ERP settings
  useEffect(() => {
    const fetchSettings = async () => {
      const settingsTenantId = userTenantId || tenantId;
      if (!settingsTenantId) return;

      try {
      const data: any = (await erpApi.connectors())[0] ?? {};
      const error = null;


        if (!error && data) {
          setTenantSettings(data);
        }
      } catch (err) {
        console.error('[ERPExportButton] Error fetching tenant settings:', err);
      }
    };

    fetchSettings();
  }, [tenantId, userTenantId]);

  const handleExport = async (erpSystem: ERPSystem) => {
    setIsExporting(true);
    setExportingSystem(erpSystem);

    try {
      console.log('[ERPExportButton] Starting export for', erpSystem);

      // ERP export delivery is not ported. In the original system this called
      // export-invoice, which pushed to the ERP; that path was a stub for SFTP.
      const data = null;
      const error = new Error('ERP export is not available yet in the Azure build. Use the Prologue Excel export.');


      if (error) {
        throw new Error(error.message || 'Export failed');
      }

      if (!data.success) {
        throw new Error(data.error || 'Export failed');
      }

      // Generate the ERP-specific file format
      const exportData: ExportedInvoice = {
        canonical_invoice: data.canonical_invoice,
        mapped_invoice: data.mapped_invoice,
        erp_system: data.erp_system,
        format: data.format,
        generated_at: data.generated_at,
        warnings: data.warnings,
      };

      const result = generateERPExport(exportData);
      downloadExport(result);

      // Show success toast with any warnings
      if (data.warnings && data.warnings.length > 0) {
        toast({
          title: `Invoice exported for ${erpSystem}`,
          description: data.warnings.join(' '),
        });
      } else {
        toast({
          title: "Export successful",
          description: `Invoice ${invoiceNumber} exported for ${erpSystem}.`,
        });
      }

      console.log('[ERPExportButton] Export completed successfully');

    } catch (error: any) {
      console.error('[ERPExportButton] Export error:', error);
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error.message || "Failed to export invoice. See console for details.",
      });
    } finally {
      setIsExporting(false);
      setExportingSystem(null);
    }
  };

  // Sort ERP systems to show the configured one first
  const sortedERPSystems = [...ERP_SYSTEMS].sort((a, b) => {
    if (tenantSettings?.erp_system === a.value) return -1;
    if (tenantSettings?.erp_system === b.value) return 1;
    return 0;
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isExporting}>
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export
              <ChevronDown className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <DropdownMenuLabel>Select ERP System</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sortedERPSystems.map((erp) => (
          <DropdownMenuItem
            key={erp.value}
            onClick={() => handleExport(erp.value)}
            disabled={isExporting}
            className="flex justify-between"
          >
            <span className="flex items-center gap-2">
              {tenantSettings?.erp_system === erp.value && (
                <Star className="h-3 w-3 text-primary fill-primary" />
              )}
              {erp.label}
            </span>
            <span className="text-xs text-muted-foreground">{erp.format}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          Automated SFTP/API delivery coming Q1 2026
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
