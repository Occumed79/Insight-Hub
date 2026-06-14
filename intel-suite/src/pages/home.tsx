import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Search, Users, Target, UserSearch, Landmark, Map, Network, TrendingUp, ExternalLink } from "lucide-react";
import outreachGalaxyButton from "@/assets/portal-buttons/outreach-galaxy.png";
import relationshipPlanetButton from "@/assets/portal-buttons/relationship-planet.png";
import hiringCompassButton from "@/assets/portal-buttons/hiring-compass.png";
import occuMedLogoSrc from "@/assets/occu-med-logo.png";
const LOGO_URL = occuMedLogoSrc;

type PortalLinkKey = "outreach" | "relationship" | "hiringTrends";
type PortalLinks = Record<PortalLinkKey, string>;

const SHARED_PORTAL_LINKS: PortalLinks = {
  outreach: import.meta.env.VITE_OUTREACH_PORTAL_URL ?? "",
  relationship: import.meta.env.VITE_RELATIONSHIP_PORTAL_URL ?? "",
  hiringTrends: import.meta.env.VITE_HIRING_TRENDS_PORTAL_URL ?? "",
};

export default function Home() {
  const extraCards = [
    {
      key: "outreach",
      imgUrl: outreachGalaxyButton,
      alt: "Outreach Intelligence",
      icon: <Network className="w-5 h-5 text-primary-foreground" />,
      title: "Outreach Intelligence",
      desc: "Look up employee contacts, org charts, and decision-makers across client and prospect organizations to power targeted outreach.",
      delay: 0.7,
      link: SHARED_PORTAL_LINKS.outreach,
    },
    {
      key: "relationship",
      imgUrl: relationshipPlanetButton,
      alt: "Relationship Intelligence",
      icon: <Users className="w-5 h-5 text-primary-foreground" />,
      title: "Relationship Intelligence",
      desc: "Unified view of clients and prospects — relationship status, tiers, branches, contacts, and opportunity signals in one place.",
      delay: 0.8,
      link: SHARED_PORTAL_LINKS.relationship,
    },
    {
      key: "hiringTrends",
      imgUrl: hiringCompassButton,
      alt: "Hiring Trend Intelligence",
      icon: <TrendingUp className="w-5 h-5 text-primary-foreground" />,
      title: "Hiring Trend Intelligence",
      desc: "Track hiring velocity, open roles, and workforce expansion signals across client and prospect organizations to identify needs early.",
      delay: 0.9,
      link: SHARED_PORTAL_LINKS.hiringTrends,
    },
  ];

  return (
    <div className="min-h-screen w-full bg-background relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Animated glowing orbs background */}
      <style>{`
        @keyframes home-orb1 {
          0%   { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(160px, 170px) scale(1.16); }
          50%  { transform: translate(60px, 300px) scale(0.88); }
          75%  { transform: translate(-120px, 150px) scale(1.10); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes home-orb2 {
          0%   { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(-200px, -150px) scale(1.20); }
          50%  { transform: translate(-90px, -280px) scale(0.85); }
          75%  { transform: translate(140px, -120px) scale(1.12); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes home-orb3 {
          0%   { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(240px, -180px) scale(1.25); }
          66%  { transform: translate(-160px, 150px) scale(0.82); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes home-pulse {
          0%, 100% { opacity: 0.70; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.22); }
        }
      `}</style>
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div style={{position:"absolute",top:"-12%",left:"-8%",width:"650px",height:"650px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(56,182,255,0.80) 0%, rgba(56,182,255,0.40) 35%, transparent 70%)",filter:"blur(36px)",animation:"home-orb1 18s ease-in-out infinite",willChange:"transform"}} />
        <div style={{position:"absolute",bottom:"-10%",right:"-6%",width:"750px",height:"750px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(30,140,255,0.82) 0%, rgba(80,200,255,0.42) 35%, transparent 70%)",filter:"blur(40px)",animation:"home-orb2 22s ease-in-out infinite",animationDelay:"-11s",willChange:"transform"}} />
        <div style={{position:"absolute",top:"28%",right:"12%",width:"480px",height:"480px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(0,200,220,0.68) 0%, rgba(56,182,255,0.32) 40%, transparent 70%)",filter:"blur(32px)",animation:"home-orb3 14s ease-in-out infinite",animationDelay:"-6s",willChange:"transform"}} />
        <div style={{position:"absolute",top:"5%",right:"8%",width:"320px",height:"320px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(100,220,255,0.90) 0%, rgba(56,182,255,0.45) 40%, transparent 70%)",filter:"blur(22px)",animation:"home-pulse 9s ease-in-out infinite",animationDelay:"-3s",willChange:"transform, opacity"}} />
        <div style={{position:"absolute",bottom:"12%",left:"6%",width:"400px",height:"400px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(30,100,255,0.72) 0%, rgba(56,182,255,0.34) 40%, transparent 70%)",filter:"blur(26px)",animation:"home-pulse 13s ease-in-out infinite",animationDelay:"-8s",willChange:"transform, opacity"}} />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center justify-center mb-5">
            <img src={LOGO_URL} alt="Occu-Med" style={{ width: "320px", height: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 0 18px rgba(255,255,255,0.22))" }} />
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white mb-6 tracking-tight">
            Insight <span className="text-gradient">Hub</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
            The strategic intelligence command center for Occu-Med — surfacing contracting opportunities, tracking client relationships, and mapping the competitive landscape.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {[
            {
              href: "/portal/opportunities",
              imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/0217324d6_e6551bb4-354c-4267-bcc8-3a654f7d911a.png",
              alt: "Opportunity Intelligence",
              icon: <Search className="w-5 h-5 text-primary-foreground" />,
              title: "Opportunity Intelligence",
              desc: "Discover, track, and analyze contracting opportunities from SAM.gov, web intelligence sources, and configured procurement networks.",
              delay: 0.1,
            },
            {
              href: "/portal/clients",
              imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/3c37bc98d_ebb08cf5-f915-465a-9abe-6a5fd91d249b.png",
              alt: "Client Intelligence",
              icon: <Users className="w-5 h-5 text-primary-foreground" />,
              title: "Client Intelligence",
              desc: "Track client profiles, needs, patterns, priorities, decision-makers, and strategic insights.",
              delay: 0.2,
            },
            {
              href: "/portal/competitors",
              imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/4c56e7c63_725370ea-8900-4051-a09b-baf05e5d806b.png",
              alt: "Competitor Intelligence",
              icon: <Target className="w-5 h-5 text-primary-foreground" />,
              title: "Competitor Intelligence",
              desc: "Monitor competitors, capabilities, contract activity, positioning, and market threats.",
              delay: 0.3,
            },
            {
              href: "/portal/prospects",
              imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/cd3786710_2af8b45c-7f6e-4598-a2bd-564566d4892f.png",
              alt: "Prospect Intelligence",
              icon: <UserSearch className="w-5 h-5 text-primary-foreground" />,
              title: "Prospect Intelligence",
              desc: "Identify and track prospective employers, accounts, and organizations for business development.",
              delay: 0.4,
            },
            {
              href: "/portal/federal-agencies",
              imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/e2e3572a9_5ad3d8f9-d805-4fc2-8cb7-a8614edc9c0fcopy.png",
              alt: "Federal Agencies",
              icon: <Landmark className="w-5 h-5 text-primary-foreground" />,
              title: "Federal Agencies",
              desc: "Monitor federal agency health programs, contract vehicles, and procurement activity across DoD, VA, and civilian agencies.",
              delay: 0.5,
            },
            {
              href: "/portal/state-agencies",
              imgUrl: "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/02588225c_783f5460-1289-4bbd-a0ac-a9316906a45e.png",
              alt: "State Agencies",
              icon: <Map className="w-5 h-5 text-primary-foreground" />,
              title: "State Agencies",
              desc: "Track state-level health program procurement, workers' compensation contracts, and occupational health RFPs across all 50 states.",
              delay: 0.6,
            },
          ].map((card) => (
            <motion.div
              key={card.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: card.delay }}
            >
              <Link href={card.href} className="block h-full">
                <div className="h-full glass-card rounded-3xl p-1 group cursor-pointer relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative rounded-2xl overflow-hidden mb-4 border border-white/10">
                    <img
                      src={card.imgUrl}
                      alt={card.alt}
                      className="w-full h-auto object-contain transform group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(207,72%,10%)]/40 to-transparent" />
                    <div className="absolute top-4 left-4 glass-panel rounded-full p-2">
                      {card.icon}
                    </div>
                  </div>
                  <div className="px-5 pb-6">
                    <h3 className="text-xl font-display font-semibold text-white mb-2 flex items-center justify-between">
                      {card.title}
                      <ArrowRight className="w-5 h-5 text-primary opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {card.desc}
                    </p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}

          {/* 3 external portal cards sourced only from Render/Vite environment variables */}
          {extraCards.map((card) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: card.delay }}
            >
              {card.link ? (
                <a href={card.link} target="_blank" rel="noopener noreferrer" className="block h-full">
                  <div className="h-full glass-card rounded-3xl p-1 group cursor-pointer relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative rounded-2xl overflow-hidden mb-4 border border-white/10">
                      <img
                        src={card.imgUrl}
                        alt={card.alt}
                        className="w-full h-auto object-contain transform group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(207,72%,10%)]/40 to-transparent" />
                      <div className="absolute top-4 left-4 glass-panel rounded-full p-2">
                        {card.icon}
                      </div>
                      <div className="absolute top-4 right-4 glass-panel rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <ExternalLink className="w-3 h-3 text-primary-foreground/70" />
                      </div>
                    </div>
                    <div className="px-5 pb-6">
                      <h3 className="text-xl font-display font-semibold text-white mb-2 flex items-center justify-between">
                        {card.title}
                        <ArrowRight className="w-5 h-5 text-primary opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </a>
              ) : (
                <div className="block h-full cursor-not-allowed" title="Set this portal URL in Render environment variables.">
                  <div className="h-full glass-card rounded-3xl p-1 group relative overflow-hidden opacity-70">
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative rounded-2xl overflow-hidden mb-4 border border-white/10">
                      <img
                        src={card.imgUrl}
                        alt={card.alt}
                        className="w-full h-auto object-contain transform group-hover:scale-105 transition-transform duration-700 grayscale opacity-60"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(207,72%,10%)]/40 to-transparent" />
                      <div className="absolute top-4 left-4 glass-panel rounded-full p-2">
                        {card.icon}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[11px] text-white/50 bg-black/40 rounded-full px-3 py-1 border border-white/10">
                          Env var not set
                        </span>
                      </div>
                    </div>
                    <div className="px-5 pb-6">
                      <h3 className="text-xl font-display font-semibold text-white/60 mb-2 flex items-center justify-between">
                        {card.title}
                      </h3>
                      <p className="text-muted-foreground/60 text-sm leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}

        </div>
      </div>
    </div>
  );
}
