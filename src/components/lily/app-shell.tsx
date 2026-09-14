import type { ReactNode } from "react";

import { PaymentTestModeBanner } from "./billing-ui";
import { Spotlights } from "./brand";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background spotlight">
      <Spotlights />
      <div className="relative">
        <PaymentTestModeBanner />
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:px-8">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
