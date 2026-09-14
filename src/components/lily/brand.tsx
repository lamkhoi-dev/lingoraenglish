import { Link } from "@tanstack/react-router";

export function LilyLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <img src="/logo-icon.png" alt="Lingora English" className="size-9 shrink-0 object-contain" />
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-semibold tracking-tight text-foreground">
            Lingora English
          </span>
        </span>
      )}
    </Link>
  );
}

export function Spotlights() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -top-48 left-1/2 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-brass/15 blur-[130px]" />
      <div className="absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full bg-plum/15 blur-[120px]" />
    </div>
  );
}

export function DemoBadge({ label = "Demo" }: { label?: string }) {
  return (
    <span className="rounded-full bg-plum/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-plum-soft">
      {label}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass-soft">{eyebrow}</p>
      )}
      <h1 className="mt-3 font-display text-3xl leading-tight text-foreground sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>}
    </div>
  );
}
