import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { StaflyLogo, StaflyMark } from "@/components/brand/StaflyBrand";
import { STAFLY_WHATSAPP, STAFLY_PHONE_DISPLAY_INTL, STAFLY_EMAIL, STAFLY_MAILTO } from "@/lib/contact";

import {
  CalendarClock,
  Smartphone,
  Clock,
  ClipboardCheck,
  Wallet,
  Building2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Settings,
  Check,
} from "lucide-react";

const FEATURES = [
  {
    icon: CalendarClock,
    title: "Scheduling",
    desc: "Plan shifts, assign captains and publish in minutes. Workers confirm from their phone.",
  },
  {
    icon: Smartphone,
    title: "Worker portal",
    desc: "Each worker gets a mobile-first portal for shifts, profile, payroll history and updates.",
  },
  {
    icon: Clock,
    title: "Clock in / out",
    desc: "GPS or kiosk clock with photo, geofence and real-time supervision.",
  },
  {
    icon: ClipboardCheck,
    title: "Shift closeout",
    desc: "Captains submit a real attendance closeout from the phone. Audited, no spreadsheets.",
  },
  {
    icon: Wallet,
    title: "Payroll-ready review",
    desc: "Reviewer approves real hours. Validations and corrections are tracked end-to-end.",
  },
  {
    icon: Building2,
    title: "Multi-company operations",
    desc: "Operate one brand or many tenants. Roles, modules and billing scoped per company.",
  },
];

const MODULES = [
  {
    title: "Core",
    items: ["Scheduling", "Worker portal", "Attendance", "Employee profiles", "Basic reports"],
  },
  {
    title: "Operations",
    items: ["Daily ops dashboard", "Shift closeout", "Payroll-ready review", "Documents", "Drivers / transport", "Admin roles"],
  },
  {
    title: "Scale",
    items: ["Multi-company", "Advanced permissions", "Migration support", "Custom reports", "Integrations", "Priority support"],
  },
];

export default function PublicLanding() {
  const { user, canAccessAdmin, canAccessPortal } = useAuth();
  const navigate = useNavigate();

  // Honor Supabase hash redirects even if landing is at /
  useEffect(() => {
    const hash = window.location.hash;
    if (
      hash &&
      (hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        hash.includes("type=") ||
        hash.includes("error"))
    ) {
      navigate(`/auth/callback${hash}`, { replace: true });
    }
  }, [navigate]);

  const dashboardHref = canAccessAdmin ? "/app" : canAccessPortal ? "/portal" : "/app";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" aria-label="Stafly Core home">
            <StaflyLogo size={32} />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <a
              href="#features"
              className="hidden sm:inline-block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3"
            >
              How it works
            </a>
            <Link
              to="/pricing"
              className="hidden sm:inline-block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3"
            >
              Pricing
            </Link>
            {user ? (
              <Button asChild size="sm" className="rounded-xl">
                <Link to={dashboardHref}>
                  Go to dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="rounded-xl">
                  <Link to="/auth">Login</Link>
                </Button>
                <Button asChild size="sm" className="rounded-xl shadow-sm">
                  <a href={STAFLY_WHATSAPP.bookDemo} target="_blank" rel="noopener noreferrer">
                    Book a demo
                  </a>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-primary/[0.07] blur-3xl" />
          <div className="absolute top-20 -right-32 w-[420px] h-[420px] rounded-full bg-primary/[0.05] blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/15 text-[11px] font-semibold text-primary mb-6">
            <Sparkles className="h-3 w-3" /> Operating system for service workforces
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold font-heading tracking-tight leading-[1.05] mb-6">
            Stafly <span className="text-primary">Core</span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed mb-10">
            Workforce operations, shifts, attendance and payroll-ready hours for modern staffing
            teams. Plan, dispatch, supervise and close out — from one platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-xl h-12 px-7 shadow-sm w-full sm:w-auto">
              <a href={STAFLY_WHATSAPP.bookDemo} target="_blank" rel="noopener noreferrer">
                Book a demo <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl h-12 px-7 w-full sm:w-auto">
              <a href="#features">See how it works</a>
            </Button>
            {!user && (
              <Button asChild variant="ghost" size="lg" className="rounded-xl h-12 px-5 w-full sm:w-auto">
                <Link to="/auth">Login</Link>
              </Button>
            )}
          </div>

          <p className="mt-8 inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
            <ShieldCheck className="h-3 w-3" /> Invite-only · Guided onboarding · Built for staffing operators
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40 bg-muted/20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <div className="text-center mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-2.5">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold font-heading tracking-tight leading-tight">
              Everything you need to run a workforce
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 max-w-xl mx-auto">
              From the moment you publish a shift to the moment hours are payroll-ready.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-border/50 bg-card p-6 hover:border-primary/30 hover:shadow-md transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold font-heading text-foreground mb-1.5">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="border-t border-border/40">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <div className="text-center mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-2.5">
              Modules
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold font-heading tracking-tight leading-tight">
              Built for every stage of growth
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 max-w-xl mx-auto">
              Start with Core, unlock Operations, and scale with Enterprise modules.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {MODULES.map((group) => (
              <div
                key={group.title}
                className="rounded-2xl border border-border/50 bg-card p-6"
              >
                <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground mb-4">
                  {group.title}
                </h3>
                <ul className="space-y-2.5">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                      <Check className="h-4 w-4 text-primary shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Activation note */}
      <section className="border-t border-border/40 bg-muted/20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 mb-4">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-3">
            Guided onboarding, not self-serve
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
            Stafly Core is invite-only. We review your operation, configure your company, roles and workers, and help you publish your first real shift. Implementation starts at <strong>$299</strong> — waived for selected early customers.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-xl h-12 px-7 shadow-sm w-full sm:w-auto">
              <a href={STAFLY_WHATSAPP.bookDemo} target="_blank" rel="noopener noreferrer">
                Book a demo <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl h-12 px-7 w-full sm:w-auto">
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
          <StaflyMark size={48} className="mx-auto mb-6" />
          <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-3">
            See Stafly Core in action
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto mb-8">
            Book a 30-minute walkthrough with our team. We'll show you scheduling, attendance and
            payroll-ready closeouts on real operator screens.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-xl h-12 px-7 shadow-sm w-full sm:w-auto">
              <a href={STAFLY_WHATSAPP.bookDemo} target="_blank" rel="noopener noreferrer">
                Book a demo <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            {user ? (
              <Button asChild variant="outline" size="lg" className="rounded-xl h-12 px-7 w-full sm:w-auto">
                <Link to={dashboardHref}>Go to dashboard</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg" className="rounded-xl h-12 px-7 w-full sm:w-auto">
                <Link to="/auth">Login</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
      <footer className="border-t border-border/40 bg-muted/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <StaflyLogo size={24} muted />
          <div className="flex items-center gap-5 text-[11px] text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
            <a
              href={STAFLY_WHATSAPP.bookDemo}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              WhatsApp {STAFLY_PHONE_DISPLAY_INTL}
            </a>
            <a
              href={STAFLY_MAILTO}
              className="hover:text-foreground transition-colors"
            >
              {STAFLY_EMAIL}
            </a>
          <p className="text-[11px] text-muted-foreground/60">
            © {new Date().getFullYear()} StaflyApps · staflyapps.com
          </p>
        </div>
      </footer>

    </div>
  );
}
