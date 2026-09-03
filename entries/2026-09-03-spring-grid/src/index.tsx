import { useState } from "react";
import { motion } from "motion/react";
import { useDialKit } from "dialkit";

// Deterministic per-cell noise so a "shuffle" is just bumping the seed.
function pseudoRandom(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function SpringGrid() {
  const p = useDialKit("Spring grid", {
    count: [36, 1, 100, 1],
    size: [44, 12, 120, 1],
    gap: [10, 0, 40, 1],
    stiffness: [260, 20, 800, 10],
    damping: [18, 1, 60, 1],
    hue: [265, 0, 360, 1],
  });

  const [seed, setSeed] = useState(0);
  const cells = Array.from({ length: Math.round(p.count) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <button
        onClick={() => setSeed((s) => s + 1)}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid #333",
          background: "#1e2027",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        shuffle
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: p.gap, maxWidth: 720 }}>
        {cells.map((_, i) => {
          const r = pseudoRandom(i + seed * 997);
          return (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 0.4 + r * 0.6, rotate: (r - 0.5) * 40 }}
              transition={{
                type: "spring",
                stiffness: p.stiffness,
                damping: p.damping,
                delay: r * 0.15,
              }}
              style={{
                width: p.size,
                height: p.size,
                borderRadius: 10,
                background: `hsl(${(p.hue + i * 4) % 360} 70% 60%)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
