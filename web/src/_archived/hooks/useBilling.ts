import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Plan = "free_trial" | "starter" | "growth" | "enterprise";

interface BillingState {
  plan: Plan;
  trialEndsAt: string | null;
  planRenewsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isLoading: boolean;
  error: string | null;
}

const PLAN_FEATURES: Record<Plan, string[]> = {
  free_trial: [
    "invoice_ingestion",
    "email_ingestion",
    "vendor_auto_creation",
    "variation_engine",
    "manual_exports",
  ],
  starter: [
    "invoice_ingestion",
    "email_ingestion",
    "vendor_auto_creation",
    "variation_engine",
    "manual_exports",
    "maker_checker_workflow",
  ],
  growth: [
    "invoice_ingestion",
    "email_ingestion",
    "vendor_auto_creation",
    "variation_engine",
    "manual_exports",
    "maker_checker_workflow",
    "scheduled_exports",
    "erp_export_engine",
    "ai_erp_mapping",
    "developer_api",
    "webhooks",
    "audit_timeline",
    "vendor_fraud_scoring",
  ],
  enterprise: [
    "invoice_ingestion",
    "email_ingestion",
    "vendor_auto_creation",
    "variation_engine",
    "manual_exports",
    "maker_checker_workflow",
    "scheduled_exports",
    "erp_export_engine",
    "ai_erp_mapping",
    "developer_api",
    "webhooks",
    "audit_timeline",
    "vendor_fraud_scoring",
    "multi_entity",
    "sftp_delivery",
    "native_erp_connectors",
    "api_platform",
    "security_bundle",
    "sla_99_9",
  ],
};

export function useBilling() {
  const { tenantId, isSuperAdmin } = useAuth();
  const [billing, setBilling] = useState<BillingState>({
    plan: "free_trial",
    trialEndsAt: null,
    planRenewsAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchBilling() {
      if (!tenantId) {
        setBilling(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("plan, trial_ends_at, plan_renews_at, stripe_customer_id, stripe_subscription_id")
          .eq("id", tenantId)
          .single();

        if (error) throw error;

        setBilling({
          plan: (data?.plan as Plan) || "free_trial",
          trialEndsAt: data?.trial_ends_at,
          planRenewsAt: data?.plan_renews_at,
          stripeCustomerId: data?.stripe_customer_id,
          stripeSubscriptionId: data?.stripe_subscription_id,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setBilling(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to fetch billing",
        }));
      }
    }

    fetchBilling();
  }, [tenantId]);

  const hasFeature = (feature: string): boolean => {
    if (isSuperAdmin) return true;
    return PLAN_FEATURES[billing.plan]?.includes(feature) ?? false;
  };

  const isTrialExpired = (): boolean => {
    if (billing.plan !== "free_trial") return false;
    if (!billing.trialEndsAt) return false;
    return new Date(billing.trialEndsAt) < new Date();
  };

  const daysUntilTrialEnd = (): number | null => {
    if (billing.plan !== "free_trial" || !billing.trialEndsAt) return null;
    const now = new Date();
    const trialEnd = new Date(billing.trialEndsAt);
    const diff = trialEnd.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const openBillingPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("billing-portal");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Failed to open billing portal:", err);
      throw err;
    }
  };

  const createCheckout = async (plan: "starter" | "growth", switchCredit = false) => {
    const STRIPE_PRICES = {
      starter: "price_1SZHlQFLwEbHxrRURLyMQxuc",
      growth: "price_1SZHldFLwEbHxrRU6VZclAcL",
    };

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { 
          priceId: STRIPE_PRICES[plan],
          switchCredit,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Failed to create checkout:", err);
      throw err;
    }
  };

  return {
    ...billing,
    hasFeature,
    isTrialExpired,
    daysUntilTrialEnd,
    openBillingPortal,
    createCheckout,
  };
}
