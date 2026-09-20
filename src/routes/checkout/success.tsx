import { createFileRoute } from "@tanstack/react-router";

import { CheckoutSuccessView } from "@/components/lily/checkout-views";
import { en } from "@/locales/en";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      NOINDEX_META,
      { title: en["checkout.success.meta.title"] },
      { name: "description", content: en["checkout.success.meta.description"] },
      { property: "og:title", content: en["checkout.success.meta.title"] },
      { property: "og:description", content: en["checkout.success.meta.description"] },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutSuccessView,
});
