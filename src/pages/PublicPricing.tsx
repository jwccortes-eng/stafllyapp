import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, ArrowRight, ChevronDown, Globe, Menu, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

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
    </form>
  );
}

/* ── Plans ── */
const plans = [
  {
    name: "Starter",
    price: "$29",
    period: "/ month",
    desc: "Up to 20 employees",
    features: ["Shift scheduling", "Clock-in / Clock-out", "Mobile employee portal", "Basic reports"],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Business",
    price: "$79",
    period: "/ month",
    desc: "Up to 100 employees",
    features: ["Everything in Starter", "GPS attendance tracking", "Advanced reports", "Role permissions", "Payroll export"],
    cta: "Start free",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For larger teams",
    features: ["Unlimited employees", "Advanced permissions", "Custom integrations", "Priority support"],
    cta: "Contact sales",
    highlighted: false,
  },
];

/* ── FAQ ── */
const faqs = [
  { q: "Do employees need the app?", a: "Employees access their portal from any mobile browser — no app download required. They can view shifts, clock in/out, and check payments." },
  { q: "Can I export payroll?", a: "Yes. All plans include report exports. Business and Enterprise plans include advanced payroll export with detailed breakdowns." },
  { q: "Does it track GPS?", a: "GPS attendance tracking is available on Business and Enterprise plans. It verifies employee location when they clock in and out." },
  { q: "Can I manage multiple companies?", a: "Yes. Enterprise plans support multi-company management from a single dashboard with isolated data per company." },
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
            <Link to="/portal" className="text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              Employee portal
            </Link>
            <Link to="/auth" className="text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              Sign in
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <button className="rounded-full px-5 h-9 text-[13px] font-semibold text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_2px_8px_-2px_hsl(222,100%,59%/0.35)] transition-all active:scale-[0.97]">
                  Start free
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>Get started</DialogTitle></DialogHeader>
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
            <Link to="/portal" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(222,100%,59%)" }}>Employee portal</Link>
            <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(222,100%,59%)" }}>Sign in</Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="pt-16 sm:pt-24 pb-4 text-center px-4">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.12]" style={{ color: "hsl(220,25%,10%)" }}>
          Simple pricing for growing teams
        </h1>
        <p className="mt-4 text-[15px] sm:text-lg max-w-xl mx-auto" style={{ color: "hsl(220,10%,45%)" }}>
          Choose the plan that fits your team size.
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
                <p className="text-sm mt-1" style={{ color: "hsl(220,10%,50%)" }}>{plan.desc}</p>

                <div className="flex items-baseline gap-1 mt-5 mb-6">
                  <span className="text-4xl font-extrabold" style={{ color: "hsl(220,25%,10%)" }}>{plan.price}</span>
                  {plan.period && <span className="text-sm" style={{ color: "hsl(220,10%,50%)" }}>{plan.period}</span>}
                </div>

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
                    <DialogHeader><DialogTitle>{plan.name === "Enterprise" ? "Contact sales" : "Get started"}</DialogTitle></DialogHeader>
                    <DemoForm />
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-24" style={{ background: "hsl(220,30%,98%)" }}>
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
              Start managing your team today.
            </h2>
            <p className="mt-4 text-white/70 text-[15px] max-w-lg mx-auto">
              Set up your account in minutes and take control of shifts, attendance, and payroll.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-full px-7 h-12 bg-white font-semibold text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all hover:bg-white/90 active:scale-[0.97]" style={{ color: "hsl(222,100%,59%)" }}>
                    Start free <ArrowRight className="h-4 w-4" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-2xl">
                  <DialogHeader><DialogTitle>Get started</DialogTitle></DialogHeader>
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
            <Link to="/portal" className="font-medium transition-colors" style={{ color: "hsl(222,100%,59%)" }}>Employee portal</Link>
            <Link to="/privacy" className="hover:text-[hsl(220,20%,14%)] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[hsl(220,20%,14%)] transition-colors">Terms</Link>
          </div>
          <p className="text-xs" style={{ color: "hsl(220,10%,58%)" }}>© {new Date().getFullYear()} StaflyApps</p>
        </div>
      </footer>
    </div>
  );
}
