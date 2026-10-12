import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, FileSpreadsheet, Upload, Check, Pencil, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUserId, type Company, type Tracked } from "@/lib/data";
import { importCompanies, importFromSheet } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => ({
    meta: [
      { title: "Companies — RoleRadar" },
      { name: "description", content: "Choose the companies RoleRadar watches for open roles." },
      { property: "og:title", content: "Companies — RoleRadar" },
      { property: "og:description", content: "Choose the companies RoleRadar watches for open roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const qc = useQueryClient();
  const importRows = useServerFn(importCompanies);
  const importSheet = useServerFn(importFromSheet);
  const [q, setQ] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: async () => (await supabase.from("companies").select("*").order("name")).data ?? [],
  });
  const tracked = useQuery({
    queryKey: ["tracked"],
    queryFn: async () =>
      ((await supabase.from("tracked_companies").select("*, companies(*)").order("created_at", { ascending: false })).data ?? []) as Tracked[],
  });
  const trackedIds = new Set((tracked.data ?? []).map((t) => t.company_id));

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = companies.data ?? [];
    return (s ? l.filter((c) => c.name.toLowerCase().includes(s)) : l).slice(0, 40);
  }, [q, companies.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tracked"] });
    qc.invalidateQueries({ queryKey: ["companies"] });
  };

  async function track(c: Company) {
    const { error } = await supabase.from("tracked_companies").insert({ user_id: await getUserId(), company_id: c.id });
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function untrack(id: string) {
    await supabase.from("tracked_companies").delete().eq("id", id);
    refresh();
  }

  async function runImport(p: Promise<{ tracked: number; created: number }>) {
    setBusy(true);
    try {
      const r = await p;
      toast.success(`${r.tracked} companies on your list${r.created ? ` (${r.created} new to the database)` : ""}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
    setBusy(false);
  }

  async function onFile(f: File) {
    const text = await f.text();
    const lines = text.split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, "")));
    const head = lines[0]?.map((h) => h.toLowerCase()) ?? [];
    let nc = head.findIndex((h) => h.includes("company") || h === "name");
    const uc = head.findIndex((h) => /career|link|url|website/.test(h));
    const hasHead = nc >= 0;
    if (nc < 0) nc = 0;
    const rows = lines
      .slice(hasHead ? 1 : 0)
      .map((r) => ({ name: r[nc] ?? "", careers_url: /^https?:\/\//.test(r[uc] ?? "") ? r[uc] : undefined }))
      .filter((r) => r.name)
      .slice(0, 500);
    runImport(importRows({ data: { rows } }));
  }

  return (
    <div>
      <div className="label-mono">Watchlist</div>
      <h1 className="text-3xl font-extrabold tracking-tight">Companies</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your list · {tracked.data?.length ?? 0}</h2>
          </div>
          <div className="mt-3 divide-y rounded-xl border bg-card shadow-card">
            {(tracked.data ?? []).length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">Nothing yet. Search the database or import your Google Sheet.</p>
            )}
            {(tracked.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {t.companies?.name}
                    {t.last_error && (
                      <span title={t.last_error}>
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.companies?.careers_url ?? "No careers link — will search for it"}
                    {t.last_checked_at && ` · checked ${new Date(t.last_checked_at).toLocaleString()}`}
                  </div>
                </div>
                <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => t.companies && setEditing(t.companies)}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => untrack(t.id)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-xl border bg-card p-4 shadow-card">
            <div className="label-mono">Search database</div>
            <Input className="mt-2" placeholder="e.g. Atlassian" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 max-h-72 overflow-y-auto">
              {results.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.category}
                    </Badge>
                  </div>
                  {trackedIds.has(c.id) ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => track(c)}>
                      <Plus /> Add
                    </Button>
                  )}
                </div>
              ))}
              {q && results.length === 0 && <p className="py-2 text-sm text-muted-foreground">Not in the database yet.</p>}
            </div>
            <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setEditing("new")}>
              <Plus /> Add a new company
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-card">
            <div className="label-mono">Import</div>
            <Label className="mt-3 block text-sm">Google Sheet link</Label>
            <div className="mt-1.5 flex gap-2">
              <Input placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
              <Button disabled={busy || !sheetUrl} onClick={() => runImport(importSheet({ data: { url: sheetUrl } }))}>
                <FileSpreadsheet />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Uses the column titled "Company" (and "Careers link" if present).</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload /> Upload a CSV file
            </Button>
          </div>
        </aside>
      </div>

      <CompanyDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function CompanyDialog({ value, onClose, onSaved }: { value: Company | "new" | null; onClose: () => void; onSaved: () => void }) {
  const isNew = value === "new";
  const c = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const key = isNew ? "new" : c?.id;
  const [lastKey, setLastKey] = useState<string | undefined>();
  if (key !== lastKey) {
    setLastKey(key);
    setName(c?.name ?? "");
    setUrl(c?.careers_url ?? "");
  }

  async function save() {
    if (!name.trim()) return;
    const careers_url = url.trim() || null;
    if (careers_url && !/^https?:\/\//.test(careers_url)) { toast.error("Link must start with http:// or https://"); return; }
    if (isNew) {
      const uid = await getUserId();
      const { data, error } = await supabase
        .from("companies")
        .insert({ name: name.trim(), careers_url, category: "Added by me", created_by: uid })
        .select("id")
        .single();
      if (error) { toast.error(error.code === "23505" ? "That company already exists — search for it." : error.message); return; }
      await supabase.from("tracked_companies").insert({ user_id: uid, company_id: data.id });
    } else if (c) {
      const { error } = await supabase.from("companies").update({ careers_url }).eq("id", c.id);
      if (error) { toast.error(error.message); return; }
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a company" : c?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isNew && (
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Careers page link</Label>
            <Input placeholder="https://company.com/careers" value={url} onChange={(e) => setUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">Leave empty and we'll try to find it automatically.</p>
          </div>
          <Button variant="ink" className="w-full" onClick={save}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
