import { cn } from "@/lib/utils";

function parseSize(s: number | "sm" | "md" | "lg" | string | undefined | null): number {
  if (typeof s === "number" && !isNaN(s) && s > 0) return s;
  if (s === "sm") return 36;
  if (s === "md") return 52;
  if (s === "lg") return 84;
  if (typeof s === "string") {
    const parsed = parseFloat(s);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 52;
}

export function ScoreRing({
  score,
  size = 52,
  showPercent = false,
}: {
  score: number | null | undefined;
  size?: number | "sm" | "md" | "lg" | string;
  showPercent?: boolean;
}) {
  const numericSize = parseSize(size);
  const stroke = numericSize > 70 ? 7 : 5;
  const r = Math.max(1, (numericSize - stroke) / 2);
  const c = 2 * Math.PI * r;
  const isScored = score != null && typeof score === "number" && !isNaN(score);
  const val = isScored ? Math.max(0, Math.min(100, Math.round(score))) : 0;

  const tone = !isScored
    ? "text-muted-foreground"
    : val >= 75
      ? "text-emerald-500"
      : val >= 50
        ? "text-amber-500"
        : "text-rose-500";

  const safeDashOffset = isScored ? Math.max(0, c - (c * val) / 100) : c;

  return (
    <div
      className={cn("relative shrink-0 flex items-center justify-center", tone)}
      style={{ width: numericSize, height: numericSize }}
      aria-label={`Resume circular match score: ${isScored ? `${val}%` : "Not evaluated"}`}
      title={isScored ? `Resume Match: ${val}%` : "Not scored against your resume yet"}
    >
      <svg width={numericSize} height={numericSize} className="-rotate-90">
        <circle
          cx={numericSize / 2}
          cy={numericSize / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
        />
        <circle
          cx={numericSize / 2}
          cy={numericSize / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={safeDashOffset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center font-mono font-bold text-foreground leading-none",
          numericSize > 70 ? "text-xl" : "text-xs",
        )}
      >
        <span>{!isScored ? "—" : val}</span>
        {(showPercent || numericSize > 70) && isScored && (
          <span className="text-[9px] font-sans font-normal text-muted-foreground mt-0.5">%</span>
        )}
      </div>
    </div>
  );
}
