import { cn } from "@/lib/utils";

interface MatchProgressBarProps {
  score: number | null | undefined;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function MatchProgressBar({
  score,
  className,
  showLabel = true,
  size = "md",
}: MatchProgressBarProps) {
  const isScored = score != null && !isNaN(score);
  const val = isScored ? Math.max(0, Math.min(100, Math.round(score!))) : 0;

  // Determine styling tier
  const tier = !isScored ? "unscored" : val >= 80 ? "high" : val >= 60 ? "medium" : "low";

  const barColor = {
    unscored: "bg-muted-foreground/30",
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-rose-500",
  }[tier];

  const textColor = {
    unscored: "text-muted-foreground",
    high: "text-emerald-600 dark:text-emerald-400 font-semibold",
    medium: "text-amber-600 dark:text-amber-400 font-semibold",
    low: "text-rose-600 dark:text-rose-400 font-semibold",
  }[tier];

  const label = {
    unscored: "Not evaluated",
    high: "Strong Fit",
    medium: "Moderate Fit",
    low: "Needs Tailoring",
  }[tier];

  const heightClass = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-3.5",
  }[size];

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">Resume Match</span>
            {isScored && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 text-[10px] font-medium uppercase tracking-wider",
                  tier === "high"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : tier === "medium"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                )}
              >
                {label}
              </span>
            )}
          </span>
          <span className={cn("font-mono text-xs tabular-nums", textColor)}>
            {isScored ? `${val}%` : "—"}
          </span>
        </div>
      )}

      {/* The Visual Progress Bar */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted/60 dark:bg-muted/40 p-0.5",
          heightClass,
        )}
        role="progressbar"
        aria-valuenow={val}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Resume match score ${isScored ? `${val}%` : "Not evaluated"}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out shadow-sm",
            barColor,
          )}
          style={{ width: isScored ? `${val}%` : "0%" }}
        />
      </div>
    </div>
  );
}
