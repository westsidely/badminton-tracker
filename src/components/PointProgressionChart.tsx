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

  const labels: { x: number; y: number; text: string }[] = [];
  let prevDiff: number | null = null;
  data.forEach((p, i) => {
    const diff = p.left - p.right;
    const shouldLabel =
      i === 0 ||
      (prevDiff !== null && Math.sign(diff) !== Math.sign(prevDiff)) ||
      (prevDiff !== null && Math.abs(diff) > Math.abs(prevDiff));
    if (shouldLabel) {
      labels.push({ x: x(i), y: yLeft(p.left) - 4, text: `${p.left}-${p.right}` });
      prevDiff = diff;
    }
  });

  return (
    <div className="mx-4 my-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50 p-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full max-w-[280px]" preserveAspectRatio="xMidYMid meet">
        <line x1={pad.l} y1={pad.t + plotH} x2={pad.l + plotW} y2={pad.t + plotH} stroke="currentColor" strokeWidth="0.5" className="text-zinc-600" />
        <polyline points={leftPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={rightPoints} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <text x={pad.l - 4} y={pad.t + 4} className="fill-[#3b82f6] text-[8px] font-medium">A</text>
        <text x={pad.l - 4} y={pad.t + 12} className="fill-[#ef4444] text-[8px] font-medium">B</text>
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.y}
            className="fill-zinc-400 text-[7px]"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
