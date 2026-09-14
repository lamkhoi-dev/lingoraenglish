import { useCallback, useState } from "react";
import { toast } from "sonner";

import { FeaturePaywall, type PaywallFeature } from "@/components/lily/paywall";
import { useI18n } from "@/lib/i18n";
import { parseUpgradeError, rememberReturnPath } from "@/lib/upgrade-return";

/**
 * Turns a server refusal into a professional upgrade screen instead of a
 * technical error. Every gate is still enforced on the server — this only
 * decides how the refusal is presented.
 */
export function usePaywall(feature: PaywallFeature) {
  const { t } = useI18n();
  const [message, setMessage] = useState<string | null>(null);

  const handleError = useCallback(
    (error: unknown, fallback?: string) => {
      const upgrade = parseUpgradeError(error);
      if (upgrade !== null) {
        rememberReturnPath();
        setMessage(upgrade);
        return true;
      }
      toast.error(
        error instanceof Error && error.message ? error.message : (fallback ?? t("common.somethingWrong")),
      );
      return false;
    },
    [t],
  );

  const paywall = message ? (
    <div className="mt-6">
      <FeaturePaywall feature={feature} message={message} />
    </div>
  ) : null;

  return { paywall, handleError, clearPaywall: () => setMessage(null), blocked: message !== null };
}
