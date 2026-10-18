import { useState, useEffect } from "react";

export type ApplicationStatus = "interested" | "applied" | "interviewing" | "offer" | "rejected";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  interested: "Interested",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer Received",
  rejected: "Archived / Rejected",
};

export const STATUS_COLORS: Record<
  ApplicationStatus,
  { bg: string; text: string; border: string }
> = {
  interested: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
  applied: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20" },
  interviewing: { bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/20" },
  offer: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
  rejected: { bg: "bg-zinc-500/10", text: "text-zinc-500", border: "border-zinc-500/20" },
};

export type ApplicationItem = {
  id: string;
  jobId?: string;
  company: string;
  title: string;
  url?: string;
  location?: string;
  status: ApplicationStatus;
  appliedDate?: string;
  interviewDate?: string;
  salary?: string;
  notes?: string;
  score?: number | null;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "roleradar_my_applications_v1";
const EVENT_NAME = "roleradar_applications_change";

export function getStoredApplications(): ApplicationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredApplications(items: ApplicationItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch (e) {
    console.error("Failed to save applications", e);
  }
}

export function addApplication(
  item: Omit<ApplicationItem, "id" | "createdAt" | "updatedAt">,
): ApplicationItem {
  const current = getStoredApplications();
  const now = new Date().toISOString();
  const newItem: ApplicationItem = {
    ...item,
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  saveStoredApplications([newItem, ...current]);
  return newItem;
}

export function updateApplication(
  id: string,
  patch: Partial<Omit<ApplicationItem, "id" | "createdAt">>,
): void {
  const current = getStoredApplications();
  const updated = current.map((item) =>
    item.id === id
      ? {
          ...item,
          ...patch,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  saveStoredApplications(updated);
}

export function deleteApplication(id: string): void {
  const current = getStoredApplications();
  saveStoredApplications(current.filter((item) => item.id !== id));
}

export function saveOrUpdateFromJob(job: {
  id: string;
  title: string;
  companyName: string;
  url?: string;
  location?: string | null;
  score?: number | null;
  status: ApplicationStatus;
  appliedDate?: string;
}): ApplicationItem {
  const current = getStoredApplications();
  const existing = current.find(
    (a) =>
      a.jobId === job.id ||
      (a.title.toLowerCase() === job.title.toLowerCase() &&
        a.company.toLowerCase() === job.companyName.toLowerCase()),
  );

  if (existing) {
    updateApplication(existing.id, {
      status: job.status,
      appliedDate: job.appliedDate || existing.appliedDate,
      score: job.score ?? existing.score,
    });
    return { ...existing, status: job.status };
  }

  return addApplication({
    jobId: job.id,
    company: job.companyName,
    title: job.title,
    url: job.url,
    location: job.location || undefined,
    score: job.score,
    status: job.status,
    appliedDate: job.appliedDate,
  });
}

/** React hook for live application tracking state */
export function useApplications() {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);

  useEffect(() => {
    setApplications(getStoredApplications());

    function handleChange() {
      setApplications(getStoredApplications());
    }

    window.addEventListener(EVENT_NAME, handleChange);
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener(EVENT_NAME, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return {
    applications,
    addApplication,
    updateApplication,
    deleteApplication,
  };
}
