import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Lock,
  PiggyBank,
  FileSearch,
  ShieldAlert,
  Plug,
  Building2,
  Sparkles,
  Mail,
} from "lucide-react";

const addOns = [
  {
    id: "budget-oversight",
    title: "Budget Oversight",
    description: "Real-time budget tracking and alerts for overspending",
    icon: PiggyBank,
  },
  {
    id: "contract-intelligence",
    title: "Contract Intelligence",
    description: "AI-powered contract analysis and compliance monitoring",
    icon: FileSearch,
  },
  {
    id: "advanced-fraud",
    title: "Advanced Fraud Engine",
    description: "Multi-layer fraud detection with behavioral analysis",
    icon: ShieldAlert,
  },
  {
    id: "api-ingestion",
    title: "API Ingestion",
    description: "Direct API integration for invoice submission",
    icon: Plug,
  },
  {
    id: "multi-entity",
    title: "Multi-Entity Dashboard",
    description: "Consolidated view across multiple business entities",
    icon: Building2,
  },
];

export default function AddOns() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedAddOn, setSelectedAddOn] = useState<string | null>(null);

  const handleAddOnClick = (addOnId: string) => {
    setSelectedAddOn(addOnId);
    setShowUpgradeModal(true);
  };

  const handleContactSales = () => {
    window.location.href = "mailto:sales@clarusap.com?subject=Premium Add-On Inquiry&body=I'm interested in learning more about Clarus AP premium features.";
    setShowUpgradeModal(false);
  };

  const selectedAddOnData = addOns.find((a) => a.id === selectedAddOn);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <Sparkles className="h-8 w-8 text-primary" />
            Add-ons (Premium)
          </h1>
          <p className="text-muted-foreground mt-1">
            Unlock advanced capabilities for your AP automation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {addOns.map((addOn) => (
            <Card key={addOn.id} className="relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardHeader>
                <div className="p-2 bg-muted rounded-lg w-fit">
                  <addOn.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">{addOn.title}</CardTitle>
                <CardDescription>{addOn.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleAddOnClick(addOn.id)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Unlock Feature
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Upgrade to Unlock
            </DialogTitle>
            <DialogDescription>
              {selectedAddOnData && (
                <>
                  <strong>{selectedAddOnData.title}</strong> is a premium feature.
                  <br />
                  <br />
                  Upgrade to unlock this feature and get access to advanced AP
                  automation capabilities.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowUpgradeModal(false)}>
              Maybe Later
            </Button>
            <Button onClick={handleContactSales}>
              <Mail className="h-4 w-4 mr-2" />
              Contact Sales
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
