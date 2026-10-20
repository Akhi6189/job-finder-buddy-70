import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Briefcase,
  Plus,
  ExternalLink,
  Calendar,
  DollarSign,
  MapPin,
  Trash2,
  Edit3,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Search,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getExactJobPostingUrl } from "@/lib/data";
import {
  useApplications,
  type ApplicationItem,
  type ApplicationStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  saveOrUpdateFromJob,
} from "@/lib/applications";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({
    meta: [
      { title: "My Applications — RoleRadar" },
      {
        name: "description",
        content: "Track your job applications across Interested, Applied, and Interviewing stages.",
      },
    ],
  }),
  component: ApplicationsPage,
});

const STAGES: ApplicationStatus[] = ["interested", "applied", "interviewing", "offer", "rejected"];

function ApplicationsPage() {
  const { applications, addApplication, updateApplication, deleteApplication } = useApplications();
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<ApplicationItem | "new" | null>(null);

  // Form state
  const [formCompany, setFormCompany] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formStatus, setFormStatus] = useState<ApplicationStatus>("interested");
  const [formLocation, setFormLocation] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSalary, setFormSalary] = useState("");
  const [formAppliedDate, setFormAppliedDate] = useState("");
  const [formInterviewDate, setFormInterviewDate] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Supabase applied jobs for one-click syncing
  const dbJobs = useQuery({
    queryKey: ["jobs_for_sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*, companies(name)")
        .eq("status", "applied");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = applications;
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (a) =>
          a.company.toLowerCase().includes(s) ||
          a.title.toLowerCase().includes(s) ||
          (a.notes ?? "").toLowerCase().includes(s),
      );
    }
    if (filterStatus !== "all") {
      list = list.filter((a) => a.status === filterStatus);
    }
    return list;
  }, [applications, q, filterStatus]);

  const counts = useMemo(() => {
    const res: Record<ApplicationStatus, number> = {
      interested: 0,
      applied: 0,
      interviewing: 0,
      offer: 0,
      rejected: 0,
    };
    for (const app of applications) {
      if (res[app.status] !== undefined) {
        res[app.status]++;
      }
    }
    return res;
  }, [applications]);

  function openNewModal(initialStatus: ApplicationStatus = "interested") {
    setFormCompany("");
    setFormTitle("");
    setFormStatus(initialStatus);
    setFormLocation("");
    setFormUrl("");
    setFormSalary("");
    setFormAppliedDate(initialStatus === "applied" ? new Date().toISOString().slice(0, 10) : "");
    setFormInterviewDate("");
    setFormNotes("");
    setEditingItem("new");
  }

  function openEditModal(item: ApplicationItem) {
    setFormCompany(item.company);
    setFormTitle(item.title);
    setFormStatus(item.status);
    setFormLocation(item.location ?? "");
    setFormUrl(item.url ?? "");
    setFormSalary(item.salary ?? "");
    setFormAppliedDate(item.appliedDate?.slice(0, 10) ?? "");
    setFormInterviewDate(item.interviewDate?.slice(0, 10) ?? "");
    setFormNotes(item.notes ?? "");
    setEditingItem(item);
  }

  function handleSave() {
    if (!formCompany.trim() || !formTitle.trim()) {
      toast.error("Company name and job title are required.");
      return;
    }

    if (editingItem === "new") {
      addApplication({
        company: formCompany.trim(),
        title: formTitle.trim(),
        status: formStatus,
        location: formLocation.trim() || undefined,
        url: formUrl.trim() || undefined,
        salary: formSalary.trim() || undefined,
        appliedDate: formAppliedDate || undefined,
        interviewDate: formInterviewDate || undefined,
        notes: formNotes.trim() || undefined,
      });
      toast.success("Application tracked!");
    } else if (editingItem && typeof editingItem === "object") {
      updateApplication(editingItem.id, {
        company: formCompany.trim(),
        title: formTitle.trim(),
        status: formStatus,
        location: formLocation.trim() || undefined,
        url: formUrl.trim() || undefined,
        salary: formSalary.trim() || undefined,
        appliedDate: formAppliedDate || undefined,
        interviewDate: formInterviewDate || undefined,
        notes: formNotes.trim() || undefined,
      });
      toast.success("Application updated.");
    }
    setEditingItem(null);
  }

  function syncFromRadar() {
    const list = dbJobs.data ?? [];
    if (!list.length) {
      toast.info("No jobs marked as 'applied' found in your radar.");
      return;
    }
    let addedCount = 0;
    for (const j of list) {
      const compName = (j.companies as { name?: string } | null)?.name || "Company";
      saveOrUpdateFromJob({
        id: j.id,
        title: j.title,
        companyName: compName,
        url: j.url,
        location: j.location,
        score: j.score,
        status: "applied",
        appliedDate: j.applied_at ?? undefined,
      });
      addedCount++;
    }
    toast.success(
      `Synced ${addedCount} applied role${addedCount === 1 ? "" : "s"} to your dashboard.`,
    );
  }

  function handleStatusChange(id: string, newStatus: ApplicationStatus) {
    updateApplication(id, {
      status: newStatus,
      appliedDate: newStatus === "applied" ? new Date().toISOString().slice(0, 10) : undefined,
    });
    toast.success(`Moved to ${STATUS_LABELS[newStatus]}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-mono">Tracker</div>
          <h1 className="text-3xl font-extrabold tracking-tight">My Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your applications from discovery to offer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dbJobs.data && dbJobs.data.length > 0 && (
            <Button variant="outline" size="sm" onClick={syncFromRadar}>
              <RefreshCw className="h-4 w-4" /> Sync from Radar
            </Button>
          )}
          <Button variant="ink" size="sm" onClick={() => openNewModal("interested")}>
            <Plus className="h-4 w-4" /> Add Application
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAGES.map((st) => {
          const colors = STATUS_COLORS[st];
          return (
            <button
              key={st}
              onClick={() => setFilterStatus(filterStatus === st ? "all" : st)}
              className={`rounded-xl border p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-card ${
                filterStatus === st ? "ring-2 ring-primary" : "bg-card"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {STATUS_LABELS[st]}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{counts[st]}</span>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${colors.bg.replace("/10", "")}`}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search company, title, or notes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-card pl-9 text-sm"
            />
          </div>
          {filterStatus !== "all" && (
            <Badge
              variant="secondary"
              className="cursor-pointer gap-1"
              onClick={() => setFilterStatus("all")}
            >
              Filter: {STATUS_LABELS[filterStatus as ApplicationStatus]} ×
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button
            size="sm"
            variant={viewMode === "board" ? "secondary" : "ghost"}
            className="h-7 px-2.5"
            onClick={() => setViewMode("board")}
          >
            <LayoutGrid className="mr-1 h-3.5 w-3.5" /> Board
          </Button>
          <Button
            size="sm"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            className="h-7 px-2.5"
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="mr-1 h-3.5 w-3.5" /> List
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {applications.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-bold">No applications tracked yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Save interesting jobs from the{" "}
            <Link to="/jobs" className="text-primary underline">
              Open Roles radar
            </Link>{" "}
            or add any external job manually to track interviews and offers.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="ink" onClick={() => openNewModal("interested")}>
              <Plus className="h-4 w-4" /> Add Application
            </Button>
            <Button variant="outline" asChild>
              <Link to="/jobs">Browse Open Roles</Link>
            </Button>
          </div>
        </div>
      ) : viewMode === "board" ? (
        /* Board / Kanban View */
        <div className="grid gap-4 overflow-x-auto pb-4 md:grid-cols-3 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const stageItems = filtered.filter((a) => a.status === stage);
            const color = STATUS_COLORS[stage];

            return (
              <div
                key={stage}
                className="flex min-w-[240px] flex-col rounded-xl border bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{STATUS_LABELS[stage]}</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                      {stageItems.length}
                    </Badge>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => openNewModal(stage)}
                    title={`Add ${STATUS_LABELS[stage]}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-2 flex flex-1 flex-col gap-2.5">
                  {stageItems.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No roles in {STATUS_LABELS[stage]}
                    </div>
                  ) : (
                    stageItems.map((item) => (
                      <ApplicationCard
                        key={item.id}
                        item={item}
                        onEdit={() => openEditModal(item)}
                        onDelete={() => deleteApplication(item.id)}
                        onStatusChange={(s) => handleStatusChange(item.id, s)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              No matching applications found.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-card transition hover:shadow-lift"
              >
                <div className="flex items-center gap-3">
                  {item.score != null ? (
                    <ScoreRing score={item.score} size={44} />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground">
                      {item.company.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{item.company}</span>
                      {item.location && <span>• {item.location}</span>}
                      {item.appliedDate && <span>• Applied {item.appliedDate.slice(0, 10)}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
                    value={item.status}
                    onChange={(e) =>
                      handleStatusChange(item.id, e.target.value as ApplicationStatus)
                    }
                  >
                    {STAGES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>

                  {item.url && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <a
                        href={getExactJobPostingUrl({
                          url: item.url,
                          title: item.title,
                          companies: { name: item.company },
                          location: item.location,
                        })}
                        target="_blank"
                        rel="noreferrer"
                        title="View exact posting"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditModal(item)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => deleteApplication(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem === "new" ? "Track New Application" : "Edit Application"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label>Company Name *</Label>
              <Input
                placeholder="e.g. Swiggy, InMobi, Google"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Role Title *</Label>
              <Input
                placeholder="e.g. Senior SDET, Software Engineer"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Status</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ApplicationStatus)}
                >
                  {STAGES.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Location</Label>
                <Input
                  placeholder="e.g. Bengaluru, Remote"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Applied Date</Label>
                <Input
                  type="date"
                  value={formAppliedDate}
                  onChange={(e) => setFormAppliedDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Interview Date</Label>
                <Input
                  type="date"
                  value={formInterviewDate}
                  onChange={(e) => setFormInterviewDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Job / Posting URL</Label>
              <Input
                placeholder="https://..."
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Salary / Comp Notes</Label>
              <Input
                placeholder="e.g. ₹25-35 LPA, 401k, equity"
                value={formSalary}
                onChange={(e) => setFormSalary(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Notes & Follow-ups</Label>
              <Textarea
                placeholder="Recruiter contact, interview rounds, referral name…"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button variant="ink" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApplicationCard({
  item,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  item: ApplicationItem;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: ApplicationStatus) => void;
}) {
  const nextStageMap: Record<ApplicationStatus, ApplicationStatus | null> = {
    interested: "applied",
    applied: "interviewing",
    interviewing: "offer",
    offer: null,
    rejected: null,
  };

  const nextStage = nextStageMap[item.status];

  return (
    <div className="flex flex-col justify-between rounded-xl border bg-card p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {item.company}
            </div>
            <h4 className="mt-0.5 font-semibold leading-tight text-foreground line-clamp-2">
              {item.title}
            </h4>
          </div>
          {item.score != null && <ScoreRing score={item.score} size={36} />}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          {item.location && (
            <span className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
              <MapPin className="h-3 w-3" /> {item.location}
            </span>
          )}
          {item.appliedDate && (
            <span className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
              <Calendar className="h-3 w-3" /> {item.appliedDate.slice(5)}
            </span>
          )}
          {item.salary && (
            <span className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
              <DollarSign className="h-3 w-3" /> {item.salary}
            </span>
          )}
        </div>

        {item.notes && (
          <p className="mt-2 rounded bg-muted/30 p-1.5 text-xs text-muted-foreground line-clamp-2">
            {item.notes}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs">
        <div className="flex items-center gap-1">
          {item.url && (
            <a
              href={getExactJobPostingUrl({
                url: item.url,
                title: item.title,
                companies: { name: item.company },
                location: item.location,
              })}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Open exact job posting"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={onEdit}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit details"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {nextStage && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] text-primary hover:bg-primary/10"
            onClick={() => onStatusChange(nextStage)}
          >
            To {STATUS_LABELS[nextStage]} <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
