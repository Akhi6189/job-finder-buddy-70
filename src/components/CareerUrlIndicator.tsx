import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle, Sparkles } from "lucide-react";
import { getCareerUrlStatus, type CareerUrlStatusInfo } from "@/lib/career-url-helper";

interface CareerUrlIndicatorProps {
  url: string | null | undefined;
  companyName?: string;
  compact?: boolean;
  showFixButton?: boolean;
  onFix?: () => void;
  isFixing?: boolean;
}

export function CareerUrlIndicator({
  url,
  companyName,
  compact = false,
  showFixButton = false,
  onFix,
  isFixing = false,
}: CareerUrlIndicatorProps) {
  const status: CareerUrlStatusInfo = getCareerUrlStatus(url);

  if (compact) {
    if (status.isCanonical) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          title={status.tooltip}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>{status.detectedAts ? `${status.detectedAts}` : "Canonical"}</span>
        </span>
      );
    }

    if (status.isSearch) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400"
          title={status.tooltip}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Search query</span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title={status.tooltip}
      >
        <HelpCircle className="h-3 w-3 shrink-0" />
        <span>No link</span>
      </span>
    );
  }

  // Full Badge Display
  if (status.isCanonical) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 shadow-2xs"
        title={status.tooltip}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>{status.badgeLabel}</span>
      </span>
    );
  }

  if (status.isSearch) {
    return (
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40 shadow-2xs animate-pulse"
          title={status.tooltip}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{status.badgeLabel}</span>
        </span>

        {showFixButton && onFix && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFix();
            }}
            disabled={isFixing}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline hover:text-primary/90 focus:outline-hidden disabled:opacity-50"
            title={`Use Search API to find canonical career page for ${companyName || "company"}`}
          >
            <Sparkles className={`h-3 w-3 text-primary ${isFixing ? "animate-spin" : ""}`} />
            <span>{isFixing ? "Locating..." : "Auto-fix to canonical"}</span>
          </button>
        )}
      </div>
    );
  }

  if (status.isMissing) {
    return (
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border"
          title={status.tooltip}
        >
          <HelpCircle className="h-3 w-3 shrink-0" />
          <span>No Career URL</span>
        </span>

        {showFixButton && onFix && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFix();
            }}
            disabled={isFixing}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline hover:text-primary/90 focus:outline-hidden disabled:opacity-50"
            title={`Use Search API to find canonical career page for ${companyName || "company"}`}
          >
            <Sparkles className={`h-3 w-3 text-primary ${isFixing ? "animate-spin" : ""}`} />
            <span>{isFixing ? "Locating..." : "Find portal"}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
      title={status.tooltip}
    >
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>{status.badgeLabel}</span>
    </span>
  );
}
