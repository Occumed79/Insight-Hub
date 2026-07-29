import { Building2, Clock3, RefreshCcw, ShieldCheck } from "lucide-react";

const recompeteLanes = [
  {
    icon: Clock3,
    title: "Expiration Timeline",
    description: "Contract end dates, option periods, bridge actions, and likely recompete windows.",
  },
  {
    icon: Building2,
    title: "Incumbent Position",
    description: "Current contractor, contract vehicle, agency ownership, and known performance context.",
  },
  {
    icon: ShieldCheck,
    title: "Readiness Signals",
    description: "Early indicators that help Occu-Med prepare before the next solicitation is released.",
  },
];

export default function RecompeteWatchPage() {
  return (
    <div className="space-y-8">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">
          Procurement Intelligence
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">Recompete Watch</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/55 md:text-lg">
          A dedicated view for expiring contracts, incumbent positions, option periods, and likely recompetes before the next solicitation reaches the market.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {recompeteLanes.map(({ icon: Icon, title, description }) => (
          <div key={title} className="glass-card rounded-2xl border border-white/10 p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/45">{description}</p>
          </div>
        ))}
      </section>

      <section className="glass-card flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-white/10 px-6 py-12 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_40px_rgba(56,182,255,0.18)]">
          <RefreshCcw className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-white">Recompete workspace established</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
          Recompete records will be surfaced here separately from active opportunities. The next implementation step is wiring the recompete-watch feed, expiration timeline, and incumbent filters into this workspace.
        </p>
      </section>
    </div>
  );
}
