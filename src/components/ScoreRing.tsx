import { cn } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 52,
  showPercent = false,
}: {
  score: number | null | undefined;
  size?: number;
  showPercent?: boolean;
}) {
  const stroke = size > 70 ? 7 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const isScored = score != null && !isNaN(score);
  const val = isScored ? Math.max(0, Math.min(100, Math.round(score!))) : 0;

  const tone = !isScored
    ? "text-muted-foreground"
    : val >= 75
      ? "text-emerald-500"
      : val >= 50
        ? "text-amber-500"
        : "text-rose-500";

  return (
    <div
      className={cn("relative shrink-0 flex items-center justify-center", tone)}
      style={{ width: size, height: size }}
      aria-label={`Resume circular match score: ${isScored ? `${val}%` : "Not evaluated"}`}
      title={isScored ? `Resume Match: ${val}%` : "Not scored against your resume yet"}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={isScored ? c - (c * val) / 100 : c}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center font-mono font-bold text-foreground leading-none",
          size > 70 ? "text-xl" : "text-xs",
        )}
      >
        <span>{!isScored ? "—" : val}</span>
        {(showPercent || size > 70) && isScored && (
          <span className="text-[9px] font-sans font-normal text-muted-foreground mt-0.5">%</span>
        )}
      </div>
    </div>
  );
}
