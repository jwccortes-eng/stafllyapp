import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Mail } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="container flex items-center justify-between h-14">
          <Link
            to="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <StaflyLogo size={28} />
        </div>
      </header>

      <main className="container max-w-3xl px-4 sm:px-6 py-12 space-y-8 animate-fade-in overflow-x-hidden">
        {/* Title block */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: June 12, 2026
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Stafly Core Workforce</strong> — workforce operations for employees, supervisors, and staffing companies.
          </p>
        </div>

        {/* Body */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground">1. Information We Collect</h2>
            <p>Stafly Core Workforce may collect the following information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> name, email address, phone number, and company/tenant affiliation.</li>
              <li><strong>Work profile:</strong> job role, department, start date, profile photo, and work status.</li>
              <li><strong>Shift data:</strong> assigned shifts, schedules, shift locations, and related operational notes.</li>
              <li><strong>Time clock records:</strong> clock-in and clock-out times, break records, and hours worked.</li>
              <li><strong>Location data:</strong> GPS location collected only during clock-in/clock-out or shift validation, when required by your employer or supervisor.</li>
              <li><strong>Work documents:</strong> employment-related documents such as work authorizations, tax forms (e.g., W-9), and compliance documents, when applicable and submitted by you.</li>
              <li><strong>Device and notifications:</strong> device type, operating system, and push notification tokens for workforce alerts.</li>
              <li><strong>Feedback:</strong> support requests, ratings, and feedback you provide through the app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Authenticate your login and secure your account.</li>
              <li>Assign, display, and manage work shifts.</li>
              <li>Record and validate time clock entries.</li>
              <li>Send operational communications, shift reminders, and notifications.</li>
              <li>Support compliance, safety, and workforce documentation requirements.</li>
              <li>Provide customer and technical support.</li>
              <li>Maintain platform security and improve the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">3. Data Sharing</h2>
            <p><strong>We do not sell personal data.</strong></p>
            <p>We may share data only with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Your employer / staffing tenant:</strong> shift assignments, time clock records, and related operational data are shared with the company or staffing agency that manages your account.</li>
              <li><strong>Technical service providers:</strong> secure hosting, authentication, analytics, and notification delivery providers necessary to operate the platform.</li>
              <li><strong>Legal authorities:</strong> when required by applicable law or to protect rights and safety.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">4. Payroll and Payments</h2>
            <p>Payroll calculations and administrative payments are handled outside of the Stafly Core Workforce mobile app, through authorized backend or administrative systems managed by your employer. The app does not process consumer purchases or in-app payments.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">5. Location Data</h2>
            <p>GPS location is collected only when you perform a clock-in or clock-out action, or when your employer requires location validation for a specific shift. We do not track your location continuously in the background.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">6. Data Security</h2>
            <p>We apply industry-standard measures to protect your data, including encryption in transit (TLS), encrypted storage, tenant-level data isolation (Row Level Security), role-based access control, and audit logging.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate or incomplete data.</li>
              <li>Request deletion of your personal data, subject to legal retention obligations.</li>
              <li>Withdraw consent for optional data processing (such as location or notifications).</li>
            </ul>
            <p>To exercise these rights, please contact us using the information below.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">8. Retention</h2>
            <p>We retain your data while your account is active. After account deactivation, personal identifiers are removed or anonymized within 30 days, except where longer retention is required for legal, tax, or compliance purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">9. Contact Us</h2>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <a href="mailto:jwc.cortes@icloud.com" className="text-primary hover:underline font-medium">
                jwc.cortes@icloud.com
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-border/40 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-primary transition-colors">
            Terms of Service
          </Link>
          <span className="text-border">·</span>
          <Link to="/cookies" className="hover:text-primary transition-colors">
            Cookie Policy
          </Link>
        </div>
      </main>
    </div>
  );
}
