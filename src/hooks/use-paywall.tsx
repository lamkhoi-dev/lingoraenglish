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
      const raw = error instanceof Error ? error.message : "";
      // A proxy error page (e.g. nginx "413 Request Entity Too Large" for a long recording) arrives as raw
      // HTML — never show markup to the learner.
      // Same for a server input-validation error, which arrives as a raw JSON issue list.
      const isHtml = /<\s*(html|head|body|center)\b/i.test(raw) || /^\s*\[\s*\{\s*"code"/.test(raw);
      toast.error(
        isHtml
          ? /\b413\b/.test(raw) || (/"too_big"/.test(raw) && /audio/i.test(raw))
            ? t("common.recordingTooLarge")
            : (fallback ?? t("common.somethingWrong"))
          : raw || (fallback ?? t("common.somethingWrong")),
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
