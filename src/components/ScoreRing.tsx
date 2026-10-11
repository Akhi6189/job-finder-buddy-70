import { cn } from "@/lib/utils";

export function ScoreRing({ score, size = 52 }: { score: number | null; size?: number }) {
  const stroke = size > 70 ? 7 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const val = score ?? 0;
  const tone = score == null ? "text-muted-foreground" : val >= 75 ? "text-success" : val >= 50 ? "text-warning" : "text-destructive";
  return (
    <div className={cn("relative shrink-0", tone)} style={{ width: size, height: size }} aria-label={`Resume score ${score ?? "unknown"}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * val) / 100}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center font-mono font-semibold text-foreground", size > 70 ? "text-xl" : "text-xs")}>
        {score == null ? "—" : val}
      </span>
    </div>
  );
}
