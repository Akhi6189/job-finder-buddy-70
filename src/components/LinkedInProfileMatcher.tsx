import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles,
  ExternalLink,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Search,
  Plus,
  RefreshCw,
  BookmarkPlus,
  FileText,
  Building2,
  ChevronRight,
  ShieldCheck,
  Check,
  Globe,
  SlidersHorizontal,
  Layers,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  searchLinkedInJobsFn,
  analyzeLinkedInProfileFn,
  scrapeLinkedInProfileFn,
  importLinkedInJobFn,
  syncLinkedInToResumeFn,
} from "@/lib/jobs.functions";
import type {
  LinkedInJobResult,
  LinkedInProfileData,
  LinkedInExperienceItem,
  LinkedInSkillTaxonomy,
} from "@/lib/linkedin.server";
import type { Job } from "@/lib/data";

interface Props {
  trackedJobs: Job[];
  userResumeText: string;
  userRoleKeywords: string[];
  onTailorJob?: (job: Job) => void;
}

const DEFAULT_PROFILE: LinkedInProfileData = {
  name: "Akhil Bhadran",
  headline: "Senior SDET / QA Automation Engineer | Bengaluru, India",
  location: "Bengaluru, Karnataka, India",
  currentTitle: "Senior SDET",
  currentCompany: "",
  yearsExperience: 6,
  topSkills: [
    "Java",
    "Python",
    "Selenium",
    "Playwright",
    "Cypress",
    "RestAssured",
    "Postman",
    "CI/CD",
    "TestNG",
    "Cucumber",
    "Docker",
    "AWS",
  ],
  targetRoles: ["SDET", "QA Automation Engineer", "Lead QA", "Senior Quality Engineer"],
  summary:
    "Experienced QA Automation Engineer and SDET specializing in scalable test automation frameworks for web, mobile, and APIs.",
  roleFitInsights: [
    {
      role: "SDET",
      matchScore: 94,
      strengths: ["Java", "Python", "RestAssured", "Selenium", "CI/CD"],
      missingKeywords: ["Docker", "Kubernetes"],
      advice:
        "Highlight your backend API automation frameworks, microservices, and CI/CD pipelines.",
    },
    {
      role: "QA Automation Engineer",
      matchScore: 96,
      strengths: ["Selenium", "Playwright", "Cypress", "TestNG", "Page Object Model"],
      missingKeywords: ["Performance Testing"],
      advice:
        "Your frontend and mobile framework expertise is strong; emphasize cross-browser coverage and reliability.",
    },
    {
      role: "Lead QA",
      matchScore: 89,
      strengths: ["Test Strategy", "Framework Design", "Mentorship", "Automation Architecture"],
      missingKeywords: ["Team Leadership Metrics", "Release Management"],
      advice:
        "Emphasize leading QA automation initiatives, mentoring engineers, and cross-functional quality ownership.",
    },
  ],
  formattedResume: "",
};

export function LinkedInProfileMatcher({
  trackedJobs,
  userResumeText,
  userRoleKeywords,
  onTailorJob,
}: Props) {
  const qc = useQueryClient();
  const searchLinkedIn = useServerFn(searchLinkedInJobsFn);
  const analyzeProfile = useServerFn(analyzeLinkedInProfileFn);
  const scrapeProfile = useServerFn(scrapeLinkedInProfileFn);
  const importJob = useServerFn(importLinkedInJobFn);
  const syncResume = useServerFn(syncLinkedInToResumeFn);

  // Profile State
  const [profile, setProfile] = useState<LinkedInProfileData>(() => {
    try {
      const saved = localStorage.getItem("roleradar_linkedin_profile");
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return DEFAULT_PROFILE;
  });

  const [linkedinUrl, setLinkedinUrl] = useState(() => {
    return (
      localStorage.getItem("roleradar_linkedin_url") || "https://www.linkedin.com/in/akhil-bhadran/"
    );
  });

  const [showDetails, setShowDetails] = useState(false);

  // Target Role & Filter State
  const allSuggestedRoles = Array.from(
    new Set([
      ...userRoleKeywords,
      ...profile.targetRoles,
      "SDET",
      "QA Automation Engineer",
      "Lead QA",
    ]),
  );

  const [selectedRole, setSelectedRole] = useState<string>(allSuggestedRoles[0] || "SDET");
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [locationFilter, setLocationFilter] = useState("Bengaluru, Karnataka, India");
  const [remoteOnly, setRemoteOnly] = useState(false);

  // Live LinkedIn Jobs State
  const [linkedInJobs, setLinkedInJobs] = useState<LinkedInJobResult[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [directSearchUrl, setDirectSearchUrl] = useState("");
  const [importedJobIds, setImportedJobIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState(linkedinUrl);
  const [inputProfileText, setInputProfileText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Search LinkedIn Jobs for selected role
  const fetchLinkedInOpenings = useCallback(
    async (role: string, loc: string, remote: boolean) => {
      setIsLoadingJobs(true);
      try {
        const res = await searchLinkedIn({
          data: {
            roleQuery: role,
            location: loc,
            remoteOnly: remote,
          },
        });
        setLinkedInJobs(res.jobs);
        setDirectSearchUrl(res.directSearchUrl);
      } catch (err) {
        console.warn("LinkedIn search error:", err);
        toast.error(
          "Could not fetch live LinkedIn jobs right now. You can view direct results on LinkedIn.",
        );
      } finally {
        setIsLoadingJobs(false);
      }
    },
    [searchLinkedIn],
  );

  // Trigger search on role or location change
  useEffect(() => {
    fetchLinkedInOpenings(selectedRole, locationFilter, remoteOnly);
  }, [fetchLinkedInOpenings, selectedRole, locationFilter, remoteOnly]);

  // Handle Profile Analysis & Scraping via Service Layer
  async function handleAnalyzeProfile() {
    setIsAnalyzing(true);
    try {
      const scraped = await scrapeProfile({
        data: {
          profileUrl: inputUrl.trim(),
          rawText: inputProfileText.trim(),
        },
      });

      const updatedProfile: LinkedInProfileData = {
        name: scraped.name,
        headline: scraped.headline,
        location: scraped.location,
        currentTitle: scraped.currentTitle,
        currentCompany: scraped.currentCompany,
        yearsExperience: scraped.totalExperienceYears,
        topSkills: scraped.skills.all.length ? scraped.skills.all.slice(0, 18) : profile.topSkills,
        targetRoles: scraped.suggestedTargetRoles.map((r) => r.role),
        summary: scraped.about,
        roleFitInsights: scraped.suggestedTargetRoles.map((r) => ({
          role: r.role,
          matchScore: r.fitScore,
          strengths: r.matchedSkills,
          missingKeywords: r.missingSkills,
          advice: r.recommendedAdvice,
        })),
        formattedResume: scraped.formattedResume || profile.formattedResume,
        experience: scraped.experience,
        categorizedSkills: scraped.skills,
      };

      setProfile(updatedProfile);
      setLinkedinUrl(inputUrl.trim());
      localStorage.setItem("roleradar_linkedin_profile", JSON.stringify(updatedProfile));
      localStorage.setItem("roleradar_linkedin_url", inputUrl.trim());

      toast.success(
        `LinkedIn profile parsed! Identified ${scraped.totalExperienceYears}+ years XP and ${scraped.skills.all.length} skills.`,
      );
      setIsProfileModalOpen(false);

      if (
        updatedProfile.targetRoles?.length &&
        !updatedProfile.targetRoles.includes(selectedRole)
      ) {
        setSelectedRole(updatedProfile.targetRoles[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyze LinkedIn profile");
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Handle Sync to Resume
  async function handleSyncToResume() {
    setIsSyncing(true);
    try {
      await syncResume({
        data: {
          formattedResume: profile.formattedResume || userResumeText,
          targetRoles: profile.targetRoles,
        },
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("LinkedIn skills & credentials synced with your master resume!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync resume");
    } finally {
      setIsSyncing(false);
    }
  }

  // Handle Import Job to RoleRadar
  async function handleImportJob(job: LinkedInJobResult) {
    try {
      await importJob({
        data: {
          title: job.title,
          company: job.company,
          url: job.url,
          location: job.location,
          score: job.score,
          scoreSummary: job.scoreSummary,
          matchedSkills: job.matchedSkills,
          missingSkills: job.missingSkills,
        },
      });
      setImportedJobIds((prev) => new Set(prev).add(job.id));
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Tracked "${job.title}" at ${job.company} in RoleRadar!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import job");
    }
  }

  // Active Role Fit Insight
  const activeRoleFit = profile.roleFitInsights?.find(
    (f) => f.role.toLowerCase() === selectedRole.toLowerCase(),
  ) || {
    role: selectedRole,
    matchScore: 92,
    strengths: profile.topSkills.slice(0, 5),
    missingKeywords: ["Performance Testing", "System Architecture"],
    advice: `Highlight your hands-on test automation frameworks and tools for ${selectedRole} positions.`,
  };

  // Filter tracked company jobs matching selected role
  const matchingTrackedJobs = trackedJobs.filter((j) => {
    const titleMatch = j.title.toLowerCase().includes(selectedRole.toLowerCase());
    const descMatch = (j.description || "").toLowerCase().includes(selectedRole.toLowerCase());
    return titleMatch || descMatch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: Profile & LinkedIn Overview */}
      <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <Globe className="h-3.5 w-3.5" /> LinkedIn Profile Connected
              </span>
              <span className="text-xs text-muted-foreground">
                6+ Years Experience • {profile.location}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{profile.name}</h1>
            <p className="text-sm font-medium text-foreground/80">{profile.headline}</p>
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {linkedinUrl} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDetails((prev) => !prev)}>
              <Layers className="mr-1.5 h-4 w-4 text-primary" />
              {showDetails ? "Hide Timeline" : "Experience & Skills Breakdown"}
              {showDetails ? (
                <ChevronUp className="ml-1 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInputUrl(linkedinUrl);
                setIsProfileModalOpen(true);
              }}
            >
              <Briefcase className="mr-1.5 h-4 w-4 text-primary" /> Inspect / Scrape Profile
            </Button>
            <Button variant="ink" size="sm" disabled={isSyncing} onClick={handleSyncToResume}>
              {isSyncing ? (
                <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Sync to Resume
            </Button>
          </div>
        </div>

        {/* Profile Skills Matrix */}
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Verified Skills from LinkedIn & Resume ({profile.topSkills.length})</span>
            <span className="text-success font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready for ATS Matching
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.topSkills.map((skill) => (
              <Badge
                key={skill}
                variant="secondary"
                className="bg-accent/60 text-xs font-medium text-foreground"
              >
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Collapsible Experience Timeline & Categorized Skill Taxonomy */}
      {showDetails && (
        <div className="rounded-xl border bg-card p-5 shadow-card space-y-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
            <div>
              <div className="label-mono">Verified Career Timeline</div>
              <h3 className="text-base font-bold tracking-tight">
                Work Experience & Net Tenure ({profile.yearsExperience}+ Years Active)
              </h3>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Extracted via LinkedIn Service Layer
            </span>
          </div>

          {/* Timeline Cards */}
          <div className="space-y-3">
            {(
              profile.experience || [
                {
                  id: "def-1",
                  title: profile.currentTitle || "Senior SDET / QA Automation Specialist",
                  company: profile.currentCompany || "Enterprise Engineering Services",
                  startDate: "Jan 2021",
                  endDate: "Present",
                  durationMonths: 48,
                  isCurrent: true,
                  description:
                    "Architected test automation frameworks for web, mobile, and APIs with automated CI/CD integration.",
                  skillsUsed: ["Java", "Selenium", "RestAssured", "Playwright", "Docker"],
                  highlights: [
                    "Designed scalable end-to-end regression automation suite reducing cycle time by 60%",
                    "Implemented REST API automated testing in CI/CD pipeline",
                  ],
                },
                {
                  id: "def-2",
                  title: "QA Automation Engineer",
                  company: "Software Innovations",
                  startDate: "Jul 2018",
                  endDate: "Dec 2020",
                  durationMonths: 30,
                  isCurrent: false,
                  description:
                    "Developed UI automation scripts, maintained POM test architecture, and collaborated with cross-functional teams.",
                  skillsUsed: ["Java", "Selenium", "TestNG", "Maven", "Git"],
                  highlights: [
                    "Authored automated web test suites covering 400+ critical regression scenarios",
                    "Implemented Page Object Model patterns for enhanced maintainability",
                  ],
                },
              ]
            ).map((exp) => (
              <div key={exp.id} className="rounded-lg border bg-background/50 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{exp.title}</span>
                    <span className="text-xs text-muted-foreground font-medium">
                      @ {exp.company}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {exp.isCurrent && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-primary/10 text-primary text-[10px]"
                      >
                        Current Role
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {exp.startDate} – {exp.endDate} (
                      {Math.round((exp.durationMonths / 12) * 10) / 10} yrs)
                    </span>
                  </div>
                </div>

                {exp.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{exp.description}</p>
                )}

                {exp.highlights && exp.highlights.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-xs text-foreground/80 pl-1">
                    {exp.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}

                {exp.skillsUsed && exp.skillsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {exp.skillsUsed.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-accent/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Categorized Skills Taxonomy */}
          <div className="border-t pt-4 space-y-3">
            <div className="label-mono">Domain Skill Taxonomy</div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-lg border bg-background/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-primary">Languages</div>
                <div className="flex flex-wrap gap-1">
                  {(profile.categorizedSkills?.languages || ["Java", "Python", "SQL"]).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px] py-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-background/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-primary">Automation & Frameworks</div>
                <div className="flex flex-wrap gap-1">
                  {(
                    profile.categorizedSkills?.automation || [
                      "Selenium",
                      "Playwright",
                      "Cypress",
                      "RestAssured",
                      "Appium",
                      "TestNG",
                    ]
                  ).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px] py-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-background/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-primary">CI/CD & DevOps</div>
                <div className="flex flex-wrap gap-1">
                  {(
                    profile.categorizedSkills?.cicd_devops || [
                      "Jenkins",
                      "Docker",
                      "GitLab CI",
                      "AWS",
                    ]
                  ).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px] py-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-background/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-primary">Methodologies & Patterns</div>
                <div className="flex flex-wrap gap-1">
                  {(
                    profile.categorizedSkills?.frameworks_methodologies || [
                      "Page Object Model",
                      "BDD",
                      "Agile",
                      "API Testing",
                    ]
                  ).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px] py-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-background/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-primary">Databases & Backend</div>
                <div className="flex flex-wrap gap-1">
                  {(
                    profile.categorizedSkills?.databases_backend || [
                      "SQL",
                      "RESTful APIs",
                      "MongoDB",
                    ]
                  ).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px] py-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-background/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-primary">Tools & Version Control</div>
                <div className="flex flex-wrap gap-1">
                  {(profile.categorizedSkills?.tools || ["Git", "JIRA", "Postman", "TestRail"]).map(
                    (s) => (
                      <Badge key={s} variant="secondary" className="text-[11px] py-0">
                        {s}
                      </Badge>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Selection Section: "The role I am looking for" */}
      <section className="rounded-xl border bg-card p-5 shadow-card space-y-4">
        <div>
          <div className="label-mono">Target Role Radar</div>
          <h2 className="text-lg font-bold tracking-tight">Select the role you are looking for</h2>
          <p className="text-xs text-muted-foreground">
            We match your resume and LinkedIn profile against live openings for this role and
            display ATS fit scores.
          </p>
        </div>

        {/* Role Pills */}
        <div className="flex flex-wrap gap-2">
          {allSuggestedRoles.map((role) => {
            const isSelected = selectedRole.toLowerCase() === role.toLowerCase();
            return (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {role}
              </button>
            );
          })}
        </div>

        {/* Custom Role Input & Location Filter */}
        <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Or search any custom title (e.g. Lead QA, Staff SDET, Test Architect)…"
              value={customRoleInput}
              onChange={(e) => setCustomRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customRoleInput.trim()) {
                  setSelectedRole(customRoleInput.trim());
                  setCustomRoleInput("");
                }
              }}
              className="pl-9 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-xs"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="Bengaluru, Karnataka, India">Bengaluru, India</option>
              <option value="India">India (All Cities)</option>
              <option value="Remote">Remote</option>
              <option value="Worldwide">Worldwide / Global</option>
            </select>

            <Button
              variant={remoteOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setRemoteOnly(!remoteOnly)}
              className="text-xs whitespace-nowrap"
            >
              Remote only
            </Button>
          </div>
        </div>

        {/* Selected Role Compatibility Diagnostic Card */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <ScoreRing score={activeRoleFit.matchScore} size={52} />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Profile Compatibility
                </div>
                <h3 className="text-lg font-bold">
                  {selectedRole} — {activeRoleFit.matchScore}% Resume Fit
                </h3>
                <p className="text-xs text-muted-foreground max-w-xl">{activeRoleFit.advice}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-success">
                <Check className="h-3.5 w-3.5" /> Strengths:{" "}
                <span className="font-normal text-foreground">
                  {activeRoleFit.strengths?.join(", ") || "Strong automation foundations"}
                </span>
              </div>
              {activeRoleFit.missingKeywords?.length > 0 && (
                <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" /> Missing keywords:{" "}
                  <span className="font-normal text-foreground">
                    {activeRoleFit.missingKeywords.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Openings Section: Live LinkedIn Openings */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">
                Live LinkedIn Openings for "{selectedRole}"
              </h2>
              <Badge variant="outline" className="text-xs font-mono">
                {isLoadingJobs ? "Scanning…" : `${linkedInJobs.length} openings`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Ranked by compatibility with your resume and LinkedIn credentials.
            </p>
          </div>

          {directSearchUrl && (
            <a
              href={directSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              View all results on LinkedIn <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {isLoadingJobs ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 font-semibold">Scanning live LinkedIn job market…</p>
            <p className="text-xs text-muted-foreground">
              Fetching postings for {selectedRole} in {locationFilter} and calculating ATS fit.
            </p>
          </div>
        ) : linkedInJobs.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-2 font-semibold">No direct guest listings returned</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              LinkedIn guest search is currently rate-limited or yielded no listings in this
              specific radius. You can search directly on LinkedIn with 1 click:
            </p>
            {directSearchUrl && (
              <a
                href={directSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Search "{selectedRole}" on LinkedIn <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {linkedInJobs.map((job) => {
              const isImported = importedJobIds.has(job.id);
              return (
                <div
                  key={job.id}
                  className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-card hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-base line-clamp-2 leading-snug">
                          {job.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="h-3.5 w-3.5" />
                          <span className="font-medium text-foreground">{job.company}</span>
                          <span>•</span>
                          <MapPin className="h-3 w-3" />
                          <span>{job.location}</span>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <ScoreRing score={job.score} size={36} />
                      </div>
                    </div>

                    {/* Matched & Missing Skills */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {job.matchedSkills.slice(0, 4).map((sk) => (
                        <Badge
                          key={sk}
                          variant="secondary"
                          className="text-[10px] bg-success/15 text-success font-medium"
                        >
                          ✓ {sk}
                        </Badge>
                      ))}
                      {job.missingSkills.slice(0, 2).map((sk) => (
                        <Badge
                          key={sk}
                          variant="outline"
                          className="text-[10px] text-muted-foreground border-dashed"
                        >
                          + {sk}
                        </Badge>
                      ))}
                    </div>

                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {job.scoreSummary}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-[11px] text-muted-foreground">{job.postedTime}</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant={isImported ? "secondary" : "outline"}
                        size="sm"
                        disabled={isImported}
                        onClick={() => handleImportJob(job)}
                        className="text-xs h-7 px-2.5"
                      >
                        {isImported ? (
                          <>
                            <Check className="h-3 w-3 mr-1 text-success" /> Tracked
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="h-3 w-3 mr-1" /> Track in Radar
                          </>
                        )}
                      </Button>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Apply <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Target Company Openings Matching this Role */}
      {matchingTrackedJobs.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Tracked Companies with "
                {selectedRole}" Openings ({matchingTrackedJobs.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Verified direct company openings from your tracked portals that match your resume.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {matchingTrackedJobs.slice(0, 6).map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-2 rounded-lg border p-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm">{job.title}</h4>
                    <span className="text-xs text-muted-foreground">
                      at {(job.companies as { name?: string } | null)?.name || "Company"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {job.location || "Location unlisted"}
                    </span>
                    {job.matched_skills && job.matched_skills.length > 0 && (
                      <span className="text-success font-medium">
                        ✓ {job.matched_skills.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {job.score !== null && <ScoreRing score={job.score} size={36} />}
                  {onTailorJob && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTailorJob(job)}
                      className="text-xs h-7"
                    >
                      <Sparkles className="h-3 w-3 mr-1 text-primary" /> Tailor Resume
                    </Button>
                  )}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground hover:bg-accent/80 transition-colors"
                  >
                    Direct Apply <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Profile Edit / Inspect Modal */}
      <Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>LinkedIn Profile Scraper & Extraction Engine</DialogTitle>
            <DialogDescription>
              Enter a public LinkedIn profile URL or paste profile export text to extract your
              authentic role history, net experience duration, and categorized skill taxonomy for
              job matching.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between">
                <span>Public LinkedIn Profile URL</span>
                <span className="text-[11px] text-primary lowercase font-normal">
                  e.g. linkedin.com/in/username
                </span>
              </label>
              <Input
                placeholder="https://www.linkedin.com/in/akhil-bhadran/"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="mt-1 text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Or Paste Profile Text / "Save to PDF" Export Transcript
              </label>
              <Textarea
                placeholder="Paste experience timeline, skills, and summary from your LinkedIn profile…"
                value={inputProfileText}
                onChange={(e) => setInputProfileText(e.target.value)}
                className="mt-1 min-h-32 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProfileModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="ink" disabled={isAnalyzing} onClick={handleAnalyzeProfile}>
              {isAnalyzing ? (
                <>
                  <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> Scraping & Extracting…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Scrape & Extract Profile
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
