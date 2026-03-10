"use client";

type Point = { pointIndex: number; left: number; right: number };

export function PointProgressionChart({ data }: { data: Point[] }) {
  if (data.length < 2) return null;
  const maxScore = Math.max(21, ...data.flatMap((p) => [p.left, p.right]));
  const w = 280;
  const h = 120;
  const pad = { t: 8, r: 8, b: 24, l: 28 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * plotW;
  const yLeft = (v: number) => pad.t + plotH - (v / maxScore) * plotH;
  const yRight = (v: number) => pad.t + plotH - (v / maxScore) * plotH;

  const leftPoints = data.map((p, i) => `${x(i)},${yLeft(p.left)}`).join(" ");
  const rightPoints = data.map((p, i) => `${x(i)},${yRight(p.right)}`).join(" ");

  type Lead = "A" | "B" | "T";
  const leads: Lead[] = data.map((p) =>
    p.left > p.right ? "A" : p.right > p.left ? "B" : "T"
  );
  const scorers: ("A" | "B" | "N")[] = data.map((p, i) => {
    if (i === 0) return "N";
    const prev = data[i - 1];
    if (p.left > prev.left) return "A";
    if (p.right > prev.right) return "B";
    return "N";
  });

  // Determine run boundaries: a run is a maximal sequence with same (lead, scorer).
  const runEndIndices: number[] = [];
  let currentKey = `${leads[0]}-${scorers[0]}`;
  for (let i = 1; i < data.length; i++) {
    const key = `${leads[i]}-${scorers[i]}`;
    if (key !== currentKey) {
      runEndIndices.push(i - 1);
      currentKey = key;
    }
  }
  runEndIndices.push(data.length - 1);

  const labels: { x: number; y: number; text: string }[] = [];
  const usedXs: number[] = [];
  const minDx = 14; // px, to avoid overlap

  runEndIndices.forEach((idx) => {
    const p = data[idx];
    const lead = leads[idx];
    const baseX = x(idx);
    if (usedXs.some((ux) => Math.abs(ux - baseX) < minDx)) return;
    const above = lead !== "B";
    const yBase = above ? yLeft(p.left) - 4 : yRight(p.right) + 10;
    labels.push({ x: baseX, y: yBase, text: `${p.left}-${p.right}` });
    usedXs.push(baseX);
  });

  return (
    <div className="mx-4 my-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50 p-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full max-w-[280px]" preserveAspectRatio="xMidYMid meet">
        <line x1={pad.l} y1={pad.t + plotH} x2={pad.l + plotW} y2={pad.t + plotH} stroke="currentColor" strokeWidth="0.5" className="text-zinc-600" />
        <polyline points={leftPoints} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={rightPoints} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x={pad.l - 4} y={pad.t + 4} className="fill-[#3b82f6] text-[9px] font-semibold">A</text>
        <text x={pad.l - 4} y={pad.t + 14} className="fill-[#ef4444] text-[9px] font-semibold">B</text>
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.y}
            className="fill-zinc-50 text-[9px] drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
