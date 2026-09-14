import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyBilling, getPublicPlans } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth";

export type PlanRecord = {
  plan_key: string;
  tier: "free" | "premium" | "ielts_pro";
  name: string;
  tagline: string;
  badge: string;
  currency: string;
  monthly_amount: number;
  yearly_amount: number;
  monthly_price_id: string;
  yearly_price_id: string;
  features: string[];
  limits: Record<string, number>;
  trial_enabled: boolean;
  trial_days: number;
  sort_order: number;
};

/** Public plan catalogue — safe to read without an account. */
export function usePlans() {
  const fetchPlans = useServerFn(getPublicPlans);
  return useQuery({
    queryKey: ["billing-plans"],
    queryFn: (): Promise<PlanRecord[]> => fetchPlans() as unknown as Promise<PlanRecord[]>,
    staleTime: 5 * 60 * 1000,
  });
}

/** The signed-in learner's plan, quota usage and subscription row. */
export function useBilling() {
  const { user } = useAuth();
  const fetchBilling = useServerFn(getMyBilling);

  return useQuery({
    queryKey: ["my-billing", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchBilling({ data: undefined as never }),
    staleTime: 30 * 1000,
  });
}
