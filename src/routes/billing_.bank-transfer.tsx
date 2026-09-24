import { createFileRoute } from "@tanstack/react-router";

import { BankTransferCheckoutView } from "@/components/lily/bank-transfer-checkout";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/billing_/bank-transfer")({
  validateSearch: (search: Record<string, unknown>): { order?: string } =>
    typeof search["order"] === "string" ? { order: search["order"] } : {},
  head: () => ({ meta: [NOINDEX_META] }),
  component: BankTransferCheckoutView,
});
