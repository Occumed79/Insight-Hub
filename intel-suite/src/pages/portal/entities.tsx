import { useState } from "react";
import { Building2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClientsPage from "./clients";
import ProspectsPage from "./prospects";

type EntityTab = "prospects" | "clients";

interface EntitiesPageProps {
  defaultTab?: EntityTab;
}

export default function EntitiesPage({ defaultTab = "prospects" }: EntitiesPageProps) {
  const [tab, setTab] = useState<EntityTab>(defaultTab);

  return (
    <div className="ui-page-shell flex min-h-0 flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <h1 className="ui-break-anywhere text-3xl font-display font-bold tracking-tight text-white">
            Entity Intelligence
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Prospects and existing client records now live in one Entities workspace.
          </p>
        </div>

        <div role="tablist" aria-label="Entity record type" className="flex min-w-0 flex-wrap gap-2">
          <Button
            type="button"
            role="tab"
            aria-selected={tab === "prospects"}
            aria-controls="entity-prospects-panel"
            id="entity-prospects-tab"
            variant={tab === "prospects" ? "default" : "outline"}
            onClick={() => setTab("prospects")}
            className={tab === "prospects" ? "" : "border-white/10 bg-white/5 text-white hover:bg-white/10"}
          >
            <Target className="mr-2 h-4 w-4" aria-hidden="true" /> Prospect Profiles
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={tab === "clients"}
            aria-controls="entity-clients-panel"
            id="entity-clients-tab"
            variant={tab === "clients" ? "default" : "outline"}
            onClick={() => setTab("clients")}
            className={tab === "clients" ? "" : "border-white/10 bg-white/5 text-white hover:bg-white/10"}
          >
            <Building2 className="mr-2 h-4 w-4" aria-hidden="true" /> Client Records
          </Button>
        </div>
      </div>

      <div
        id={tab === "prospects" ? "entity-prospects-panel" : "entity-clients-panel"}
        role="tabpanel"
        aria-labelledby={tab === "prospects" ? "entity-prospects-tab" : "entity-clients-tab"}
        className="min-w-0"
      >
        {tab === "prospects" ? <ProspectsPage /> : <ClientsPage />}
      </div>
    </div>
  );
}
