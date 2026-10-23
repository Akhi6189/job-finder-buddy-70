import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Upload, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadSettings } from "@/lib/data";
import { parseUploadedResume, rescoreAllJobs } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RoleRadar" },
      { name: "description", content: "Roles to look for, your resume, and scan schedule." },
      { property: "og:title", content: "Settings — RoleRadar" },
      { property: "og:description", content: "Roles to look for, your resume, and scan schedule." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const SUGGESTED = [
  "SDET",
  "QA Automation",
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "DevOps Engineer",
  "Data Engineer",
];

function fmtHour(h: number) {
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${ap}`;
}

function SettingsPage() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: loadSettings });
  const [roles, setRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const [resume, setResume] = useState("");
  const [hours, setHours] = useState<number[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [addHour, setAddHour] = useState("9");

  const parseResume = useServerFn(parseUploadedResume);
  const rescoreAll = useServerFn(rescoreAllJobs);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedSkills = useMemo(() => {
    if (!resume) return [];
    const text = resume.toLowerCase();
    const common = [
      "Java",
      "Python",
      "JavaScript",
      "TypeScript",
      "Selenium",
      "Cypress",
      "Playwright",
      "RestAssured",
      "Postman",
      "API Testing",
      "Cucumber",
      "TestNG",
      "JUnit",
      "CI/CD",
      "Jenkins",
      "Docker",
      "Kubernetes",
      "AWS",
      "Git",
      "SQL",
      "Appium",
      "Jira",
      "Performance Testing",
      "Automation Framework",
      "Page Object Model",
      "BDD",
      "TDD",
    ];
    return common.filter((s) => text.includes(s.toLowerCase()));
  }, [resume]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading(`Parsing fonts & decoding ${file.name}…`);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const b64 = res.includes(",") ? res.split(",")[1]! : res;
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const parsed = await parseResume({
        data: {
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
        },
      });

      if (parsed.text) {
        setResume(parsed.text.slice(0, 20000));
        toast.success(
          `Successfully decoded & imported ${file.name} (${parsed.text.length} chars)`,
          {
            id: toastId,
          },
        );
      } else {
        toast.error("Could not extract readable text from document", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to parse document", { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!s.data) return;
    setRoles(s.data.role_keywords);
    setResume(s.data.resume_text);
    setHours(s.data.schedule_hours);
    setEnabled(s.data.schedule_enabled);
  }, [s.data]);

  async function save() {
    if (!s.data) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        role_keywords: roles.length ? roles : ["SDET"],
        resume_text: resume.slice(0, 20000),
        schedule_hours: [...hours].sort((a, b) => a - b),
        schedule_enabled: enabled,
        paused_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", s.data.user_id);

    if (error) {
      toast.error(error.message);
      setIsSaving(false);
      return;
    }

    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success("Settings saved! Rescoring open roles against your updated resume…");

    try {
      const r = await rescoreAll();
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Rescored ${r.scored} roles with your updated resume!`);
    } catch {
      // background rescore error is non-fatal
    } finally {
      setIsSaving(false);
    }
  }

  if (s.isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="label-mono">Preferences</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
      </div>

      {s.data?.paused_reason && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Scheduled scans are paused: {s.data.paused_reason}. Saving settings will resume them.
        </div>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Roles to look for</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <span
              key={r}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground"
            >
              {r}
              <button
                aria-label={`Remove ${r}`}
                onClick={() => setRoles(roles.filter((x) => x !== r))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = newRole.trim();
            if (v && !roles.includes(v)) setRoles([...roles, v]);
            setNewRole("");
          }}
        >
          <Input
            placeholder="Add a role, e.g. Test Automation Engineer"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTED.filter((x) => !roles.includes(x)).map((x) => (
            <button
              key={x}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setRoles([...roles, x])}
            >
              + {x}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Your Resume
            </h2>
            <p className="text-sm text-muted-foreground">
              Uploaded here to evaluate fit and generate the Resume Match Progress Bar across all
              open roles.
            </p>
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.md,.json,.pdf,.doc,.docx"
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Upload Resume File
            </Button>
          </div>
        </div>

        {detectedSkills.length > 0 && (
          <div className="space-y-1 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Detected Skills in Resume (
              {detectedSkills.length})
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {detectedSkills.map((sk) => (
                <Badge
                  key={sk}
                  variant="secondary"
                  className="text-xs bg-success/15 text-success font-medium"
                >
                  ✓ {sk}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <Textarea
            className="min-h-64 font-sans text-sm leading-relaxed"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste or upload your resume text here…"
          />
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{resume.length} / 20,000 characters</span>
            {resume.length > 0 && (
              <span className="text-success font-medium">✓ Ready for Radar matching</span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Automatic scans</h2>
            <p className="text-sm text-muted-foreground">Times are India time (IST).</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Automatic scans" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {hours.map((h) => (
            <span
              key={h}
              className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 font-mono text-sm text-ink-foreground"
            >
              {fmtHour(h)}
              <button
                aria-label="Remove time"
                onClick={() => setHours(hours.filter((x) => x !== h))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Label className="text-sm">Add time</Label>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={addHour}
            onChange={(e) => setAddHour(e.target.value)}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => !hours.includes(+addHour) && setHours([...hours, +addHour])}
          >
            Add
          </Button>
        </div>
      </section>

      <Button variant="ink" size="lg" onClick={save}>
        Save settings
      </Button>
    </div>
  );
}
