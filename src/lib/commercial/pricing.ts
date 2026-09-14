/**
 * Canonical public commercial model — single source of truth for Stafly Core
 * public pricing, guided implementation and CTAs.
 *
 * Rules:
 *  - No free plan, no trial, no self-service activation.
 *  - Every new company is activated manually after review.
 *  - Any public surface (landing, pricing page, mobile) MUST read from here.
 */
import {
  contactSales,
  operationsPaymentOrWhatsApp,
  starterPaymentOrWhatsApp,
  guidedSetupPaymentOrWhatsApp,
  bookDemo,
} from "@/lib/contact";

export interface PublicPlan {
  id: "starter" | "operations" | "scale";
  name: string;
  price: string;
  period: string;
  subtitle: string;
  limit: string;
  features: string[];
  cta: string;
  getHref: () => string;
  highlighted: boolean;
  badge?: string;
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$149",
    period: "/ month",
    subtitle: "For small teams getting organized.",
    limit: "Up to 25 active workers",
    features: [
      "Worker directory",
      "Basic shift scheduling",
      "Attendance visibility",
      "Document readiness basics",
    ],
    cta: "Talk to us",
    getHref: () => starterPaymentOrWhatsApp(),
    highlighted: false,
  },
  {
    id: "operations",
    name: "Operations",
    price: "$299",
    period: "/ month",
    subtitle: "For staffing/service companies running weekly operations.",
    limit: "Up to 75 active workers",
    features: [
      "Workers and roles",
      "Shift planning and publishing",
      "Attendance tracking",
      "Documents",
      "Payroll-ready hour reports",
      "Admin operations dashboard",
      "Guided onboarding support",
    ],
    cta: "Talk to us",
    getHref: () => operationsPaymentOrWhatsApp(),
    highlighted: true,
    badge: "Recommended",
  },
  {
    id: "scale",
    name: "Scale",
    price: "$599+",
    period: " or Custom",
    subtitle: "For multi-location or high-volume operations.",
    limit: "150+ active workers",
    features: [
      "Multi-team operations",
      "Advanced admin workflows",
      "Priority setup",
      "Migration support",
      "Custom operational review",
    ],
    cta: "Contact sales",
    getHref: () => contactSales(),
    highlighted: false,
  },
];

export const GUIDED_IMPLEMENTATION = {
  name: "Guided implementation",
  price: "$299",
  priceNote: "starting at, one-time",
  headline: "Guided implementation starts at $299 one-time",
  includes: [
    "Company workspace setup",
    "Initial admin/user setup",
    "Up to 25 workers loaded",
    "First real schedule configured",
    "Attendance walkthrough",
    "Payroll-ready hours orientation",
    "Manual activation after review",
  ],
  primaryCta: { label: "Start guided setup", getHref: () => guidedSetupPaymentOrWhatsApp() },
  secondaryCta: { label: "Book a demo", getHref: () => bookDemo() },
  activationNotice:
    "All new companies are activated through guided onboarding. We do not automatically activate public signups without review.",
} as const;

export const PRICING_SUMMARY_LINE =
  "Monthly plans start at $149/month. Guided implementation starts at $299 one-time.";
