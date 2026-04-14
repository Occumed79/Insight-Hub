import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Search, Users, Target, UserSearch, Landmark, Map } from "lucide-react";
import occuMedLogo from "@assets/OM-logo-150dpi_1774901578920.png";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-background relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Background — animated glowing orbs */}
      <style>{`
        @keyframes home-drift-1 {
          0%   { transform: translate(0%, 0%)    scale(1);    opacity: 0.30; }
          33%  { transform: translate(5%, 10%)   scale(1.10); opacity: 0.40; }
          66%  { transform: translate(-5%, 4%)   scale(0.94); opacity: 0.22; }
          100% { transform: translate(0%, 0%)    scale(1);    opacity: 0.30; }
        }
        @keyframes home-drift-2 {
          0%   { transform: translate(0%, 0%)    scale(1);    opacity: 0.22; }
          33%  { transform: translate(-8%, -6%)  scale(1.12); opacity: 0.32; }
          66%  { transform: translate(6%, -9%)   scale(0.91); opacity: 0.14; }
          100% { transform: translate(0%, 0%)    scale(1);    opacity: 0.22; }
        }
        @keyframes home-drift-3 {
          0%   { transform: translate(0%, 0%)    scale(1);    opacity: 0.18; }
          50%  { transform: translate(9%, -7%)   scale(1.18); opacity: 0.28; }
          100% { transform: translate(0%, 0%)    scale(1);    opacity: 0.18; }
        }
        @keyframes home-pulse {
          0%, 100% { opacity: 0.10; }
          50%       { opacity: 0.20; }
        }
      `}</style>
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div style={{position:"absolute",top:"-25%",left:"-10%",width:"62%",height:"62%",borderRadius:"50%",background:"radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",filter:"blur(100px)",animation:"home-drift-1 20s ease-in-out infinite"}} />
        <div style={{position:"absolute",bottom:"-20%",right:"-8%",width:"52%",height:"67%",borderRadius:"50%",background:"radial-gradient(circle, hsl(var(--primary)) 0%, hsl(var(--accent)) 40%, transparent 70%)",filter:"blur(110px)",animation:"home-drift-2 25s ease-in-out infinite",animationDelay:"-9s"}} />
        <div style={{position:"absolute",top:"25%",right:"15%",width:"32%",height:"37%",borderRadius:"50%",background:"radial-gradient(circle, hsl(var(--accent)) 0%, hsl(var(--primary)) 50%, transparent 70%)",filter:"blur(80px)",animation:"home-drift-3 16s ease-in-out infinite",animationDelay:"-6s"}} />
        <div style={{position:"absolute",top:"55%",left:"30%",width:"27%",height:"27%",borderRadius:"50%",background:"radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",filter:"blur(70px)",animation:"home-pulse 11s ease-in-out infinite",animationDelay:"-4s"}} />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col items-center">
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center justify-center mb-8 bg-white rounded-2xl px-8 py-4 shadow-2xl shadow-black/30">
            <img src={occuMedLogo} alt="Occu-Med" className="h-14 w-auto object-contain" />
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
              img: "portal-opportunities.png",
              alt: "Opportunity Intelligence",
              icon: <Search className="w-5 h-5 text-primary-foreground" />,
              title: "Opportunity Intelligence",
              desc: "Discover, track, and analyze contracting opportunities from SAM.gov, web intelligence sources, and configured procurement networks.",
              delay: 0.1,
            },
            {
              href: "/portal/clients",
              img: "portal-clients.png",
              alt: "Client Intelligence",
              icon: <Users className="w-5 h-5 text-primary-foreground" />,
              title: "Client Intelligence",
              desc: "Track client profiles, needs, patterns, priorities, decision-makers, and strategic insights.",
              delay: 0.2,
            },
            {
              href: "/portal/competitors",
              img: "portal-competitors.png",
              alt: "Competitor Intelligence",
              icon: <Target className="w-5 h-5 text-primary-foreground" />,
              title: "Competitor Intelligence",
              desc: "Monitor competitors, capabilities, contract activity, positioning, and market threats.",
              delay: 0.3,
            },
            {
              href: "/portal/prospects",
              img: "portal-prospects.png",
              alt: "Prospect Intelligence",
              icon: <UserSearch className="w-5 h-5 text-primary-foreground" />,
              title: "Prospect Intelligence",
              desc: "Identify and track prospective employers, accounts, and organizations for business development.",
              delay: 0.4,
            },
            {
              href: "/portal/federal-agencies",
              img: "portal-federal.png",
              alt: "Federal Agencies",
              icon: <Landmark className="w-5 h-5 text-primary-foreground" />,
              title: "Federal Agencies",
              desc: "Monitor federal agency health programs, contract vehicles, and procurement activity across DoD, VA, and civilian agencies.",
              delay: 0.5,
            },
            {
              href: "/portal/state-agencies",
              img: "portal-states.png",
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
                  <div className="relative h-40 rounded-2xl overflow-hidden mb-4 border border-white/10">
                    <img
                      src={`${import.meta.env.BASE_URL}images/${card.img}`}
                      alt={card.alt}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-blue-950/50 mix-blend-multiply" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(207,72%,10%)]/60 to-transparent" />
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

        </div>
      </div>
    </div>
  );
}
