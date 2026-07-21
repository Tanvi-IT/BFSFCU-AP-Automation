import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingState {
  id: string;
  tenant_id: string;
  primary_user_id: string | null;
  current_step: string;
  completed: boolean;
  steps: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export function useOnboarding() {
  const { tenantId } = useAuth();
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOnboardingState() {
      if (!tenantId) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("onboarding_state")
          .select("*")
          .eq("tenant_id", tenantId)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        setOnboarding(data as OnboardingState | null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch onboarding state");
      } finally {
        setIsLoading(false);
      }
    }

    fetchOnboardingState();
  }, [tenantId]);

  const isOnboardingComplete = onboarding?.completed ?? true;
  const needsOnboarding = onboarding && !onboarding.completed;

  return {
    onboarding,
    isLoading,
    error,
    isOnboardingComplete,
    needsOnboarding,
  };
}
