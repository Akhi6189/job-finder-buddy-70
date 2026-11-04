import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, Loader2, Globe, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadSettings } from "@/lib/data";
import {
  parseUploadedResume,
  rescoreAllJobs,
  analyzeLinkedInProfileFn,
} from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RoleRadar" },
      { name: "description", content: "Your resume, LinkedIn profile, and preferences." },
      { property: "og:title", content: "Settings — RoleRadar" },
      { property: "og:description", content: "Your resume, LinkedIn profile, and preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: loadSettings });
  const [resume, setResume] = useState("");

  const parseResume = useServerFn(parseUploadedResume);
  const rescoreAll = useServerFn(rescoreAllJobs);
  const analyzeProfile = useServerFn(analyzeLinkedInProfileFn);

  const [linkedinUrl, setLinkedinUrl] = useState(() => {
    return (
      localStorage.getItem("roleradar_linkedin_url") || "https://www.linkedin.com/in/akhil-bhadran/"
    );
  });
  const [isAnalyzingLinkedIn, setIsAnalyzingLinkedIn] = useState(false);
  const [linkedinHeadline, setLinkedinHeadline] = useState(() => {
    try {
      const p = localStorage.getItem("roleradar_linkedin_profile");
      if (p) return JSON.parse(p).headline;
    } catch {
      // ignore
    }
    return "Senior SDET / QA Automation Engineer | Bengaluru, India";
  });
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

  async function handleAnalyzeLinkedIn() {
    if (!linkedinUrl.trim()) {
      toast.error("Please enter your LinkedIn profile URL");
      return;
    }
    setIsAnalyzingLinkedIn(true);
    const toastId = toast.loading("Analyzing LinkedIn profile & extracting skills…");
    try {
      const res = await analyzeProfile({
        data: {
          profileUrl: linkedinUrl.trim(),
          profileText: resume,
        },
      });
      localStorage.setItem("roleradar_linkedin_profile", JSON.stringify(res));
      localStorage.setItem("roleradar_linkedin_url", linkedinUrl.trim());
      setLinkedinHeadline(res.headline);
      if (res.targetRoles?.length) {
        const mergedRoles = Array.from(new Set([...roles, ...res.targetRoles]));
        setRoles(mergedRoles);
      }
      if (res.formattedResume) {
        setResume(res.formattedResume.slice(0, 20000));
      }
      toast.success("LinkedIn profile analyzed and synced with resume!", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyze LinkedIn profile", {
        id: toastId,
      });
    } finally {
      setIsAnalyzingLinkedIn(false);
    }
  }

  useEffect(() => {
    if (!s.data) return;
    setResume(s.data.resume_text || "");
  }, [s.data]);

  async function save() {
    if (!s.data) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        resume_text: resume.slice(0, 20000),
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

      {/* LinkedIn Profile Card */}
      <section className="rounded-xl border bg-card p-5 shadow-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" /> LinkedIn Profile
              </h2>
              <Badge
                variant="outline"
                className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400"
              >
                Connected
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Used to match your professional background, verified skills, and headline against open
              roles.
            </p>
          </div>

          <Link
            to="/jobs"
            search={{ tab: "linkedin" }}
            className="inline-flex items-center gap-1.5 rounded-md border bg-accent/50 px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-500" /> Open LinkedIn Matcher →
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="https://www.linkedin.com/in/your-profile"
            value={linkedinUrl}
            onChange={(e) => {
              setLinkedinUrl(e.target.value);
              localStorage.setItem("roleradar_linkedin_url", e.target.value);
            }}
            className="flex-1 text-sm font-sans"
          />
          <Button
            type="button"
            variant="outline"
            disabled={isAnalyzingLinkedIn}
            onClick={handleAnalyzeLinkedIn}
            className="whitespace-nowrap"
          >
            {isAnalyzingLinkedIn ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5 text-blue-500" />
            )}
            Analyze & Sync to Resume
          </Button>
        </div>

        {linkedinHeadline && (
          <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
            <span className="font-semibold text-muted-foreground uppercase text-[10px]">
              Headline:{" "}
            </span>
            <span className="font-medium text-foreground">{linkedinHeadline}</span>
          </div>
        )}
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

      <Button variant="ink" size="lg" onClick={save} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
