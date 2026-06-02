import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  Search,
  Users,
  Target,
  UserSearch,
  Landmark,
  Map,
  Network,
  TrendingUp,
  ExternalLink,
  Link2,
  X,
  Check,
} from "lucide-react";
import outreachGalaxyButton from "@/assets/portal-buttons/outreach-galaxy.png";
import relationshipPlanetButton from "@/assets/portal-buttons/relationship-planet.png";
import hiringCompassButton from "@/assets/portal-buttons/hiring-compass.png";
import occuMedLogoSrc from "@/assets/occu-med-logo.png";

const LOGO_URL = occuMedLogoSrc;
const LINKS_STORAGE_KEY = "insight_hub_extra_portal_links";

function getStoredLinks(): { outreach: string; relationship: string; hiringTrends: string } {
  try {
    return JSON.parse(localStorage.getItem(LINKS_STORAGE_KEY) || "{}");
  } catch {
    return { outreach: "", relationship: "", hiringTrends: "" };
  }
}

interface PortalCardProps {
  href?: string;
  externalHref?: string;
  imgUrl: string;
  alt: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay: number;
}

function PortalCard({ href, externalHref, imgUrl, alt, icon, title, desc, delay }: PortalCardProps) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
      className="group relative rounded-2xl border border-white/15 bg-white/[0.035] hover:bg-white/[0.055] hover:border-primary/40 transition-all duration-300 overflow-hidden shadow-2xl shadow-black/20 min-h-[345px] flex flex-col"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-primary/10 via-transparent to-blue-500/10" />
      <div className="relative p-5 flex flex-col h-full">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 mb-5 aspect-[16/9]">
          <img src={imgUrl} alt={alt} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
        </div>

        <div className="relative flex items-start justify-between gap-3 mt-auto">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                {icon}
              </div>
              <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{desc}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-primary/60 shrink-0 mt-1 transition-transform duration-300 group-hover:translate-x-1" />
        </div>
      </div>
    </motion.div>
  );

  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noreferrer" className="block">
        {content}
      </a>
    );
  }

  return href ? <Link href={href}>{content}</Link> : content;
}

export default function Home() {
  const [linksOpen, setLinksOpen] = useState(false);
  const [links, setLinks] = useState(getStoredLinks);
  const [draft, setDraft] = useState(getStoredLinks);
  const [saved, setSaved] = useState(false);

  function openLinks() {
    setDraft(getStoredLinks());
    setLinksOpen(true);
    setSaved(false);
  }

  function saveLinks() {
    localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(draft));
    setLinks(draft);
    setSaved(true);
    setTimeout(() => setLinksOpen(false), 700);
  }

  const mainCards: PortalCardProps[] = [
    {
      href: "/portal/opportunities",
      imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/0217324d6_e6551bb4-354c-4267-bcc8-3a654f7d911a.png",
      alt: "Opportunity Intelligence",
      icon: <Search className="w-5 h-5 text-primary" />,
      title: "Opportunity Intelligence",
      desc: "Discover, track, and analyze contracting opportunities from SAM.gov, web intelligence sources, and configured procurement networks.",
      delay: 0.1,
    },
    {
      href: "/portal/clients",
      imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/3c37bc98d_ebb08cf5-f915-465a-9abe-6a5fd91d249b.png",
      alt: "Client Intelligence",
      icon: <Users className="w-5 h-5 text-primary" />,
      title: "Client Intelligence",
      desc: "Track client profiles, needs, patterns, priorities, decision-makers, and strategic insights.",
      delay: 0.2,
    },
    {
      href: "/portal/competitors",
      imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/4c56e7c63_725370ea-8900-4051-a09b-baf05e5d806b.png",
      alt: "Competitor Intelligence",
      icon: <Target className="w-5 h-5 text-primary" />,
      title: "Competitor Intelligence",
      desc: "Monitor competitors, capabilities, contract activity, positioning, and market threats.",
      delay: 0.3,
    },
    {
      href: "/portal/prospects",
      imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/cd3786710_2af8b45c-7f6e-4598-a2bd-564566d4892f.png",
      alt: "Prospect Intelligence",
      icon: <UserSearch className="w-5 h-5 text-primary" />,
      title: "Prospect Intelligence",
      desc: "Identify and track prospective employers, accounts, and organizations for business development.",
      delay: 0.4,
    },
    {
      href: "/portal/federal-agencies",
      imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/e2e3572a9_5ad3d8f9-d805-4fc2-8cb7-a8614edc9c0fcopy.png",
      alt: "Federal Agencies",
      icon: <Landmark className="w-5 h-5 text-primary" />,
      title: "Federal Agencies",
      desc: "Monitor federal agency health programs, contract vehicles, and procurement activity across DoD, VA, and civilian agencies.",
      delay: 0.5,
    },
    {
      href: "/portal/state-agencies",
      imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/02588225c_783f5460-1289-4bbd-a0ac-a9316906a45e.png",
      alt: "State Agencies",
      icon: <Map className="w-5 h-5 text-primary" />,
      title: "State Agencies",
      desc: "Track state-level health program procurement, workers' compensation, occupational health, and public agency opportunities.",
      delay: 0.6,
    },
  ];

  const extraCards: PortalCardProps[] = [
    {
      externalHref: links.outreach || undefined,
      imgUrl: outreachGalaxyButton,
      alt: "Outreach Intelligence",
      icon: <Network className="w-5 h-5 text-primary" />,
      title: "Outreach Intelligence",
      desc: "Look up employee contacts, org charts, and decision-makers across client and prospect organizations to power targeted outreach.",
      delay: 0.7,
    },
    {
      externalHref: links.relationship || undefined,
      imgUrl: relationshipPlanetButton,
      alt: "Relationship Intelligence",
      icon: <Users className="w-5 h-5 text-primary" />,
      title: "Relationship Intelligence",
      desc: "Unified view of clients and prospects — relationship status, tiers, branches, contacts, and opportunity signals in one place.",
      delay: 0.8,
    },
    {
      externalHref: links.hiringTrends || undefined,
      imgUrl: hiringCompassButton,
      alt: "Hiring Trend Intelligence",
      icon: <TrendingUp className="w-5 h-5 text-primary" />,
      title: "Hiring Trend Intelligence",
      desc: "Track hiring velocity, open roles, and workforce expansion signals across client and prospect organizations to identify needs early.",
      delay: 0.9,
    },
  ];

  return (
    <div className="min-h-screen w-full bg-background relative overflow-hidden p-5 md:p-8">
      <style>{`
        @keyframes home-orb1 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(70px,120px) scale(1.12); } 100% { transform: translate(0,0) scale(1); } }
        @keyframes home-orb2 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(-80px,-120px) scale(1.16); } 100% { transform: translate(0,0) scale(1); } }
        @keyframes home-pulse { 0%,100% { opacity:.50; transform: scale(1); } 50% { opacity:.85; transform: scale(1.16); } }
      `}</style>

      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div style={{ position: "absolute", top: "-12%", left: "-8%", width: "650px", height: "650px", borderRadius: "50%", background: "radial-gradient(circle at center, rgba(56,182,255,0.48) 0%, rgba(56,182,255,0.22) 35%, transparent 70%)", filter: "blur(42px)", animation: "home-orb1 24s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-6%", width: "750px", height: "750px", borderRadius: "50%", background: "radial-gradient(circle at center, rgba(30,140,255,0.54) 0%, rgba(80,200,255,0.24) 35%, transparent 70%)", filter: "blur(46px)", animation: "home-orb2 30s ease-in-out infinite", animationDelay: "-11s" }} />
        <div style={{ position: "absolute", top: "8%", right: "8%", width: "300px", height: "300px", borderRadius: "50%", background: "radial-gradient(circle at center, rgba(100,220,255,0.58) 0%, rgba(56,182,255,0.22) 40%, transparent 70%)", filter: "blur(28px)", animation: "home-pulse 10s ease-in-out infinite", animationDelay: "-3s" }} />
      </div>

      <header className="relative z-20 w-full max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <img
            src={LOGO_URL}
            alt="Occu-Med"
            className="w-[138px] sm:w-[150px] md:w-[164px] h-auto object-contain opacity-95"
            style={{ filter: "drop-shadow(0 0 16px rgba(255,255,255,0.20))" }}
          />
        </div>
        <button
          onClick={openLinks}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] text-white/35 hover:text-white/70 hover:border-white/20 hover:bg-white/[0.07] transition-all text-[11px] font-medium"
        >
          <Link2 className="w-3 h-3" />
          Links
        </button>
      </header>

      <AnimatePresence>
        {linksOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setLinksOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-[#0a1220] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary/70" />
                  <span className="text-sm font-semibold text-white/80">Portal Links</span>
                </div>
                <button onClick={() => setLinksOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {[
                  { key: "outreach" as const, label: "Outreach Intelligence", placeholder: "https://employee-lookup1.onrender.com" },
                  { key: "relationship" as const, label: "Relationship Intelligence", placeholder: "https://your-render-url.onrender.com" },
                  { key: "hiringTrends" as const, label: "Hiring Trend Intelligence", placeholder: "https://your-render-url.onrender.com" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] text-white/40 mb-1.5 font-medium">{field.label}</label>
                    <input
                      type="url"
                      value={draft[field.key]}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full text-xs bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-white/70 placeholder-white/20 focus:outline-none focus:border-primary/40 transition-colors"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={saveLinks} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-colors">
                  {saved ? <Check className="w-4 h-4" /> : null}
                  {saved ? "Saved!" : "Save Links"}
                </button>
                <button onClick={() => setLinksOpen(false)} className="px-4 py-2 text-sm text-white/30 hover:text-white/60 transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full max-w-7xl mx-auto pt-16 md:pt-20 pb-10">
        <motion.section
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className="text-center mb-14 md:mb-16"
        >
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white mb-6 tracking-tight">
            Insight <span className="text-gradient">Hub</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto font-light leading-relaxed">
            The strategic intelligence command center for Occu-Med — surfacing contracting opportunities, tracking client relationships, and mapping the competitive landscape.
          </p>
        </motion.section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...mainCards, ...extraCards].map((card) => (
            <PortalCard key={card.title} {...card} />
          ))}
        </section>

        <div className="mt-8 flex items-center justify-center text-xs text-white/25 gap-2">
          <ExternalLink className="w-3 h-3" />
          <span>Use Links to connect external intelligence tools.</span>
        </div>
      </main>
    </div>
  );
}
