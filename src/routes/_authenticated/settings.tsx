import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadSettings } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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

const SUGGESTED = ["SDET", "QA Automation", "Software Engineer", "Backend Engineer", "Frontend Engineer", "DevOps Engineer", "Data Engineer"];

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

  useEffect(() => {
    if (!s.data) return;
    setRoles(s.data.role_keywords);
    setResume(s.data.resume_text);
    setHours(s.data.schedule_hours);
    setEnabled(s.data.schedule_enabled);
  }, [s.data]);

  async function save() {
    if (!s.data) return;
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
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success("Saved");
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
            <span key={r} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">
              {r}
              <button aria-label={`Remove ${r}`} onClick={() => setRoles(roles.filter((x) => x !== r))}>
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
          <Input placeholder="Add a role, e.g. Test Automation Engineer" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
          <Button type="submit" variant="outline">Add</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTED.filter((x) => !roles.includes(x)).map((x) => (
            <button key={x} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setRoles([...roles, x])}>
              + {x}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Your resume</h2>
        <p className="text-sm text-muted-foreground">Paste your resume text. It's used to score how well you match each role.</p>
        <Textarea className="mt-3 min-h-56 font-mono text-xs" value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Paste resume text here…" />
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
            <span key={h} className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 font-mono text-sm text-ink-foreground">
              {fmtHour(h)}
              <button aria-label="Remove time" onClick={() => setHours(hours.filter((x) => x !== h))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Label className="text-sm">Add time</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={addHour} onChange={(e) => setAddHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => !hours.includes(+addHour) && setHours([...hours, +addHour])}>
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
