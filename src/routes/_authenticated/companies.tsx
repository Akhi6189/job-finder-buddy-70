import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  FileSpreadsheet,
  Upload,
  Check,
  Pencil,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUserId, type Company, type Tracked } from "@/lib/data";
import { CareerUrlIndicator } from "@/components/CareerUrlIndicator";
import {
  importCompanies,
  importFromSheet,
  locateCareersForCompany,
  validateCompanyCareerUrl,
  auditAndCleanCompanyUrlsFn,
} from "@/lib/jobs.functions";
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
      {
        property: "og:description",
        content: "Choose the companies RoleRadar watches for open roles.",
      },
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
  const locateCareers = useServerFn(locateCareersForCompany);
  const auditCompanyUrls = useServerFn(auditAndCleanCompanyUrlsFn);
  const [isAuditing, setIsAuditing] = useState(false);
  const [locatingId, setLocatingId] = useState<string | null>(null);
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
      ((
        await supabase
          .from("tracked_companies")
          .select("*, companies(*)")
          .order("created_at", { ascending: false })
      ).data ?? []) as Tracked[],
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

  async function handleAuditLinks() {
    setIsAuditing(true);
    try {
      const res = await auditCompanyUrls();
      if (res.cleanedCount > 0) {
        toast.success(
          `Audited ${res.totalChecked} companies: Cleaned & verified ${res.cleanedCount} career links!`,
        );
      } else {
        toast.success(`All ${res.totalChecked} company links are verified direct portals.`);
      }
      refresh();
    } catch {
      toast.error("Failed to audit company career URLs");
    } finally {
      setIsAuditing(false);
    }
  }

  async function handleLocateCompany(companyId: string, companyName: string) {
    setLocatingId(companyId);
    try {
      const res = await locateCareers({
        data: { companyId, companyName },
      });
      if (res.ok) {
        toast.success(`Verified & updated canonical URL: ${res.url}`);
        refresh();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Could not locate canonical URL via Search API");
    } finally {
      setLocatingId(null);
    }
  }

  async function track(c: Company) {
    const { error } = await supabase
      .from("tracked_companies")
      .insert({ user_id: await getUserId(), company_id: c.id });
    if (error) {
      toast.error(error.message);
      return;
    }
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
      toast.success(
        `${r.tracked} companies on your list${r.created ? ` (${r.created} new to the database)` : ""}.`,
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
    setBusy(false);
  }

  async function onFile(f: File) {
    const text = await f.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, "")));
    const head = lines[0]?.map((h) => h.toLowerCase()) ?? [];
    let nc = head.findIndex((h) => h.includes("company") || h === "name");
    const uc = head.findIndex((h) => /career|link|url|website/.test(h));
    const hasHead = nc >= 0;
    if (nc < 0) nc = 0;
    const rows = lines
      .slice(hasHead ? 1 : 0)
      .map((r) => ({
        name: r[nc] ?? "",
        careers_url: /^https?:\/\//.test(r[uc] ?? "") ? r[uc] : undefined,
      }))
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
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5"
              disabled={isAuditing}
              onClick={handleAuditLinks}
              title="Query search API for '[Company Name] career page' and update records with official canonical URLs, replacing generic search links."
            >
              <Sparkles
                className={`h-3.5 w-3.5 text-primary ${isAuditing ? "animate-spin" : ""}`}
              />
              {isAuditing ? "Searching Canonical URLs..." : "Auto-Update via Search API"}
            </Button>
          </div>
          <div className="mt-3 divide-y rounded-xl border bg-card shadow-card">
            {(tracked.data ?? []).length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                Nothing yet. Search the database or import your Google Sheet.
              </p>
            )}
            {(tracked.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium flex-wrap">
                    <span className="text-sm font-semibold">{t.companies?.name}</span>
                    <CareerUrlIndicator
                      url={t.companies?.careers_url}
                      companyName={t.companies?.name}
                      showFixButton={true}
                      isFixing={locatingId === t.company_id}
                      onFix={() =>
                        t.companies && handleLocateCompany(t.company_id, t.companies.name)
                      }
                    />
                    {t.last_error && (
                      <span title={t.last_error}>
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                    {t.companies?.careers_url ? (
                      <a
                        href={t.companies.careers_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline max-w-md truncate"
                        title={t.companies.careers_url}
                      >
                        <span className="truncate">{t.companies.careers_url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="italic">No careers link configured</span>
                    )}
                    {t.last_checked_at && (
                      <span className="text-muted-foreground/75 shrink-0">
                        · checked{" "}
                        {new Date(t.last_checked_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Search API: Query '[Company Name] career page' and update canonical URL"
                  disabled={locatingId === t.company_id}
                  onClick={() => t.companies && handleLocateCompany(t.company_id, t.companies.name)}
                >
                  <Sparkles
                    className={`h-4 w-4 text-primary ${locatingId === t.company_id ? "animate-spin" : ""}`}
                  />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit"
                  onClick={() => t.companies && setEditing(t.companies)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => untrack(t.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-xl border bg-card p-4 shadow-card">
            <div className="label-mono">Search database</div>
            <Input
              className="mt-2"
              placeholder="e.g. Atlassian"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="mt-2 max-h-72 overflow-y-auto">
              {results.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {c.category}
                      </Badge>
                      <CareerUrlIndicator url={c.careers_url} compact />
                    </div>
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
              {q && results.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">Not in the database yet.</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2"
              onClick={() => setEditing("new")}
            >
              <Plus /> Add a new company
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-card">
            <div className="label-mono">Import</div>
            <Label className="mt-3 block text-sm">Google Sheet link</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
              <Button
                disabled={busy || !sheetUrl}
                onClick={() => runImport(importSheet({ data: { url: sheetUrl } }))}
              >
                <FileSpreadsheet />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Uses the column titled "Company" (and "Careers link" if present).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <Button
              variant="outline"
              className="mt-3 w-full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload /> Upload a CSV file
            </Button>
          </div>
        </aside>
      </div>

      <CompanyDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function CompanyDialog({
  value,
  onClose,
  onSaved,
}: {
  value: Company | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = value === "new";
  const c = value && value !== "new" ? value : null;
  const validateUrl = useServerFn(validateCompanyCareerUrl);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const key = isNew ? "new" : c?.id;
  const [lastKey, setLastKey] = useState<string | undefined>();
  if (key !== lastKey) {
    setLastKey(key);
    setName(c?.name ?? "");
    setUrl(c?.careers_url ?? "");
  }

  const isSearchQuery = Boolean(
    url && /(?:google\.[a-z.]+\/search|bing\.com\/search|search\.yahoo\.com)/i.test(url),
  );

  async function handleAutoLocate() {
    if (!name.trim()) {
      toast.error("Please enter a company name first.");
      return;
    }
    setIsValidating(true);
    try {
      const res = await validateUrl({ data: { url: url.trim(), companyName: name.trim() } });
      if (res.resolvedUrl) {
        setUrl(res.resolvedUrl);
        toast.success(`Found direct careers portal: ${res.resolvedUrl}`);
      } else if (res.isValid && res.normalizedUrl) {
        setUrl(res.normalizedUrl);
        toast.success(`Verified: ${res.reason}`);
      } else {
        toast.error("Could not auto-locate direct portal. Please enter it manually.");
      }
    } catch {
      toast.error("Failed to auto-locate portal");
    } finally {
      setIsValidating(false);
    }
  }

  async function save() {
    if (!name.trim()) return;
    const cleanUrl = url.trim() || null;
    let finalUrl = cleanUrl;

    if (cleanUrl) {
      if (!/^https?:\/\//i.test(cleanUrl)) {
        toast.error("Link must start with http:// or https://");
        return;
      }
      setIsValidating(true);
      try {
        const check = await validateUrl({
          data: { url: cleanUrl, companyName: name.trim() },
        });
        if (check.isGenericSearch) {
          toast.error(
            "Flagged: Generic Google search links cannot be scanned for jobs. Please provide a direct careers site or click Auto-Locate.",
          );
          if (check.resolvedUrl) {
            setUrl(check.resolvedUrl);
          }
          setIsValidating(false);
          return;
        }
        if (check.isAggregator) {
          toast.error(
            "Flagged: Generic job aggregator queries (e.g. Indeed search) cannot be scanned. Please provide the company's direct portal.",
          );
          setIsValidating(false);
          return;
        }
        if (check.normalizedUrl) {
          finalUrl = check.normalizedUrl;
        }
      } catch {
        // Non-fatal, proceed with caution
      } finally {
        setIsValidating(false);
      }
    }

    if (isNew) {
      const uid = await getUserId();
      const { data, error } = await supabase
        .from("companies")
        .insert({
          name: name.trim(),
          careers_url: finalUrl,
          category: "Added by me",
          created_by: uid,
        })
        .select("id")
        .single();
      if (error) {
        toast.error(
          error.code === "23505" ? "That company already exists — search for it." : error.message,
        );
        return;
      }
      await supabase.from("tracked_companies").insert({ user_id: uid, company_id: data.id });
    } else if (c) {
      const { error } = await supabase
        .from("companies")
        .update({ careers_url: finalUrl })
        .eq("id", c.id);
      if (error) {
        toast.error(error.message);
        return;
      }
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
        <div className="space-y-4">
          {isNew && (
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input
                placeholder="e.g. Scopely, Swiggy, Atlassian"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Careers page link</Label>
                <CareerUrlIndicator url={url} compact />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary px-1.5"
                disabled={isValidating || !name.trim()}
                onClick={handleAutoLocate}
              >
                <Sparkles className={`mr-1 h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />
                Auto-Locate Direct Portal
              </Button>
            </div>
            <Input
              placeholder="https://company.com/careers or https://job-boards.greenhouse.io/company"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={isSearchQuery ? "border-amber-500 focus-visible:ring-amber-500" : ""}
            />
            {url && (
              <div className="pt-0.5">
                <CareerUrlIndicator url={url} />
              </div>
            )}
            {isSearchQuery ? (
              <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Generic Google search query detected.</strong> RoleRadar needs a direct
                  career site link (e.g. Greenhouse, Lever, Workday, or company.com/careers) to
                  scrape active job listings. Click <em>Auto-Locate Direct Portal</em> above to find
                  it.
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Direct ATS job board or company career page (e.g. Greenhouse, Lever, Workday).
                </span>
                {name.trim() && (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(name.trim() + " careers")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline shrink-0 ml-2"
                  >
                    <span>Google "{name.trim()} careers"</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
          <Button variant="ink" className="w-full" disabled={isValidating} onClick={save}>
            {isValidating ? "Verifying link..." : "Save Company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
