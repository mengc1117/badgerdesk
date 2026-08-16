'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveMap, Spot } from '@/lib/types';
import { boundsOf, crowdColor, crowdWord, makeProjector } from '@/lib/ui';

const W = 1400;
const H = 620;

type Node = { spot: Spot; x: number; y: number; crowd: number | null; fresh: boolean; delay: number };

/** Hero visual: all spots projected from real coordinates, colored by live crowd level. */
export function Constellation({ spots, live }: { spots: Spot[]; live: LiveMap }) {
  const [hover, setHover] = useState<Node | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<SVGGElement>(null);

  const { nodes, links } = useMemo(() => {
    const project = makeProjector(boundsOf(spots), W, H, 0.1);

    const nodes: Node[] = spots.map((spot, i) => {
      const [x, y] = project(spot.lat, spot.lng);
      const l = live[spot.id]?.live;
      return {
        spot,
        x,
        y,
        crowd: l?.crowd ?? null,
        fresh: (l?.conf ?? 0) >= 0.6,
        delay: (i % 13) * 0.075 + Math.floor(i / 13) * 0.12,
      };
    });

    // Link each node to its two nearest neighbors (deduped) for a sparse mesh
    const seen = new Set<string>();
    const links: { a: Node; b: Node }[] = [];
    for (const n of nodes) {
      const near = nodes
        .filter((m) => m !== n)
        .map((m) => ({ m, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 2);
      for (const { m } of near) {
        const key = [n.spot.id, m.spot.id].sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ a: n, b: m });
      }
    }
    return { nodes, links };
  }, [spots, live]);

  useEffect(() => setMounted(true), []);

  // Pointer parallax via ref-mutated transform (no per-frame re-render)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        if (parallaxRef.current) {
          parallaxRef.current.style.transform = `translate(${(-dx * 26).toFixed(2)}px, ${(-dy * 16).toFixed(2)}px)`;
        }
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        style={{ opacity: mounted ? 1 : 0, transition: 'opacity 1.2s ease' }}
      >
        <defs>
          <radialGradient id="glow" cx="50%" cy="46%" r="62%">
            <stop offset="0%" stopColor="oklch(0.62 0.14 42)" stopOpacity="0.3" />
            <stop offset="55%" stopColor="oklch(0.4 0.09 38)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="oklch(0.145 0.014 62)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="shore" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.6 0.06 220)" stopOpacity="0" />
            <stop offset="45%" stopColor="oklch(0.62 0.07 220)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="oklch(0.6 0.06 220)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.85 0.13 40)" stopOpacity="0" />
            <stop offset="50%" stopColor="oklch(0.85 0.13 40)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="oklch(0.85 0.13 40)" stopOpacity="0" />
          </linearGradient>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#glow)" />

        {/* Abstract Lake Mendota shoreline */}
        <path
          d={`M -40 ${H * 0.2} C ${W * 0.24} ${H * 0.06}, ${W * 0.56} ${H * 0.15}, ${W + 40} ${H * 0.03}`}
          fill="none"
          stroke="url(#shore)"
          strokeWidth="1.5"
        />

        <g ref={parallaxRef} style={{ transition: 'transform 0.5s cubic-bezier(.16,1,.3,1)' }}>
          {/* mesh lines */}
          <g stroke="oklch(0.72 0.03 60)" strokeWidth="0.7" opacity={mounted ? 0.16 : 0} style={{ transition: 'opacity 1.8s ease 0.4s' }}>
            {links.map(({ a, b }, i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </g>

          {nodes.map((n) => {
            const known = n.crowd !== null;
            const color = crowdColor(n.crowd);
            return (
              <g
                key={n.spot.id}
                style={{ animation: `rise 0.8s cubic-bezier(.16,1,.3,1) ${n.delay}s both` }}
                onPointerEnter={() => setHover(n)}
                onPointerLeave={() => setHover((h) => (h === n ? null : h))}
                className="pointer-events-auto cursor-default"
              >
                {/* enlarged hit area */}
                <circle cx={n.x} cy={n.y} r={16} fill="transparent" />

                {known && n.fresh && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={7}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.2"
                    style={{ transformOrigin: `${n.x}px ${n.y}px`, animation: `pulse-ring 3.4s ease-out ${n.delay + 0.6}s infinite` }}
                  />
                )}

                {known ? (
                  <>
                    <circle cx={n.x} cy={n.y} r={9} fill={color} opacity="0.28" filter="url(#soft)" />
                    <circle cx={n.x} cy={n.y} r={hover === n ? 6.5 : 4.6} fill={color} style={{ transition: 'r .18s ease' }} />
                  </>
                ) : (
                  /* Unknown: dashed neutral circle */
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={hover === n ? 7 : 5.4}
                    fill="none"
                    stroke="oklch(0.66 0.012 260)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    style={{ transition: 'r .18s ease', animation: 'dash-march 24s linear infinite' }}
                  />
                )}
              </g>
            );
          })}

          {hover && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={hover.x} y1={hover.y} x2={hover.x} y2={hover.y - 26} stroke="oklch(0.8 0.02 60)" strokeWidth="0.8" opacity="0.5" />
              <text
                x={hover.x}
                y={hover.y - 34}
                textAnchor="middle"
                fill="oklch(0.96 0.01 80)"
                fontSize="15"
                style={{ fontFamily: 'var(--font-body)', paintOrder: 'stroke', stroke: 'oklch(0.145 0.014 62)', strokeWidth: 5 }}
              >
                {hover.spot.name}
              </text>
              <text
                x={hover.x}
                y={hover.y - 15}
                textAnchor="middle"
                fill={hover.crowd === null ? 'oklch(0.66 0.012 260)' : crowdColor(hover.crowd)}
                fontSize="13"
                style={{ fontFamily: 'var(--font-body)', paintOrder: 'stroke', stroke: 'oklch(0.145 0.014 62)', strokeWidth: 5 }}
              >
                {crowdWord(hover.crowd)}
              </text>
            </g>
          )}
        </g>

        {/* slow sweeping highlight */}
        <rect
          x="-300"
          y="0"
          width="220"
          height={H}
          fill="url(#sweepGrad)"
          opacity="0.5"
          style={{ animation: 'sweep 14s ease-in-out infinite' }}
        />
      </svg>
    </div>
  );
}
