import { CalendarClock, FileSearch, Radar, Signal } from "lucide-react";

const forecastLanes = [
  {
    icon: CalendarClock,
    title: "Expected Release Windows",
    description: "Planned solicitation dates, quarter-level timing, and acquisition milestones.",
  },
  {
    icon: Radar,
    title: "Pre-Solicitation Signals",
    description: "Sources sought, RFIs, acquisition notices, and early market research activity.",
  },
  {
    icon: Signal,
    title: "Agency Buying Signals",
    description: "Forecast notices and public indicators that show what agencies intend to purchase next.",
  },
];

export default function ForecastPage() {
  return (
    <div className="space-y-8">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">
          Procurement Intelligence
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">Procurement Forecast</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/55 md:text-lg">
          A dedicated view for planned acquisitions, expected release windows, and pre-solicitation activity before an opportunity becomes an active RFP.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {forecastLanes.map(({ icon: Icon, title, description }) => (
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
          <FileSearch className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-white">Forecast workspace established</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
          Forecast data will be surfaced here separately from active opportunities. The next implementation step is wiring the procurement-forecast feed and its release-window filters into this workspace.
        </p>
      </section>
    </div>
  );
}
