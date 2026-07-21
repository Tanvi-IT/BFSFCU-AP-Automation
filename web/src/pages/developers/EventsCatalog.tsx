import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isPocTenant } from "@/lib/pocConfig";

const events = [
  {
    category: "Invoice Events",
    events: [
      {
        type: "invoice.created",
        description: "Fired when a new invoice is ingested into the system",
        payload: `{
  "id": "evt_abc123",
  "type": "invoice.created",
  "created": "2024-01-20T15:30:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "invoice_number": "INV-2024-001",
      "vendor_id": "vnd_123",
      "status": "ingested",
      "total_amount": 1080.00,
      "source": "email"
    }
  }
}`,
      },
      {
        type: "invoice.validated",
        description: "Fired when AI extraction and validation completes successfully",
        payload: `{
  "id": "evt_def456",
  "type": "invoice.validated",
  "created": "2024-01-20T15:31:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "status": "validated",
      "variation_score": 0.05,
      "risk_level": "low"
    }
  }
}`,
      },
      {
        type: "invoice.exception",
        description: "Fired when invoice is flagged for manual review due to anomalies",
        payload: `{
  "id": "evt_ghi789",
  "type": "invoice.exception",
  "created": "2024-01-20T15:31:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "status": "exception",
      "variation_flags": ["bank_change", "price_spike"],
      "risk_level": "high"
    }
  }
}`,
      },
      {
        type: "invoice.submitted",
        description: "Fired when Maker submits invoice for Checker review",
        payload: `{
  "id": "evt_jkl012",
  "type": "invoice.submitted",
  "created": "2024-01-20T16:00:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "status": "submitted",
      "submitted_by": "user_maker123"
    }
  }
}`,
      },
      {
        type: "invoice.approved",
        description: "Fired when Checker approves the invoice",
        payload: `{
  "id": "evt_mno345",
  "type": "invoice.approved",
  "created": "2024-01-20T17:00:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "status": "approved",
      "approved_by": "user_checker456"
    }
  }
}`,
      },
      {
        type: "invoice.rejected",
        description: "Fired when Checker rejects the invoice",
        payload: `{
  "id": "evt_pqr678",
  "type": "invoice.rejected",
  "created": "2024-01-20T17:00:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "status": "rejected",
      "rejected_by": "user_checker456",
      "rejection_reason": "Duplicate invoice"
    }
  }
}`,
      },
      {
        type: "invoice.exported",
        description: "Fired when invoice is added to export batch",
        payload: `{
  "id": "evt_stu901",
  "type": "invoice.exported",
  "created": "2024-01-21T02:00:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "status": "exported",
      "export_batch_id": "exp_batch123"
    }
  }
}`,
      },
    ],
  },
  {
    category: "Vendor Events",
    events: [
      {
        type: "vendor.created",
        description: "Fired when a new vendor is created (manually or auto-detected)",
        payload: `{
  "id": "evt_vnd001",
  "type": "vendor.created",
  "created": "2024-01-20T15:30:00Z",
  "data": {
    "object": {
      "id": "vnd_new123",
      "name": "New Vendor Inc",
      "status": "pending_verification",
      "source": "auto"
    }
  }
}`,
      },
      {
        type: "vendor.matched",
        description: "Fired when invoice vendor is matched to existing vendor record",
        payload: `{
  "id": "evt_vnd002",
  "type": "vendor.matched",
  "created": "2024-01-20T15:30:00Z",
  "data": {
    "object": {
      "id": "vnd_xyz789",
      "name": "Acme Corp",
      "match_type": "tax_id"
    },
    "invoice_id": "inv_abc123"
  }
}`,
      },
      {
        type: "vendor.updated",
        description: "Fired when vendor record is modified",
        payload: `{
  "id": "evt_vnd003",
  "type": "vendor.updated",
  "created": "2024-01-20T16:00:00Z",
  "data": {
    "object": {
      "id": "vnd_xyz789",
      "changes": ["bank_account", "status"]
    }
  }
}`,
      },
    ],
  },
  {
    category: "Export Events",
    events: [
      {
        type: "export.completed",
        description: "Fired when export batch generation completes",
        payload: `{
  "id": "evt_exp001",
  "type": "export.completed",
  "created": "2024-01-21T02:01:00Z",
  "data": {
    "object": {
      "id": "exp_batch123",
      "erp_system": "netsuite",
      "invoice_count": 15,
      "file_url": "https://..."
    }
  }
}`,
      },
      {
        type: "export.delivered",
        description: "Fired when export is successfully delivered to ERP",
        payload: `{
  "id": "evt_exp002",
  "type": "export.delivered",
  "created": "2024-01-21T02:02:00Z",
  "data": {
    "object": {
      "id": "exp_batch123",
      "push_status": "delivered",
      "erp_reference_id": "NS-BATCH-4928"
    }
  }
}`,
      },
      {
        type: "export.failed",
        description: "Fired when export delivery fails after all retries",
        payload: `{
  "id": "evt_exp003",
  "type": "export.failed",
  "created": "2024-01-21T02:30:00Z",
  "data": {
    "object": {
      "id": "exp_batch123",
      "push_status": "failed",
      "error": "Connection timeout"
    }
  }
}`,
      },
    ],
  },
  {
    category: "ERP Sync Events",
    events: [
      {
        type: "erp.sync.started",
        description: "Fired when master data sync begins",
        payload: `{
  "id": "evt_sync001",
  "type": "erp.sync.started",
  "created": "2024-01-21T02:00:00Z",
  "data": {
    "object": {
      "sync_id": "sync_abc123",
      "erp_system": "netsuite",
      "resources": ["vendors", "gl_accounts"]
    }
  }
}`,
      },
      {
        type: "erp.sync.completed",
        description: "Fired when master data sync completes successfully",
        payload: `{
  "id": "evt_sync002",
  "type": "erp.sync.completed",
  "created": "2024-01-21T02:05:00Z",
  "data": {
    "object": {
      "sync_id": "sync_abc123",
      "synced_vendors": 150,
      "synced_gl_accounts": 245
    }
  }
}`,
      },
      {
        type: "erp.sync.failed",
        description: "Fired when master data sync fails",
        payload: `{
  "id": "evt_sync003",
  "type": "erp.sync.failed",
  "created": "2024-01-21T02:05:00Z",
  "data": {
    "object": {
      "sync_id": "sync_abc123",
      "error": "API authentication failed"
    }
  }
}`,
      },
    ],
  },
];

export default function EventsCatalog() {
  const navigate = useNavigate();
  const { tenantId, isSuperAdmin } = useAuth();
  const isPoc = isPocTenant(tenantId) && !isSuperAdmin;

  const handleBack = () => {
    navigate(isPoc ? "/poc/dashboard" : "/");
  };

  return (
    <DeveloperLayout>
      <div className="space-y-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {isPoc ? "Back to Dashboard" : "Back to Home"}
        </Button>

        <div className="space-y-4">
          <Badge variant="secondary">Webhooks</Badge>
          <h1 className="text-4xl font-bold tracking-tight">Events Catalog</h1>
          <p className="text-xl text-muted-foreground">
            Complete reference of all webhook events and their payload structures.
          </p>
        </div>

        {events.map((category) => (
          <Card key={category.category}>
            <CardHeader>
              <CardTitle>{category.category}</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {category.events.map((event) => (
                  <AccordionItem key={event.type} value={event.type}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <code className="text-sm bg-muted px-2 py-1 rounded">{event.type}</code>
                        <span className="text-sm text-muted-foreground">{event.description}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-2">
                        <p className="text-sm font-medium">Example Payload</p>
                        <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                          <pre className="text-muted-foreground">{event.payload}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}
      </div>
    </DeveloperLayout>
  );
}
