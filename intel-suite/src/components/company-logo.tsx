import { useState } from "react";

function extractDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function makeInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const BG_COLORS = [
  "from-primary/40 to-primary/20",
  "from-violet-500/40 to-violet-500/20",
  "from-cyan-500/40 to-cyan-500/20",
  "from-emerald-500/40 to-emerald-500/20",
  "from-amber-500/40 to-amber-500/20",
  "from-rose-500/40 to-rose-500/20",
];

function colorIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % BG_COLORS.length;
}

export function CompanyLogo({
  name,
  website,
  size = 40,
  rounded = "rounded-xl",
}: {
  name: string;
  website?: string | null;
  size?: number;
  rounded?: string;
}) {
  const domain = extractDomain(website);
  const initials = makeInitials(name);
  const grad = BG_COLORS[colorIndex(name)];

  const sources = domain
    ? [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      ]
    : [];

  const [attempt, setAttempt] = useState(0);
  const src = sources[attempt];

  const avatarStyle = {
    width: size,
    height: size,
    minWidth: size,
    fontSize: Math.round(size * 0.36),
  };

  if (!src) {
    return (
      <div
        className={`flex-shrink-0 ${rounded} bg-gradient-to-br ${grad} border border-white/15 flex items-center justify-center font-bold text-white select-none`}
        style={avatarStyle}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      key={attempt}
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className={`flex-shrink-0 ${rounded} object-contain bg-white/8 border border-white/10`}
      style={{ width: size, height: size }}
      onError={() => {
        if (attempt + 1 < sources.length) {
          setAttempt((a) => a + 1);
        } else {
          setAttempt(sources.length);
        }
      }}
    />
  );
}

export function AgencyLogo({
  domain,
  label,
  size = 20,
}: {
  domain: string;
  label: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt={label}
      width={size}
      height={size}
      className="rounded object-contain flex-shrink-0"
      style={{ width: size, height: size, imageRendering: "auto" }}
      onError={() => setFailed(true)}
    />
  );
}
