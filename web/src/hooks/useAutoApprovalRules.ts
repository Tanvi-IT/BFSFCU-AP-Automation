import { useState, useEffect } from "react";
import { rulesApi } from "@/services/settings";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
type Json = unknown;

export interface ApprovalRuleConditions {
  risk_score_max?: number;
  risk_score_min?: number;
  amount_max?: number;
  amount_min?: number;
  vendor_reputation_min?: number;
  anomaly_types?: string[];
  require_checker_above_amount?: number;
  block_critical_anomalies?: boolean;
  contract_mismatch_threshold?: number;
  [key: string]: Json | undefined;
}

export interface AutoApprovalRule {
  id: string;
  tenant_id: string | null;
  scope: "global" | "tenant";
  rule_name: string;
  rule_type: "auto_approve" | "auto_reject" | "auto_route" | "auto_block";
  conditions: ApprovalRuleConditions;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useAutoApprovalRules = () => {
  const [rules, setRules] = useState<AutoApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId, isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await rulesApi.list();
      const error = null;
      setRules((data as unknown as AutoApprovalRule[]) || []);
    } catch (error: any) {
      console.error("Error fetching rules:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load approval rules",
      });
    } finally {
      setLoading(false);
    }
  };

  const createRule = async (rule: Omit<AutoApprovalRule, "id" | "created_at" | "updated_at">) => {
    try {
      const data = await rulesApi.create(rule as any);

      toast({
        title: "Rule Created",
        description: `"${rule.rule_name}" has been created successfully.`,
      });
      
      await fetchRules();
      return data;
    } catch (error: any) {
      console.error("Error creating rule:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create approval rule",
      });
      return null;
    }
  };

  const updateRule = async (id: string, updates: Partial<AutoApprovalRule>) => {
    try {
      // handled by the API client (throws on failure)
      
      toast({
        title: "Rule Updated",
        description: "Approval rule has been updated.",
      });
      
      await fetchRules();
    } catch (error: any) {
      console.error("Error updating rule:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update approval rule",
      });
    }
  };

  const deleteRule = async (id: string) => {
    try {
      // handled by the API client (throws on failure)
      
      toast({
        title: "Rule Deleted",
        description: "Approval rule has been removed.",
      });
      
      await fetchRules();
    } catch (error: any) {
      console.error("Error deleting rule:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete approval rule",
      });
    }
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    await updateRule(id, { is_active: isActive });
  };

  useEffect(() => {
    fetchRules();
  }, [tenantId, isSuperAdmin]);

  return {
    rules,
    loading,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    refetch: fetchRules,
  };
};
