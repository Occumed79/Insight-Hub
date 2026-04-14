import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Search, Users, Target, UserSearch, Landmark, Map } from "lucide-react";
import occuMedLogo from "@assets/OM-logo-150dpi_1774901578920.png";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-background relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Animated glowing orbs background */}
      <style>{`
        @keyframes home-orb1 {
          0%   { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(70px, 90px) scale(1.13); }
          50%  { transform: translate(20px, 160px) scale(0.90); }
          75%  { transform: translate(-50px, 70px) scale(1.07); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes home-orb2 {
          0%   { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(-90px, -70px) scale(1.18); }
          50%  { transform: translate(-40px, -130px) scale(0.87); }
          75%  { transform: translate(60px, -60px) scale(1.09); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes home-orb3 {
          0%   { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(110px, -90px) scale(1.22); }
          66%  { transform: translate(-70px, 70px) scale(0.84); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes home-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 0.90; transform: scale(1.18); }
        }
      `}</style>
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div style={{position:"absolute",top:"-12%",left:"-8%",width:"650px",height:"650px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(56,182,255,0.60) 0%, rgba(56,182,255,0.28) 35%, transparent 70%)",filter:"blur(40px)",animation:"home-orb1 22s ease-in-out infinite"}} />
        <div style={{position:"absolute",bottom:"-10%",right:"-6%",width:"750px",height:"750px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(30,140,255,0.65) 0%, rgba(80,200,255,0.30) 35%, transparent 70%)",filter:"blur(45px)",animation:"home-orb2 28s ease-in-out infinite",animationDelay:"-11s"}} />
        <div style={{position:"absolute",top:"28%",right:"12%",width:"480px",height:"480px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(0,200,220,0.50) 0%, rgba(56,182,255,0.22) 40%, transparent 70%)",filter:"blur(35px)",animation:"home-orb3 17s ease-in-out infinite",animationDelay:"-6s"}} />
        <div style={{position:"absolute",top:"5%",right:"8%",width:"300px",height:"300px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(100,220,255,0.75) 0%, rgba(56,182,255,0.35) 40%, transparent 70%)",filter:"blur(25px)",animation:"home-pulse 9s ease-in-out infinite",animationDelay:"-3s"}} />
        <div style={{position:"absolute",bottom:"12%",left:"6%",width:"380px",height:"380px",borderRadius:"50%",background:"radial-gradient(circle at center, rgba(30,100,255,0.55) 0%, rgba(56,182,255,0.25) 40%, transparent 70%)",filter:"blur(30px)",animation:"home-pulse 14s ease-in-out infinite",animationDelay:"-8s"}} />
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
