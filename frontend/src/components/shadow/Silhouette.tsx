// Anonymous athletic silhouette — genderless, in a ready stance.
export function Silhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 700"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      aria-hidden
    >
      <g fill="#000000">
        {/* Head */}
        <ellipse cx="200" cy="90" rx="42" ry="50" />
        {/* Neck */}
        <rect x="188" y="130" width="24" height="22" />
        {/* Torso — athletic, slightly forward */}
        <path d="M140 155 Q200 145 260 155 L275 320 Q200 340 125 320 Z" />
        {/* Left arm — bent, ready */}
        <path d="M140 165 Q105 200 95 270 Q92 300 110 320 L130 315 Q118 285 122 255 Q130 215 155 195 Z" />
        {/* Right arm — extended slightly */}
        <path d="M260 165 Q295 200 310 275 Q314 305 300 330 L280 325 Q290 295 285 265 Q278 220 250 198 Z" />
        {/* Hips */}
        <path d="M130 320 L270 320 L280 380 L120 380 Z" />
        {/* Left leg — bent, athletic stance */}
        <path d="M135 380 Q120 470 130 560 Q132 620 150 680 L185 680 Q175 625 178 565 Q182 470 175 380 Z" />
        {/* Right leg — back foot */}
        <path d="M225 380 Q220 470 230 560 Q235 620 255 680 L290 680 Q278 625 280 565 Q282 470 265 380 Z" />
      </g>
    </svg>
  );
}
