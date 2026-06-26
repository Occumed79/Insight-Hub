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
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-white">Entity Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prospects and existing client records now live in one Entities workspace.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={tab === "prospects" ? "default" : "outline"}
            onClick={() => setTab("prospects")}
            className={tab === "prospects" ? "" : "border-white/10 bg-white/5 text-white hover:bg-white/10"}
          >
            <Target className="mr-2 h-4 w-4" /> Prospect Profiles
          </Button>
          <Button
            variant={tab === "clients" ? "default" : "outline"}
            onClick={() => setTab("clients")}
            className={tab === "clients" ? "" : "border-white/10 bg-white/5 text-white hover:bg-white/10"}
          >
            <Building2 className="mr-2 h-4 w-4" /> Client Records
          </Button>
        </div>
      </div>

      {tab === "prospects" ? <ProspectsPage /> : <ClientsPage />}
    </div>
  );
}
