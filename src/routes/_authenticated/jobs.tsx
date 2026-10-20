import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ExternalLink,
  MapPin,
  RefreshCw,
  CheckCircle2,
  Undo2,
  Sparkles,
  Bookmark,
  AlertCircle,
  Copy,
  Download,
  ShieldCheck,
  ArrowRight,
  FileText,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { daysSince, isRemote, getExactJobPostingUrl, type Job } from "@/lib/data";
import { scanCompany, rescoreJob, rescoreAllJobs, tailorResumeForJob } from "@/lib/jobs.functions";
import { saveOrUpdateFromJob } from "@/lib/applications";
import { ScoreRing } from "@/components/ScoreRing";
import { MatchProgressBar } from "@/components/MatchProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Open roles — RoleRadar" },
      { name: "description", content: "Open roles found at your target companies." },
      { property: "og:title", content: "Open roles — RoleRadar" },
      { property: "og:description", content: "Open roles found at your target companies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const qc = useQueryClient();
  const scan = useServerFn(scanCompany);
  const scoreAll = useServerFn(rescoreAllJobs);
  const rescore = useServerFn(rescoreJob);
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const [tailorTarget, setTailorTarget] = useState<Job | null>(null);
  const [isScoringAll, setIsScoringAll] = useState(false);
  const [scoringSingleId, setScoringSingleId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(
    null,
  );

  async function handleScoreSingle(job: Job) {
    setScoringSingleId(job.id);
    try {
      const r = await rescore({ data: { jobId: job.id } });
      toast.success(`Scored: ${r.score}% resume match`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scoring failed");
    }
    setScoringSingleId(null);
  }

  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, companies(name)")
        .order("first_seen_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Job[];
    },
  });

  const list = useMemo(() => {
    let l = (jobs.data ?? []).filter((j) => !j.closed_at || j.status === "applied");
    if (tab === "open") l = l.filter((j) => j.status !== "applied");
    if (tab === "applied") l = l.filter((j) => j.status === "applied");
    if (loc.trim()) {
      const s = loc.trim().toLowerCase();
      l = l.filter((j) => (j.location ?? "").toLowerCase().includes(s));
    }
    if (remoteOnly) l = l.filter(isRemote);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter(
        (j) => j.title.toLowerCase().includes(s) || j.companies?.name.toLowerCase().includes(s),
      );
    }
    return tab === "open" ? [...l].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) : l;
  }, [jobs.data, tab, q, loc, remoteOnly]);

  const counts = {
    open: (jobs.data ?? []).filter((j) => j.status !== "applied" && !j.closed_at).length,
    applied: (jobs.data ?? []).filter((j) => j.status === "applied").length,
  };

  const unscoredCount = useMemo(() => {
    return (jobs.data ?? []).filter((j) => j.score == null).length;
  }, [jobs.data]);

  async function handleScoreAll() {
    setIsScoringAll(true);
    try {
      const r = await scoreAll();
      toast.success(`Scored ${r.scored} roles against your resume.`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scoring failed");
    }
    setIsScoringAll(false);
  }

  async function scanAll() {
    const { data: tracked } = await supabase
      .from("tracked_companies")
      .select("id, companies(name)");
    if (!tracked?.length) {
      toast.info("Add some companies first.");
      return;
    }

    // Clear previous unapplied roles immediately so stale cached results disappear on fresh scan
    await supabase.from("jobs").delete().neq("status", "applied");
    qc.setQueryData<Job[]>(["jobs"], (old) => (old ?? []).filter((j) => j.status === "applied"));
    qc.invalidateQueries({ queryKey: ["jobs"] });

    let added = 0;
    const failed: string[] = [];
    for (let i = 0; i < tracked.length; i++) {
      const name = (tracked[i]!.companies as { name?: string } | null)?.name ?? "";
      setProgress({ done: i, total: tracked.length, name });
      const r = await scan({ data: { trackedId: tracked[i]!.id } }).catch((e) => ({
        ok: false as const,
        error: String(e),
      }));
      if (r.ok) {
        added += r.added;
      } else {
        failed.push(name);
      }
      qc.invalidateQueries({ queryKey: ["jobs"] });
      // Minor pacing delay so requests stay within API thresholds
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    setProgress(null);
    toast.success(`Fresh scan finished: ${added} role${added === 1 ? "" : "s"} found.`, {
      description: failed.length
        ? `Couldn't read: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`
        : undefined,
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-mono">Radar</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Open roles</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unscoredCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleScoreAll} disabled={isScoringAll}>
              <Sparkles
                className={`h-4 w-4 mr-1 text-primary ${isScoringAll ? "animate-spin" : ""}`}
              />
              {isScoringAll ? "Scoring…" : `Score all roles (${unscoredCount})`}
            </Button>
          )}
          <Button variant="ink" onClick={scanAll} disabled={!!progress}>
            <RefreshCw className={progress ? "animate-spin" : ""} />
            {progress ? `Scanning ${progress.done + 1}/${progress.total}` : "Scan now"}
          </Button>
        </div>
      </div>
      {progress && (
        <div className="mt-4 rounded-lg border bg-card p-3 text-sm">
          <div className="flex justify-between font-medium">
            <span>Scanning {progress.name}…</span>
            <span className="font-mono text-muted-foreground">
              {progress.done + 1} / {progress.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${((progress.done + 1) / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="open">Open roles ({counts.open})</TabsTrigger>
            <TabsTrigger value="applied">Applied ({counts.applied})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          placeholder="Search role or company"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs bg-card"
        />
        <Input
          placeholder="Location, e.g. Bengaluru"
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          className="max-w-[200px] bg-card"
        />
        <Button
          variant={remoteOnly ? "ink" : "outline"}
          size="sm"
          onClick={() => setRemoteOnly((v) => !v)}
        >
          {remoteOnly ? "✓ " : ""}Remote only
        </Button>
      </div>

      {jobs.isLoading ? (
        <p className="mt-10 text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-semibold">No roles here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add companies on the{" "}
            <Link to="/companies" className="text-primary underline">
              Companies
            </Link>{" "}
            page, then press Scan now.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((j) => (
            <div
              key={j.id}
              onClick={() => setSelected(j)}
              className={`group relative flex flex-col justify-between rounded-xl border bg-card p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift cursor-pointer ${j.closed_at ? "opacity-70" : ""}`}
            >
              <div className="space-y-2.5">
                {/* Header: Company Name & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block truncate">
                      {j.companies?.name || "Company"}
                    </span>
                    <h3 className="font-bold text-base leading-snug text-foreground mt-0.5 line-clamp-2">
                      {j.title}
                    </h3>
                  </div>
                  {j.status === "applied" ? (
                    <Badge className="bg-success/15 text-success hover:bg-success/15 shrink-0 text-xs font-medium">
                      Applied
                    </Badge>
                  ) : isRemote(j) ? (
                    <Badge variant="outline" className="text-[10px] shrink-0 font-normal">
                      Remote
                    </Badge>
                  ) : null}
                </div>

                {/* Location & Experience Meta */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {j.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" /> {j.location}
                    </span>
                  )}
                  {j.experience && <span>• {j.experience}</span>}
                  <span>• {daysSince(j.first_seen_at)}d ago</span>
                </div>

                {/* PROGRESS BAR SECTION (Point 1) */}
                {j.status !== "applied" && (
                  <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5">
                    <MatchProgressBar score={j.score} size="md" />
                    {j.score == null && (
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <span className="text-muted-foreground text-[11px]">Unscored role</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleScoreSingle(j);
                          }}
                          disabled={scoringSingleId === j.id}
                        >
                          <Sparkles
                            className={`h-3 w-3 mr-1 text-primary ${scoringSingleId === j.id ? "animate-spin" : ""}`}
                          />
                          {scoringSingleId === j.id ? "Scoring…" : "Score fit"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* MISSING SKILLS / KEYWORDS BADGES (Point 4) */}
                {j.missing_skills && j.missing_skills.length > 0 && j.status !== "applied" && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-destructive uppercase tracking-wider">
                      <AlertCircle className="h-3 w-3 shrink-0" /> Missing Keywords (Lowers Score):
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {j.missing_skills.slice(0, 4).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="border-destructive/30 bg-destructive/5 text-destructive text-[10px] px-1.5 py-0 font-normal"
                        >
                          + {s}
                        </Badge>
                      ))}
                      {j.missing_skills.length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{j.missing_skills.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* MATCHED SKILLS BADGES */}
                {j.matched_skills && j.matched_skills.length > 0 && j.status !== "applied" && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-success uppercase tracking-wider">
                      <CheckCircle2 className="h-3 w-3 shrink-0" /> Matched Skills:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {j.matched_skills.slice(0, 3).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="border-success/30 bg-success/5 text-success text-[10px] px-1.5 py-0 font-normal"
                        >
                          ✓ {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* CARD ACTION FOOTER */}
              <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(j)}
                >
                  Details
                </Button>

                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" asChild>
                    <a
                      href={getExactJobPostingUrl(j)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open exact job posting in new tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> View posting
                    </a>
                  </Button>

                  {j.status !== "applied" && (
                    <Button
                      size="sm"
                      className="h-8 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTailorTarget(j);
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Rebuild
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <JobSheet
        job={selected}
        onClose={() => setSelected(null)}
        onChange={(j) => setSelected(j)}
        onTailor={(j) => setTailorTarget(j)}
      />

      <TailorResumeDialog
        job={tailorTarget}
        open={!!tailorTarget}
        onClose={() => setTailorTarget(null)}
      />
    </div>
  );
}

function JobSheet({
  job,
  onClose,
  onChange,
  onTailor,
}: {
  job: Job | null;
  onClose: () => void;
  onChange: (j: Job) => void;
  onTailor: (j: Job) => void;
}) {
  const qc = useQueryClient();
  const rescore = useServerFn(rescoreJob);
  const [busy, setBusy] = useState(false);

  async function setApplied(applied: boolean) {
    if (!job) return;
    const patch = {
      status: applied ? "applied" : "open",
      applied: applied,
    };
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange({ ...job, ...patch });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    if (applied) {
      saveOrUpdateFromJob({
        id: job.id,
        title: job.title,
        companyName: job.companies?.name || "Company",
        url: job.url,
        location: job.location,
        score: job.score,
        status: "applied",
        appliedDate: new Date().toISOString().slice(0, 10),
      });
    }
    toast.success(applied ? "Marked as applied & added to Tracker" : "Moved back to not applied");
  }

  async function doRescore() {
    if (!job) return;
    setBusy(true);
    try {
      const r = await rescore({ data: { jobId: job.id } });
      onChange({
        ...job,
        score: r.score,
        score_summary: r.summary,
        matched_skills: r.matched,
        missing_skills: r.missing,
      });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Score updated: ${r.score}% match`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not score");
    }
    setBusy(false);
  }

  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {job && (
          <>
            <SheetHeader>
              <div className="label-mono">{job.companies?.name}</div>
              <SheetTitle className="text-2xl font-extrabold leading-tight">{job.title}</SheetTitle>
            </SheetHeader>
            <div className="mt-2 flex flex-wrap gap-3 px-4 text-sm text-muted-foreground">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {job.location}
                </span>
              )}
              {job.experience && <span>{job.experience}</span>}
              <span>Found {daysSince(job.first_seen_at)}d ago</span>
            </div>

            {job.closed_at && (
              <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                No longer on the careers page (not seen since{" "}
                {new Date(job.last_seen_at).toLocaleDateString()}).
              </div>
            )}

            {/* Resume Match Progress & Score Section */}
            <div className="mx-4 mt-5 rounded-xl border bg-card p-4 shadow-sm space-y-3">
              {job.status === "applied" ? (
                <div>
                  <div className="label-mono">Applied</div>
                  <div className="text-2xl font-bold">
                    {daysSince(job.last_seen_at || job.first_seen_at)} days ago
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(job.last_seen_at || job.first_seen_at).toLocaleDateString()}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Resume Match Assessment
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2 text-primary hover:text-primary"
                      onClick={doRescore}
                      disabled={busy}
                    >
                      <Sparkles className={`h-3.5 w-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />
                      {busy ? "Scoring…" : job.score == null ? "Score with resume" : "Re-score"}
                    </Button>
                  </div>

                  {/* Prominent Progress Bar */}
                  <MatchProgressBar score={job.score} size="lg" />

                  {job.score_summary && (
                    <p className="text-xs text-muted-foreground leading-relaxed rounded-lg bg-muted/30 p-2.5 border">
                      {job.score_summary}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Tailor Resume for 95%+ Button */}
            <div className="mx-4 mt-3">
              <Button
                variant="ink"
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-4 shadow-md"
                onClick={() => onTailor(job)}
              >
                <Sparkles className="h-4 w-4 mr-2" /> Rebuild Resume for 95%+ Match (Defensible)
              </Button>
            </div>

            {/* Missing Skills Section (Point 4) */}
            {job.missing_skills && job.missing_skills.length > 0 && (
              <div className="mx-4 mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive uppercase tracking-wider">
                  <AlertCircle className="h-3.5 w-3.5" /> Missing Skills / Keywords (Lowers Score)
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.missing_skills.map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="border-destructive/30 bg-background text-destructive text-xs"
                    >
                      + {s}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Your base resume does not clearly mention these keywords. Click "Rebuild Resume"
                  above to incorporate defensible talking points for these skills.
                </p>
              </div>
            )}

            {/* Matched Strengths */}
            {job.matched_skills && job.matched_skills.length > 0 && (
              <div className="mx-4 mt-3 rounded-xl border border-success/20 bg-success/5 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-success uppercase tracking-wider">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Matched Skills From Your Resume
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.matched_skills.map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="border-success/30 bg-background text-success text-xs"
                    >
                      ✓ {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {job.description && (
              <div className="mx-4 mt-5">
                <div className="label-mono">About the role</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                  {job.description}
                </p>
              </div>
            )}

            <div className="mx-4 mt-6 flex flex-wrap gap-2 pb-6">
              {job.status === "applied" ? (
                <Button variant="outline" onClick={() => setApplied(false)}>
                  <Undo2 /> Undo applied
                </Button>
              ) : (
                <Button variant="success" onClick={() => setApplied(true)}>
                  <CheckCircle2 /> Mark as applied
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  saveOrUpdateFromJob({
                    id: job.id,
                    title: job.title,
                    companyName: job.companies?.name || "Company",
                    url: job.url,
                    location: job.location,
                    score: job.score,
                    status: "interested",
                  });
                  toast.success("Saved to My Applications!");
                }}
              >
                <Bookmark className="h-4 w-4" /> Save to Applications
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={getExactJobPostingUrl(job)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open exact job posting in new tab"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" /> View exact posting
                </a>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Interactive Dialog that rebuilds the user's resume for 95%+ ATS score
 * strictly incorporating defensible, interview-ready talking points based on current experience.
 */
function TailorResumeDialog({
  job,
  open,
  onClose,
}: {
  job: Job | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const tailor = useServerFn(tailorResumeForJob);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDefense, setShowDefense] = useState(true);
  const [result, setResult] = useState<{
    projectedScore: number;
    summaryOfChanges: string;
    missingSkillsAddressed: string[];
    interviewTalkingPoints: { topic: string; defense: string }[];
    tailoredResume: string;
  } | null>(null);

  // Trigger tailor on open
  useEffect(() => {
    if (open && job && !result && !loading) {
      setLoading(true);
      tailor({ data: { jobId: job.id } })
        .then((r) => {
          setResult(r);
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "Failed to tailor resume");
          onClose();
        })
        .finally(() => setLoading(false));
    }
  }, [open, job]);

  function handleClose() {
    setResult(null);
    setLoading(false);
    onClose();
  }

  function handleCopy() {
    if (!result?.tailoredResume) return;
    navigator.clipboard.writeText(result.tailoredResume);
    setCopied(true);
    toast.success("Tailored resume copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  }

  function handleDownload() {
    if (!result?.tailoredResume || !job) return;
    const blob = new Blob([result.tailoredResume], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const comp = job.companies?.name?.replace(/[^a-zA-Z0-9]/g, "_") || "Company";
    a.href = url;
    a.download = `Tailored_Resume_${comp}_95Plus.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Resume downloaded as .txt");
  }

  async function handleSetAsActive() {
    if (!result?.tailoredResume) return;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ resume_text: result.tailoredResume })
      .eq("user_id", user.user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Active resume updated in Settings!");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">
              <Sparkles className="h-3 w-3 mr-1" /> AI Resume Tailor
            </Badge>
            <Badge variant="outline" className="text-xs">
              Target: 95%+ ATS Score
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold mt-1">
            Rebuilt Resume for {job?.title}
          </DialogTitle>
          <DialogDescription>
            Optimized for {job?.companies?.name} with 100% defensible interview talking points.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
            <div className="font-semibold text-foreground">Rebuilding resume for 95%+ match…</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Analyzing job keywords and reframing your authentic project achievements so you can
              defend every line in technical interviews.
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4 py-2">
            {/* Score Transformation Card with Dual Progress Bars */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="font-medium text-foreground">100% Defensible in Interview</span>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-success/10 text-success border-success/30 font-semibold"
                >
                  Target: 95%+ ATS Score
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-lg border bg-background p-2.5 space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Your Current Match
                  </div>
                  <MatchProgressBar score={job?.score} size="sm" />
                </div>
                <div className="rounded-lg border bg-background p-2.5 space-y-1 border-emerald-500/40">
                  <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase flex items-center justify-between">
                    <span>Rebuilt Defensible Match</span>
                    <Sparkles className="h-3 w-3 text-emerald-500" />
                  </div>
                  <MatchProgressBar score={result.projectedScore} size="sm" />
                </div>
              </div>
            </div>

            {/* Defensible Guarantee Notice */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs leading-relaxed text-emerald-950 dark:text-emerald-200">
              <span className="font-semibold">Defensible & Realistic Guarantee:</span>{" "}
              {result.summaryOfChanges}
            </div>

            {/* Missing Skills Embedded */}
            {result.missingSkillsAddressed?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Keywords & Skills Naturally Embedded:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.missingSkillsAddressed.map((k) => (
                    <Badge
                      key={k}
                      variant="secondary"
                      className="bg-success/15 text-success font-medium text-xs"
                    >
                      ✓ {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Interview Defense Cheat Sheet (Collapsible) */}
            {result.interviewTalkingPoints?.length > 0 && (
              <div className="rounded-xl border bg-card p-3.5">
                <button
                  onClick={() => setShowDefense(!showDefense)}
                  className="flex w-full items-center justify-between font-semibold text-sm text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Interview Defense Cheat Sheet (
                    {result.interviewTalkingPoints.length} talking points)
                  </span>
                  {showDefense ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showDefense && (
                  <div className="mt-3 space-y-2.5 border-t pt-3 text-xs">
                    <p className="text-muted-foreground">
                      Use these concrete talking points when the interviewer asks about the newly
                      emphasized skills:
                    </p>
                    {result.interviewTalkingPoints.map((pt, idx) => (
                      <div key={idx} className="rounded-lg bg-muted/40 p-2.5 space-y-1">
                        <div className="font-bold text-foreground">Topic: {pt.topic}</div>
                        <div className="text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground">How to defend:</span> "
                          {pt.defense}"
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Complete Rebuilt Resume */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tailored Resume (Full Text):
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Ready to submit to {job?.companies?.name}
                </span>
              </div>
              <Textarea
                value={result.tailoredResume}
                readOnly
                rows={12}
                className="font-mono text-xs leading-relaxed bg-muted/20"
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Close
          </Button>
          {result && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1.5" /> Download .txt
              </Button>
              <Button variant="outline" size="sm" onClick={handleSetAsActive}>
                <FileText className="h-4 w-4 mr-1.5" /> Save as Active Resume
              </Button>
              <Button variant="ink" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 mr-1.5 text-success" />
                ) : (
                  <Copy className="h-4 w-4 mr-1.5" />
                )}
                {copied ? "Copied!" : "Copy Resume"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
