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
  Search,
  SlidersHorizontal,
  Building2,
  Briefcase,
  X,
  RotateCcw,
  ArrowUpDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { daysSince, isRemote, getExactJobPostingUrl, type Job } from "@/lib/data";
import { scanCompany, rescoreJob, rescoreAllJobs, tailorResumeForJob } from "@/lib/jobs.functions";
import { saveOrUpdateFromJob } from "@/lib/applications";
import { getCompanyIndustry, ALL_INDUSTRIES, type Industry } from "@/lib/industry";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [titleCategory, setTitleCategory] = useState("all");
  const [locPreset, setLocPreset] = useState("all");
  const [loc, setLoc] = useState("");
  const [industry, setIndustry] = useState<Industry>("All");
  const [scoreTier, setScoreTier] = useState("all");
  const [sortBy, setSortBy] = useState("score_desc");
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
        .select("*, companies(name, careers_url, category)")
        .order("first_seen_at", { ascending: false })
        .limit(1500);
      if (error) throw error;
      return data as Job[];
    },
  });

  const list = useMemo(() => {
    let l = (jobs.data ?? []).filter((j) => !j.closed_at || j.status === "applied");

    // Tab filter
    if (tab === "open") l = l.filter((j) => j.status !== "applied");
    if (tab === "applied") l = l.filter((j) => j.status === "applied");

    // Remote only
    if (remoteOnly) l = l.filter(isRemote);

    // Job Title Category filter
    if (titleCategory !== "all") {
      l = l.filter((j) => {
        const t = (j.title || "").toLowerCase();
        if (titleCategory === "sdet_qa") {
          return /sdet|automation|test engineer|qa automation|quality engineer/i.test(t);
        }
        if (titleCategory === "manual_qa") {
          return (
            /qa\b|quality assurance|tester|test analyst|validation|qc\b/i.test(t) &&
            !/sdet|automation/i.test(t)
          );
        }
        if (titleCategory === "lead_manager") {
          return /lead|manager|head|director|principal|staff/i.test(t);
        }
        if (titleCategory === "performance_security") {
          return /performance|load|jmeter|k6|security|penetration/i.test(t);
        }
        if (titleCategory === "swe_backend") {
          return /backend|software engineer|sde|developer|services|golang|java|python|platform/i.test(
            t,
          );
        }
        if (titleCategory === "frontend_fullstack") {
          return /frontend|full stack|fullstack|ui engineer|react|web/i.test(t);
        }
        if (titleCategory === "devops_cloud") {
          return /devops|sre|cloud|infrastructure|reliability/i.test(t);
        }
        return true;
      });
    }

    // Location Preset Filter
    if (locPreset !== "all") {
      if (locPreset === "remote") {
        l = l.filter(isRemote);
      } else {
        const s = locPreset.toLowerCase();
        l = l.filter((j) => (j.location ?? "").toLowerCase().includes(s));
      }
    }

    // Custom Location text filter
    if (loc.trim()) {
      const s = loc.trim().toLowerCase();
      l = l.filter((j) => (j.location ?? "").toLowerCase().includes(s));
    }

    // Industry filter
    if (industry !== "All") {
      l = l.filter(
        (j) => getCompanyIndustry(j.companies?.name, j.companies?.category) === industry,
      );
    }

    // ATS Match Score Tier filter
    if (scoreTier !== "all") {
      if (scoreTier === "90plus") l = l.filter((j) => (j.score ?? 0) >= 90);
      else if (scoreTier === "80plus") l = l.filter((j) => (j.score ?? 0) >= 80);
      else if (scoreTier === "60plus") l = l.filter((j) => (j.score ?? 0) >= 60);
      else if (scoreTier === "under60") l = l.filter((j) => j.score != null && j.score < 60);
      else if (scoreTier === "unscored") l = l.filter((j) => j.score == null);
    }

    // Search query filter (matches role title, company name, skills, description)
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      l = l.filter((j) => {
        const titleMatch = j.title.toLowerCase().includes(s);
        const companyMatch = (j.companies?.name ?? "").toLowerCase().includes(s);
        const locMatch = (j.location ?? "").toLowerCase().includes(s);
        const matchedSkillsMatch = (j.matched_skills ?? []).some((sk) =>
          sk.toLowerCase().includes(s),
        );
        const missingSkillsMatch = (j.missing_skills ?? []).some((sk) =>
          sk.toLowerCase().includes(s),
        );
        return titleMatch || companyMatch || locMatch || matchedSkillsMatch || missingSkillsMatch;
      });
    }

    // Sorting
    return [...l].sort((a, b) => {
      if (sortBy === "score_desc") return (b.score ?? -1) - (a.score ?? -1);
      if (sortBy === "score_asc") return (a.score ?? 101) - (b.score ?? 101);
      if (sortBy === "newest")
        return new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime();
      if (sortBy === "oldest")
        return new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime();
      if (sortBy === "company_asc")
        return (a.companies?.name ?? "").localeCompare(b.companies?.name ?? "");
      return (b.score ?? -1) - (a.score ?? -1);
    });
  }, [jobs.data, tab, q, loc, locPreset, titleCategory, industry, scoreTier, sortBy, remoteOnly]);

  const counts = {
    open: (jobs.data ?? []).filter((j) => j.status !== "applied" && !j.closed_at).length,
    applied: (jobs.data ?? []).filter((j) => j.status === "applied").length,
  };

  const hasActiveFilters =
    q.trim() !== "" ||
    loc.trim() !== "" ||
    locPreset !== "all" ||
    titleCategory !== "all" ||
    industry !== "All" ||
    scoreTier !== "all" ||
    remoteOnly;

  function clearAllFilters() {
    setQ("");
    setLoc("");
    setLocPreset("all");
    setTitleCategory("all");
    setIndustry("All");
    setScoreTier("all");
    setRemoteOnly(false);
  }

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
          <Button
            variant="outline"
            size="sm"
            onClick={handleScoreAll}
            disabled={isScoringAll}
            title="Recompute authentic ATS match score across all roles using top-company screening rubric"
          >
            <Sparkles
              className={`h-4 w-4 mr-1 text-primary ${isScoringAll ? "animate-spin" : ""}`}
            />
            {isScoringAll ? "Scoring all roles against resume…" : "Re-score all with resume"}
          </Button>
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

      {/* Comprehensive Filtering Dashboard System */}
      <div className="mt-6 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        {/* Row 1: Tabs + Search + Remote Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="open">Open roles ({counts.open})</TabsTrigger>
              <TabsTrigger value="applied">Applied ({counts.applied})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-1 items-center gap-2 min-w-[240px] max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search keywords, skills, roles..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 bg-background"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant={remoteOnly ? "ink" : "outline"}
              size="sm"
              onClick={() => setRemoteOnly((v) => !v)}
              className="shrink-0"
            >
              {remoteOnly ? "✓ " : ""}Remote only
            </Button>
          </div>
        </div>

        {/* Row 2: Category, Location, Industry, ATS Score, Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          {/* 1. Job Title Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Briefcase className="h-3 w-3" /> Job Title
            </label>
            <Select value={titleCategory} onValueChange={setTitleCategory}>
              <SelectTrigger className="w-full h-9 bg-background text-xs">
                <SelectValue placeholder="All Titles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Titles</SelectItem>
                <SelectItem value="sdet_qa">SDET & Automation QA</SelectItem>
                <SelectItem value="manual_qa">QA Engineer & Quality Analyst</SelectItem>
                <SelectItem value="lead_manager">QA Lead & Engineering Manager</SelectItem>
                <SelectItem value="performance_security">Performance & Security QA</SelectItem>
                <SelectItem value="swe_backend">Software Engineer (Backend / SDE)</SelectItem>
                <SelectItem value="frontend_fullstack">Frontend & Full Stack</SelectItem>
                <SelectItem value="devops_cloud">DevOps & Cloud SRE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2. Location Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Location
            </label>
            <Select value={locPreset} onValueChange={setLocPreset}>
              <SelectTrigger className="w-full h-9 bg-background text-xs">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                <SelectItem value="bengaluru">Bengaluru / Bangalore</SelectItem>
                <SelectItem value="hyderabad">Hyderabad</SelectItem>
                <SelectItem value="pune">Pune</SelectItem>
                <SelectItem value="mumbai">Mumbai</SelectItem>
                <SelectItem value="delhi">Delhi NCR / Gurgaon / Noida</SelectItem>
                <SelectItem value="chennai">Chennai</SelectItem>
                <SelectItem value="remote">Remote Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Industry Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Industry
            </label>
            <Select value={industry} onValueChange={(val) => setIndustry(val as Industry)}>
              <SelectTrigger className="w-full h-9 bg-background text-xs">
                <SelectValue placeholder="All Industries" />
              </SelectTrigger>
              <SelectContent>
                {ALL_INDUSTRIES.map((ind) => (
                  <SelectItem key={ind} value={ind}>
                    {ind === "All" ? "All Industries" : ind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 4. ATS Match Score Tier */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> ATS Match Score
            </label>
            <Select value={scoreTier} onValueChange={setScoreTier}>
              <SelectTrigger className="w-full h-9 bg-background text-xs">
                <SelectValue placeholder="All Scores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Match Scores</SelectItem>
                <SelectItem value="90plus">90%+ Top-Tier (ATS Pass)</SelectItem>
                <SelectItem value="80plus">80%+ Strong Fit</SelectItem>
                <SelectItem value="60plus">60%+ Moderate Fit</SelectItem>
                <SelectItem value="under60">&lt; 60% Needs Tailoring</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5. Sort By */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> Sort By
            </label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full h-9 bg-background text-xs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score_desc">Highest Match Score</SelectItem>
                <SelectItem value="score_asc">Lowest Match Score</SelectItem>
                <SelectItem value="newest">Newest Roles First</SelectItem>
                <SelectItem value="oldest">Oldest Roles First</SelectItem>
                <SelectItem value="company_asc">Company Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3: Active Filters & Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-foreground">
              Showing {list.length} of {tab === "open" ? counts.open : counts.applied} roles
            </span>

            {titleCategory !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] py-0.5">
                Title: {titleCategory.replace(/_/g, " ")}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setTitleCategory("all")} />
              </Badge>
            )}

            {locPreset !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] py-0.5">
                Location: {locPreset}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setLocPreset("all")} />
              </Badge>
            )}

            {industry !== "All" && (
              <Badge variant="secondary" className="gap-1 text-[11px] py-0.5">
                Industry: {industry}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setIndustry("All")} />
              </Badge>
            )}

            {scoreTier !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] py-0.5">
                Score:{" "}
                {scoreTier === "90plus"
                  ? "90%+"
                  : scoreTier === "80plus"
                    ? "80%+"
                    : scoreTier === "60plus"
                      ? "60%+"
                      : "<60%"}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setScoreTier("all")} />
              </Badge>
            )}

            {remoteOnly && (
              <Badge variant="secondary" className="gap-1 text-[11px] py-0.5">
                Remote only
                <X className="h-3 w-3 cursor-pointer" onClick={() => setRemoteOnly(false)} />
              </Badge>
            )}
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset all filters
            </Button>
          )}
        </div>
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
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((j) => (
            <div
              key={j.id}
              onClick={() => setSelected(j)}
              className={`group flex flex-col justify-between rounded-xl border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift cursor-pointer ${
                j.closed_at ? "opacity-70" : ""
              }`}
            >
              <div>
                <div className="flex items-start gap-3">
                  {j.status === "applied" ? (
                    <div className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-full bg-success/15 text-success">
                      <span className="font-mono text-base font-semibold leading-none">
                        {daysSince(j.last_seen_at || j.first_seen_at)}
                      </span>
                      <span className="text-[10px]">days</span>
                    </div>
                  ) : (
                    <ScoreRing score={j.score} size={52} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {j.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-sm font-semibold text-foreground/80 truncate">
                        {j.companies?.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">•</span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] py-0 px-1.5 font-normal bg-muted text-muted-foreground truncate"
                      >
                        {getCompanyIndustry(j.companies?.name, j.companies?.category)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {j.status === "applied" ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/15 text-[10px]">
                          Applied
                        </Badge>
                      ) : j.score != null ? (
                        <Badge
                          variant={
                            j.score >= 80 ? "default" : j.score >= 60 ? "secondary" : "outline"
                          }
                          className={
                            j.score >= 80
                              ? "bg-success/15 text-success hover:bg-success/15 border-0 text-[10px]"
                              : j.score < 60
                                ? "text-amber-600 border-amber-500/30 text-[10px]"
                                : "text-[10px]"
                          }
                        >
                          {j.score >= 80
                            ? "Strong Fit"
                            : j.score >= 60
                              ? "Moderate"
                              : "Needs Tailoring"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Not scored
                        </Badge>
                      )}
                      {isRemote(j) && (
                        <Badge variant="outline" className="text-[10px]">
                          Remote
                        </Badge>
                      )}
                      {j.location && (
                        <span className="truncate text-xs text-muted-foreground">{j.location}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Missing Skills / Keywords on the card */}
                {j.missing_skills && j.missing_skills.length > 0 && j.status !== "applied" && (
                  <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-destructive uppercase tracking-wide">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>Missing keywords:</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {j.missing_skills.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center rounded border border-destructive/30 bg-background px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                        >
                          + {s}
                        </span>
                      ))}
                      {j.missing_skills.length > 3 && (
                        <span className="self-center text-[10px] font-medium text-destructive">
                          +{j.missing_skills.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* If no missing skills and matched skills present */}
                {(!j.missing_skills || j.missing_skills.length === 0) &&
                  j.matched_skills &&
                  j.matched_skills.length > 0 &&
                  j.status !== "applied" && (
                    <div className="mt-3 rounded-lg border border-success/20 bg-success/5 p-2">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-success uppercase tracking-wide">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span>Matched keywords:</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {j.matched_skills.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded border border-success/30 bg-background px-1.5 py-0.5 text-[10px] font-medium text-success"
                          >
                            ✓ {s}
                          </span>
                        ))}
                        {j.matched_skills.length > 3 && (
                          <span className="self-center text-[10px] font-medium text-success">
                            +{j.matched_skills.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* Action buttons directly on the card */}
              <div className="mt-3.5 pt-3 border-t flex items-center justify-between gap-2">
                <a
                  href={getExactJobPostingUrl(j)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline hover:text-primary/80"
                  title="Open company career home page where this role was found"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>View posting</span>
                </a>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2.5 font-medium border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTailorTarget(j);
                  }}
                  title="Rebuild resume for 95%+ match against this role"
                >
                  <Sparkles className="h-3 w-3 mr-1 text-purple-600" />
                  <span>Rebuild (95%+)</span>
                </Button>
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
              <div className="flex items-center gap-2">
                <span className="label-mono">{job.companies?.name}</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                  {getCompanyIndustry(job.companies?.name, job.companies?.category)}
                </Badge>
              </div>
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
                <div className="flex items-center gap-4">
                  <ScoreRing score={job.score} size={84} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Resume Match Score
                      </span>
                      {job.score != null && (
                        <Badge
                          variant={
                            job.score >= 80 ? "default" : job.score >= 60 ? "secondary" : "outline"
                          }
                          className={
                            job.score >= 80
                              ? "bg-success text-success-foreground text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {job.score >= 80
                            ? "Strong Fit"
                            : job.score >= 60
                              ? "Moderate Match"
                              : "Needs Tailoring"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-snug">
                      {job.score_summary ??
                        "Not scored against your resume yet. Click score now to evaluate."}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 -ml-2 text-xs text-primary hover:text-primary"
                      onClick={doRescore}
                      disabled={busy}
                    >
                      <Sparkles className={`h-3.5 w-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />{" "}
                      {busy
                        ? "Scoring…"
                        : job.score == null
                          ? "Score against my resume"
                          : "Re-score"}
                    </Button>
                  </div>
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
                  title="Open company career home page where this role was found"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" /> View posting
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
            {/* Score Transformation Card with Circular Score Rings */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3.5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <ScoreRing score={job?.score} size={54} />
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                      Current Score
                    </div>
                    <div className="text-xs font-bold text-foreground">
                      {job?.score != null ? `${job.score}%` : "Not evaluated"}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2.5">
                  <ScoreRing score={result.projectedScore} size={54} />
                  <div>
                    <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                      Rebuilt Score
                    </div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {result.projectedScore}%
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>100% Defensible in Interview</span>
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
