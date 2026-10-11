import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Radar, Clock, Gauge, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RoleRadar — find and track roles at your target companies" },
      {
        name: "description",
        content: "Scan careers pages of your target companies for SDET and engineering roles, score your resume, and track applications.",
      },
      { property: "og:title", content: "RoleRadar — job application tracker" },
      { property: "og:description", content: "Scan careers pages, score your resume, track every application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/jobs" });
    });
  }, [navigate]);

  const features = [
    { icon: Building2, t: "Your company list", d: "Pick from the built-in list, import a Google Sheet, or add your own." },
    { icon: Radar, t: "Careers pages scanned", d: "Finds SDET or any roles you choose, right from each careers site." },
    { icon: Gauge, t: "Resume match score", d: "Each role is scored against your resume." },
    { icon: Clock, t: "Runs on a schedule", d: "Checks at 9 AM and 5 PM India time, or whenever you choose." },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="label-mono">RoleRadar · job hunt control room</div>
      <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">
        Every open role at the companies <span className="text-primary">you</span> care about.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Add your target companies, tell it which roles to look for, and see what's open, how well you fit, and where
        you've already applied.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild size="lg" variant="ink">
          <Link to="/auth">Get started</Link>
        </Button>
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.t} className="rounded-xl border bg-card p-5 shadow-card">
            <f.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 font-semibold">{f.t}</div>
            <div className="mt-1 text-sm text-muted-foreground">{f.d}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
