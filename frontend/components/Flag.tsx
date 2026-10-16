import type { TeamCode } from "@/types/match";

// Accurate SVG flags drawn from the official specifications (both are 3:2).
// Inline SVG because Windows doesn't render flag emoji. Size them with a 3:2
// box, e.g. className="h-4 w-6".
export default function Flag({ team, className = "" }: { team: TeamCode; className?: string }) {
  const base = `inline-block shrink-0 overflow-hidden rounded-sm ring-1 ring-black/20 ${className}`;
  return team === "IND" ? <IndiaFlag className={base} /> : <PakistanFlag className={base} />;
}

// Three equal bands with the navy Ashoka Chakra (24 spokes) centred on the white.
function IndiaFlag({ className }: { className: string }) {
  return (
    <svg viewBox="-45 -30 90 60" className={className} role="img" aria-label="India">
      <rect x="-45" y="-30" width="90" height="60" fill="#fff" />
      <rect x="-45" y="-30" width="90" height="20" fill="#ff6820" />
      <rect x="-45" y="10" width="90" height="20" fill="#046a38" />
      <g fill="#07038d">
        <circle r="9.25" />
        <circle r="8" fill="#fff" />
        <circle r="1.6" />
        {Array.from({ length: 24 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 15})`}>
            <path d="M0-8L.3-3.19 0-.8-.3-3.19z" />
            <circle cy="-8" r="0.35" transform="rotate(7.5)" />
          </g>
        ))}
      </g>
    </svg>
  );
}

// White hoist band is 1/4 of the length. The crescent and star sit in the green
// field, along its diagonal from the top-right corner to the bottom-left.
const PAK_DIAGONAL = -41.63354; // that diagonal's angle, in degrees

function PakistanFlag({ className }: { className: string }) {
  return (
    <svg viewBox="-75 -40 120 80" className={className} role="img" aria-label="Pakistan">
      <rect x="-75" y="-40" width="120" height="80" fill="#fff" />
      <rect x="-45" y="-40" width="90" height="80" fill="#01411c" />
      {/* Crescent: a white disc with a slightly smaller green disc offset toward the corner. */}
      <circle r="24" fill="#fff" />
      <circle cx="-7" cy="-40" r="22" fill="#01411c" transform={`rotate(${PAK_DIAGONAL} 45 -40)`} />
      {/* Five-pointed star inside the crescent's opening. */}
      <polygon
        points="0,-8 4.702,6.472 -7.608,-2.472 7.608,-2.472 -4.702,6.472"
        fill="#fff"
        transform={`rotate(${PAK_DIAGONAL}) translate(16) rotate(18)`}
      />
    </svg>
  );
}
