import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, ArrowRight, ChevronDown, Globe, Menu, X,
  CalendarClock, Smartphone, Clock, ClipboardCheck, Wallet, Building2,
  ShieldCheck, FileText, Users, MapPin, BarChart3, Settings, Headphones,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { STAFLY_WHATSAPP, STAFLY_PHONE_DISPLAY_INTL } from "@/lib/contact";


/* ── Demo Form ── */
function DemoForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", employee_count: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.company) return;
    setLoading(true);
    const { error } = await supabase.from("demo_requests" as any).insert([{ ...form, source: "pricing" }] as any);
    setLoading(false);
    if (error) toast.error("Error submitting. Try again.");
    else { toast.success("Request sent! We'll contact you soon."); setForm({ name: "", company: "", email: "", phone: "", employee_count: "" }); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Input placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" />
      <Input placeholder="Company" required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="h-11 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" />
        <Input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl" />
      </div>
      <Input placeholder="# Employees" value={form.employee_count} onChange={e => setForm({ ...form, employee_count: e.target.value })} className="h-11 rounded-xl" />
      <button type="submit" disabled={loading} className="w-full rounded-xl h-12 text-base font-semibold text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_4px_14px_-3px_hsl(222,100%,59%/0.3)] transition-all disabled:opacity-50">
        {loading ? "..." : "Submit"}
      </button>
      <div className="relative my-1 flex items-center gap-3">
        <div className="flex-1 h-px bg-[hsl(220,13%,91%)]" />
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "hsl(220,10%,55%)" }}>or</span>
        <div className="flex-1 h-px bg-[hsl(220,13%,91%)]" />
      </div>
      <a
        href={STAFLY_WHATSAPP.bookDemo}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center rounded-xl h-12 text-sm font-semibold border border-[hsl(220,13%,86%)] hover:bg-[hsl(220,20%,97%)] transition-all"
        style={{ color: "hsl(220,15%,25%)" }}
      >
        WhatsApp us · {STAFLY_PHONE_DISPLAY_INTL}
      </a>
    </form>
  );
}

/* ── Plans ── */
const plans = [
  {
    name: "Starter",
    price: "$149",
    period: "/ month",
    subtitle: "For small teams getting organized.",
    limit: "Up to 25 active workers",
    features: [
      "Shift scheduling",
      "Worker portal",
      "Shift confirmations",
      "Clock in / clock out",
      "Basic attendance",
      "Basic reports",
      "Employee profiles",
      "1 company",
    ],
    cta: "Book setup call",
    highlighted: false,
  },
  {
    name: "Operations",
    price: "$299",
    period: "/ month",
    subtitle: "For teams running weekly operations and payroll review.",
    limit: "Up to 75 active workers",
    features: [
      "Everything in Starter",
      "Daily operations dashboard",
      "Shift closeout",
      "Payroll-ready review",
      "Document tracking",
      "Admin roles and permissions",
      "Multi-location operations",
      "Payroll export / review reports",
      "Priority support",
    ],
    cta: "Book a demo",
    highlighted: true,
  },
  {
    name: "Scale",
    price: "$599+",
    period: " or Custom",
    subtitle: "For staffing companies and multi-company operations.",
    limit: "150+ active workers",
    features: [
      "150+ active workers",
      "Multi-company operations",
      "Advanced permissions",
      "Custom workflows",
      "Migration support",
      "Audit trail",
      "Custom reports",
      "Priority onboarding",
      "Integrations",
    ],
    cta: "Contact sales",
    highlighted: false,
  },
];

/* ── Modules ── */
const moduleGroups = [
  {
    title: "Core modules",
    items: ["Scheduling", "Worker portal", "Attendance", "Employee profiles", "Basic reports"],
  },
  {
    title: "Operations modules",
    items: ["Daily operations dashboard", "Shift closeout", "Payroll-ready review", "Documents", "Drivers / transport", "Admin roles"],
  },
  {
    title: "Scale modules",
    items: ["Multi-company", "Advanced permissions", "Migration / import support", "Custom reports", "Integrations", "Priority support"],
  },
];

/* ── Activation steps ── */
const activationSteps = [
  { step: "1", title: "Book a demo", desc: "We walk you through Stafly Core on a real operator screen." },
  { step: "2", title: "We review your operation", desc: "Our team learns your workflows, roles and locations." },
  { step: "3", title: "We configure your company", desc: "Roles, workers, locations and modules — set up for you." },
  { step: "4", title: "Publish your first real shift", desc: "You go live with scheduling, confirmations and attendance." },
  { step: "5", title: "Payroll-ready review", desc: "Your team starts using Stafly for attendance and payroll-ready review." },
];

/* ── FAQ ── */
const faqs = [
  { q: "Do employees need the app?", a: "Employees access their portal from any mobile browser — no app download required. They can view shifts, clock in/out, and check payroll-ready history." },
  { q: "Can I export payroll?", a: "Yes. All plans include report exports. Operations and Scale plans include advanced payroll-ready review with detailed breakdowns and audit trails." },
  { q: "Does it track GPS?", a: "GPS attendance tracking is available on Operations and Scale plans. It verifies employee location when they clock in and out." },
  { q: "Can I manage multiple companies?", a: "Yes. Scale plans support multi-company management from a single dashboard with isolated data per company." },
  { q: "Is there a setup fee?", a: "Implementation starts at $299. For selected early customers, setup may be waived as part of our founder launch offer." },
  { q: "Can I start on my own?", a: "Stafly Core is currently invite-only with guided onboarding. We configure your company, roles and workers before your first shift." },
];

export default function PublicPricing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif", background: "#ffffff", color: "hsl(220,20%,14%)" }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-[hsl(220,13%,93%)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/"><StaflyLogo size={28} /></Link>
          <div className="hidden sm:flex items-center gap-2">
            <Link to="/" className="text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              Home
            </Link>
            <Link to="/auth" className="text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              Sign in
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <button className="rounded-full px-5 h-9 text-[13px] font-semibold text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_2px_8px_-2px_hsl(222,100%,59%/0.35)] transition-all active:scale-[0.97]">
                  Book a demo
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>Book a demo</DialogTitle></DialogHeader>
                <DemoForm />
              </DialogContent>
            </Dialog>
          </div>
          <button className="sm:hidden p-2 rounded-lg hover:bg-[hsl(220,20%,96%)]" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenu && (
          <div className="sm:hidden bg-white border-t border-[hsl(220,13%,93%)] px-4 py-3 space-y-1">
            <Link to="/" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(222,100%,59%)" }}>Home</Link>
            <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(222,100%,59%)" }}>Sign in</Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="pt-16 sm:pt-24 pb-4 text-center px-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[hsl(222,100%,59%)]/10 border border-[hsl(222,100%,59%)]/15 text-[11px] font-semibold text-[hsl(222,100%,59%)] mb-5">
          <ShieldCheck className="h-3 w-3" /> Invite-only · Guided onboarding
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.12]" style={{ color: "hsl(220,25%,10%)" }}>
          Pricing that matches your operation
        </h1>
        <p className="mt-4 text-[15px] sm:text-lg max-w-xl mx-auto" style={{ color: "hsl(220,10%,45%)" }}>
          Stafly Core is built for real staffing operations. Every plan includes scheduling, attendance and a worker portal.
        </p>
      </section>

      {/* ── PLANS ── */}
      <section className="py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`relative bg-white rounded-2xl p-7 transition-all ${
                  plan.highlighted
                    ? "border-2 border-[hsl(222,100%,59%)] shadow-[0_8px_30px_-6px_hsl(222,100%,59%/0.12)] scale-[1.02]"
                    : "border border-[hsl(220,13%,91%)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[11px] font-semibold px-3.5 py-1 rounded-full bg-[hsl(222,100%,59%)]">
                    Recommended
                  </span>
                )}

                <h3 className="font-bold text-lg" style={{ color: "hsl(220,25%,10%)" }}>{plan.name}</h3>
                <p className="text-sm mt-1" style={{ color: "hsl(220,10%,50%)" }}>{plan.subtitle}</p>

                <div className="flex items-baseline gap-1 mt-5 mb-2">
                  <span className="text-4xl font-extrabold" style={{ color: "hsl(220,25%,10%)" }}>{plan.price}</span>
                  {plan.period && <span className="text-sm" style={{ color: "hsl(220,10%,50%)" }}>{plan.period}</span>}
                </div>
                <p className="text-xs font-medium mb-6" style={{ color: "hsl(220,10%,45%)" }}>{plan.limit}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm" style={{ color: "hsl(220,10%,40%)" }}>
                      <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(163,68%,45%)" }} /> {f}
                    </li>
                  ))}
                </ul>

                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      className={`w-full rounded-xl h-11 font-semibold text-sm transition-all active:scale-[0.97] ${
                        plan.highlighted
                          ? "text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_4px_14px_-3px_hsl(222,100%,59%/0.3)]"
                          : "border border-[hsl(220,13%,86%)] hover:bg-[hsl(220,20%,97%)]"
                      }`}
                      style={!plan.highlighted ? { color: "hsl(220,15%,25%)" } : undefined}
                    >
                      {plan.cta}
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader><DialogTitle>{plan.name === "Scale" ? "Contact sales" : plan.cta}</DialogTitle></DialogHeader>
                    <DemoForm />
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPLEMENTATION NOTE ── */}
      <section className="py-10 sm:py-14" style={{ background: "hsl(220,30%,98%)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-[hsl(222,100%,59%)]/10 mb-4">
            <Settings className="h-5 w-5" style={{ color: "hsl(222,100%,59%)" }} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2" style={{ color: "hsl(220,25%,10%)" }}>
            Implementation included
          </h2>
          <p className="text-sm sm:text-base leading-relaxed" style={{ color: "hsl(220,10%,45%)" }}>
            Implementation starts at <strong style={{ color: "hsl(220,25%,10%)" }}>$299</strong>. We configure your company, roles, workers and first locations so you can publish real shifts on day one.
          </p>
          <p className="text-xs sm:text-sm mt-2" style={{ color: "hsl(220,10%,50%)" }}>
            Founder launch offer: setup may be waived for selected early customers.
          </p>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-3" style={{ color: "hsl(220,25%,10%)" }}>
            What's included
          </h2>
          <p className="text-sm sm:text-base text-center mb-12 max-w-xl mx-auto" style={{ color: "hsl(220,10%,45%)" }}>
            Core workforce operations, plus advanced modules as you scale.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {moduleGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-[hsl(220,13%,91%)] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-4" style={{ color: "hsl(220,10%,50%)" }}>{group.title}</h3>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: "hsl(220,10%,35%)" }}>
                      <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(163,68%,45%)" }} /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACTIVATION FLOW ── */}
      <section className="py-16 sm:py-20" style={{ background: "hsl(220,30%,98%)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-3" style={{ color: "hsl(220,25%,10%)" }}>
            How activation works
          </h2>
          <p className="text-sm sm:text-base text-center mb-12 max-w-xl mx-auto" style={{ color: "hsl(220,10%,45%)" }}>
            Guided onboarding from demo to first real shift.
          </p>
          <div className="space-y-4">
            {activationSteps.map((s, i) => (
              <div key={i} className="flex items-start gap-4 rounded-xl border border-[hsl(220,13%,91%)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="h-8 w-8 rounded-lg bg-[hsl(222,100%,59%)]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold" style={{ color: "hsl(222,100%,59%)" }}>{s.step}</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: "hsl(220,25%,10%)" }}>{s.title}</h4>
                  <p className="text-sm mt-0.5" style={{ color: "hsl(220,10%,45%)" }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10" style={{ color: "hsl(220,25%,10%)" }}>
            Frequently asked questions
          </h2>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-[hsl(220,13%,91%)] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold" style={{ color: "hsl(220,25%,10%)" }}>{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`}
                    style={{ color: "hsl(220,10%,55%)" }}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(220,10%,45%)" }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl px-6 py-14 sm:px-14 sm:py-20 text-center" style={{ background: "linear-gradient(135deg, hsl(222,100%,59%), hsl(226,76%,49%))" }}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
              Ready to run your workforce on Stafly Core?
            </h2>
            <p className="mt-4 text-white/70 text-[15px] max-w-lg mx-auto">
              Book a 30-minute walkthrough. We'll show you scheduling, attendance and payroll-ready closeouts on real operator screens.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-full px-7 h-12 bg-white font-semibold text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all hover:bg-white/90 active:scale-[0.97]" style={{ color: "hsl(222,100%,59%)" }}>
                    Book a demo <ArrowRight className="h-4 w-4" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-2xl">
                  <DialogHeader><DialogTitle>Book a demo</DialogTitle></DialogHeader>
                  <DemoForm />
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center rounded-full h-12 px-7 border border-white/40 text-white hover:bg-white/10 font-semibold text-[15px] transition-all active:scale-[0.97]">
                    Contact sales
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-2xl">
                  <DialogHeader><DialogTitle>Contact sales</DialogTitle></DialogHeader>
                  <DemoForm />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[hsl(220,13%,93%)] py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <StaflyLogo size={24} />
          <div className="flex items-center gap-6 text-[13px]" style={{ color: "hsl(220,10%,50%)" }}>
            <Link to="/" className="hover:text-[hsl(220,20%,14%)] transition-colors">Home</Link>
            <Link to="/pricing" className="hover:text-[hsl(220,20%,14%)] transition-colors">Pricing</Link>
            <Link to="/privacy" className="hover:text-[hsl(220,20%,14%)] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[hsl(220,20%,14%)] transition-colors">Terms</Link>
            <a href={STAFLY_WHATSAPP.bookDemo} target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(220,20%,14%)] transition-colors">
              WhatsApp {STAFLY_PHONE_DISPLAY_INTL}
            </a>
          </div>

          <p className="text-xs" style={{ color: "hsl(220,10%,58%)" }}>© {new Date().getFullYear()} Stafly Core</p>
        </div>
      </footer>
    </div>
  );
}
