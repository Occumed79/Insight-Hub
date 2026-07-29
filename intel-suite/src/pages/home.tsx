import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarRange,
  RefreshCcw,
  Search,
  Settings,
} from "lucide-react";
import occuMedLogoSrc from "@/assets/occu-med-logo.png";

const procurementPortals = [
  {
    href: "/portal/opportunities",
    imgUrl:
      "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/0217324d6_e6551bb4-354c-4267-bcc8-3a654f7d911a.png",
    alt: "Procurement Intelligence",
    icon: <Search className="h-5 w-5 text-primary-foreground" />,
    title: "Procurement Intelligence",
    desc: "Discover, verify, track, and manage active contracting opportunities from official procurement sources and configured RFP networks.",
    delay: 0.1,
  },
  {
    href: "/portal/forecast",
    imgUrl:
      "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/3c37bc98d_ebb08cf5-f915-465a-9abe-6a5fd91d249b.png",
    alt: "Procurement Forecast",
    icon: <CalendarRange className="h-5 w-5 text-primary-foreground" />,
    title: "Procurement Forecast",
    desc: "Track planned acquisitions, expected release windows, pre-solicitation notices, and agency buying signals before opportunities are posted.",
    delay: 0.2,
  },
  {
    href: "/portal/recompete-watch",
    imgUrl:
      "https://media.base44.com/images/public/69dcaa5f2cdb34ef76b60740/4c56e7c63_725370ea-8900-4051-a09b-baf05e5d806b.png",
    alt: "Recompete Watch",
    icon: <RefreshCcw className="h-5 w-5 text-primary-foreground" />,
    title: "Recompete Watch",
    desc: "Monitor expiring contracts, incumbent positions, option periods, and likely recompetes so Occu-Med can prepare before the next solicitation opens.",
    delay: 0.3,
  },
];

function OccuMedHeroLogo() {
  return (
    <div className="mb-[-18px] flex justify-center" aria-label="Occu-Med">
      <img
        src={occuMedLogoSrc}
        alt="Occu-Med"
        className="h-auto w-[430px] drop-shadow-[0_0_38px_rgba(255,255,255,0.28)]"
      />
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-4">
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
        <div
          style={{
            position: "absolute",
            top: "-12%",
            left: "-8%",
            width: "650px",
            height: "650px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at center, rgba(56,182,255,0.80) 0%, rgba(56,182,255,0.40) 35%, transparent 70%)",
            filter: "blur(36px)",
            animation: "home-orb1 18s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-6%",
            width: "750px",
            height: "750px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at center, rgba(30,140,255,0.82) 0%, rgba(80,200,255,0.42) 35%, transparent 70%)",
            filter: "blur(40px)",
            animation: "home-orb2 22s ease-in-out infinite",
            animationDelay: "-11s",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "28%",
            right: "12%",
            width: "480px",
            height: "480px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at center, rgba(0,200,220,0.68) 0%, rgba(56,182,255,0.32) 40%, transparent 70%)",
            filter: "blur(32px)",
            animation: "home-orb3 14s ease-in-out infinite",
            animationDelay: "-6s",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "5%",
            right: "8%",
            width: "320px",
            height: "320px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at center, rgba(100,220,255,0.90) 0%, rgba(56,182,255,0.45) 40%, transparent 70%)",
            filter: "blur(22px)",
            animation: "home-pulse 9s ease-in-out infinite",
            animationDelay: "-3s",
            willChange: "transform, opacity",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "12%",
            left: "6%",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at center, rgba(30,100,255,0.72) 0%, rgba(56,182,255,0.34) 40%, transparent 70%)",
            filter: "blur(26px)",
            animation: "home-pulse 13s ease-in-out infinite",
            animationDelay: "-8s",
            willChange: "transform, opacity",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mb-14 text-center"
        >
          <OccuMedHeroLogo />
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-white md:text-7xl">
            Insight <span className="text-gradient">Hub</span>
          </h1>
          <p className="mx-auto max-w-3xl text-lg font-light leading-relaxed text-muted-foreground md:text-xl">
            Occu-Med&apos;s procurement intelligence workspace for active opportunities, acquisition forecasts, and upcoming contract recompetes.
          </p>
        </motion.div>

        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
          {procurementPortals.map((card) => (
            <motion.div
              key={card.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: card.delay }}
            >
              <Link href={card.href} className="block h-full">
                <div className="glass-card group relative h-full cursor-pointer overflow-hidden rounded-3xl p-1">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/10">
                    <img
                      src={card.imgUrl}
                      alt={card.alt}
                      className="h-auto w-full object-contain transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(207,72%,10%)]/40 to-transparent" />
                    <div className="glass-panel absolute left-4 top-4 rounded-full p-2">{card.icon}</div>
                  </div>
                  <div className="px-5 pb-6">
                    <h2 className="mb-2 flex items-center justify-between text-xl font-semibold text-white">
                      {card.title}
                      <ArrowRight className="h-5 w-5 -translate-x-4 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-8"
        >
          <Link
            href="/portal/settings"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/65 backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            Procurement Sources, Adapters, Integrations &amp; Ingestion Health
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
