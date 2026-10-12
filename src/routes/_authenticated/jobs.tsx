import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, MapPin, RefreshCw, CheckCircle2, Undo2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { daysSince, type Job } from "@/lib/data";
import { scanCompany, rescoreJob } from "@/lib/jobs.functions";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Job | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);

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
    let l = jobs.data ?? [];
    if (tab === "open") l = l.filter((j) => j.status !== "applied" && !j.closed_at);
    if (tab === "applied") l = l.filter((j) => j.status === "applied");
    if (tab === "closed") l = l.filter((j) => j.status !== "applied" && !!j.closed_at);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((j) => j.title.toLowerCase().includes(s) || j.companies?.name.toLowerCase().includes(s));
    }
    return tab === "open" ? [...l].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) : l;
  }, [jobs.data, tab, q]);

  const counts = {
    open: (jobs.data ?? []).filter((j) => j.status !== "applied" && !j.closed_at).length,
    applied: (jobs.data ?? []).filter((j) => j.status === "applied").length,
    closed: (jobs.data ?? []).filter((j) => j.status !== "applied" && !!j.closed_at).length,
  };

  async function scanAll() {
    const { data: tracked } = await supabase.from("tracked_companies").select("id, companies(name)");
    if (!tracked?.length) { toast.info("Add some companies first."); return; }
    let added = 0;
    const failed: string[] = [];
    for (let i = 0; i < tracked.length; i++) {
      const name = (tracked[i]!.companies as any)?.name ?? "";
      setProgress({ done: i, total: tracked.length, name });
      const r = await scan({ data: { trackedId: tracked[i]!.id } }).catch((e) => ({ ok: false as const, error: String(e) }));
      if (r.ok) added += r.added;
      else {
        failed.push(name);
        if (/out of credits|\b402\b/i.test(r.error)) {
          setProgress(null);
          toast.error("Scan stopped: the web reader is out of credits. Top up credits, then press Scan now again.");
          return;
        }
      }
      qc.invalidateQueries({ queryKey: ["jobs"] });
    }
    setProgress(null);
    toast.success(`Scan finished: ${added} new role${added === 1 ? "" : "s"}.`, {
      description: failed.length ? `Couldn't read: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}` : undefined,
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-mono">Radar</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Open roles</h1>
        </div>
        <Button variant="ink" onClick={scanAll} disabled={!!progress}>
          <RefreshCw className={progress ? "animate-spin" : ""} />
          {progress ? `Scanning ${progress.done + 1}/${progress.total}` : "Scan now"}
        </Button>
      </div>
      {progress && (
        <div className="mt-4 rounded-lg border bg-card p-3 text-sm">
          Reading careers page of <b>{progress.name}</b>…
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="open">Not applied ({counts.open})</TabsTrigger>
            <TabsTrigger value="applied">Applied ({counts.applied})</TabsTrigger>
            <TabsTrigger value="closed">No longer available ({counts.closed})</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input placeholder="Search role or company" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs bg-card" />
      </div>

      {jobs.isLoading ? (
        <p className="mt-10 text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-semibold">No roles here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add companies on the <Link to="/companies" className="text-primary underline">Companies</Link> page, then press Scan now.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((j) => (
            <button
              key={j.id}
              onClick={() => setSelected(j)}
              className={`flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift ${j.closed_at ? "opacity-70" : ""}`}
            >
              {j.status === "applied" ? (
                <div className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-full bg-success/15 text-success">
                  <span className="font-mono text-base font-semibold leading-none">{daysSince(j.applied_at!)}</span>
                  <span className="text-[10px]">days</span>
                </div>
              ) : (
                <ScoreRing score={j.score} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{j.title}</div>
                <div className="truncate text-sm text-muted-foreground">{j.companies?.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {j.status === "applied" ? (
                    <Badge className="bg-success/15 text-success hover:bg-success/15">Applied</Badge>
                  ) : (
                    <Badge variant="secondary">Not applied</Badge>
                  )}
                  {j.closed_at && (
                    <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">No longer available</Badge>
                  )}
                  {j.location && <span className="truncate text-xs text-muted-foreground">{j.location}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <JobSheet job={selected} onClose={() => setSelected(null)} onChange={(j) => setSelected(j)} />
    </div>
  );
}

function JobSheet({ job, onClose, onChange }: { job: Job | null; onClose: () => void; onChange: (j: Job) => void }) {
  const qc = useQueryClient();
  const rescore = useServerFn(rescoreJob);
  const [busy, setBusy] = useState(false);

  async function setApplied(applied: boolean) {
    if (!job) return;
    const patch = applied ? { status: "applied", applied_at: new Date().toISOString() } : { status: "open", applied_at: null };
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    onChange({ ...job, ...patch });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    toast.success(applied ? "Marked as applied" : "Moved back to not applied");
  }

  async function doRescore() {
    if (!job) return;
    setBusy(true);
    try {
      const r = await rescore({ data: { jobId: job.id } });
      onChange({ ...job, score: r.score, score_summary: r.summary, matched_skills: r.matched, missing_skills: r.missing });
      qc.invalidateQueries({ queryKey: ["jobs"] });
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
                No longer on the careers page (not seen since {new Date(job.last_seen_at).toLocaleDateString()}).
              </div>
            )}
            <div className="mx-4 mt-5 flex items-center gap-4 rounded-xl border bg-muted/40 p-4">
              {job.status === "applied" ? (
                <div>
                  <div className="label-mono">Applied</div>
                  <div className="text-2xl font-bold">{daysSince(job.applied_at!)} days ago</div>
                  <div className="text-sm text-muted-foreground">{new Date(job.applied_at!).toLocaleDateString()}</div>
                </div>
              ) : (
                <>
                  <ScoreRing score={job.score} size={84} />
                  <div className="min-w-0">
                    <div className="label-mono">Resume match</div>
                    <p className="text-sm">{job.score_summary ?? "Not scored yet. Add your resume in Settings, then score it."}</p>
                    <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={doRescore} disabled={busy}>
                      <Sparkles /> {busy ? "Scoring…" : job.score == null ? "Score now" : "Re-score"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {(job.matched_skills?.length || job.missing_skills?.length) && (
              <div className="mx-4 mt-4 grid gap-3 sm:grid-cols-2">
                <SkillList title="You have" items={job.matched_skills} tone="success" />
                <SkillList title="Missing" items={job.missing_skills} tone="destructive" />
              </div>
            )}

            {job.description && (
              <div className="mx-4 mt-5">
                <div className="label-mono">About the role</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{job.description}</p>
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
              <Button variant="outline" asChild>
                <a href={job.url} target="_blank" rel="noreferrer">
                  <ExternalLink /> View posting
                </a>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SkillList({ title, items, tone }: { title: string; items: string[] | null; tone: "success" | "destructive" }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="label-mono">{title}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((s) => (
          <span key={s} className={tone === "success" ? "rounded-md bg-success/12 px-2 py-0.5 text-xs text-success" : "rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive"}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
