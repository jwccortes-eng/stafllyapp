import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Globe, Building2, Shield } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { Helmet } from "react-helmet-async";

const EFFECTIVE_DATE = "July 29, 2026";

const SECTIONS = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <>
        <p>
          Stafly (&ldquo;Stafly,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) is committed to protecting the privacy of every
          user of our workforce management platform. This Privacy Policy explains
          what personal information we collect, how we use it, how we share it,
          and the choices you have about your information.
        </p>
        <p>
          This policy applies to the Stafly website, mobile applications, and
          related services (collectively, the &ldquo;Services&rdquo;). By using
          the Services, you agree to the practices described in this Privacy
          Policy. If you do not agree, you should not use the Services.
        </p>
        <p>
          The Services are provided by <strong>NEX Ecosystem LLC</strong>. This
          policy is intended to be a publicly accessible Privacy Policy URL and
          may be referenced for app store submissions and similar
          registrations.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    body: (
      <>
        <p>
          We collect information that you provide directly to us, information
          generated as you use the Services, and information from your employer
          or staffing agency that manages your account. The types of
          information we may collect include:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Name:</strong> your first and last name as provided during
            registration or onboarding.
          </li>
          <li>
            <strong>Phone number:</strong> used for account verification,
            authentication, and workforce notifications.
          </li>
          <li>
            <strong>Email address:</strong> used for login, account recovery,
            and operational communications.
          </li>
          <li>
            <strong>Profile information:</strong> profile photo, display name,
            role, department, and other details you or your employer add to
            your profile.
          </li>
          <li>
            <strong>Employment information:</strong> job title, employment
            status, start date, work location, and related employer-assigned
            attributes.
          </li>
          <li>
            <strong>Onboarding information:</strong> data collected during
            onboarding, such as consent acknowledgments, completion steps, and
            form submissions.
          </li>
          <li>
            <strong>Government-issued documents:</strong> documents uploaded by
            users, such as work authorizations, identification, and tax forms
            (for example, a Form W-9), when applicable and submitted by you or
            your employer.
          </li>
          <li>
            <strong>Work schedules:</strong> assigned shifts, schedules, shift
            locations, and related operational notes.
          </li>
          <li>
            <strong>Time clock records:</strong> clock-in and clock-out times,
            break records, and hours worked.
          </li>
          <li>
            <strong>Attendance records:</strong> attendance status, missed
            shifts, tardiness, and related attendance events.
          </li>
          <li>
            <strong>Location data:</strong> GPS location used for attendance
            verification, collected only when required and in accordance with
            employer policies and device permissions.
          </li>
          <li>
            <strong>Photos and uploaded files:</strong> images and files you
            upload, such as profile photos, documents, and supporting evidence
            for attendance or compliance.
          </li>
          <li>
            <strong>Device information:</strong> device type, operating system,
            and identifiers used to deliver and secure the Services.
          </li>
          <li>
            <strong>Push notification tokens:</strong> tokens used to send
            work-related push notifications to your device.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "3. How We Use Information",
    body: (
      <>
        <p>We use the information we collect to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Provide workforce management services.</li>
          <li>Manage shifts, assignments, and schedules.</li>
          <li>Verify attendance and time clock entries.</li>
          <li>Complete onboarding for new users.</li>
          <li>
            Improve security, including authentication, fraud prevention, and
            access control.
          </li>
          <li>Send work-related notifications, reminders, and alerts.</li>
          <li>Comply with legal, contractual, and regulatory obligations.</li>
        </ul>
      </>
    ),
  },
  {
    id: "location-services",
    title: "4. Location Services",
    body: (
      <>
        <p>
          Location data is collected only when required for attendance
          verification. Stafly does not track your location continuously in the
          background. Location may be used during a clock-in or clock-out
          action, or when your employer requires location validation for a
          specific shift.
        </p>
        <p>
          Location collection follows your employer&rsquo;s policies and the
          permissions you grant on your device. You may withhold or revoke
          location permission through your device settings; doing so may limit
          certain features that depend on location verification.
        </p>
      </>
    ),
  },
  {
    id: "information-sharing",
    title: "5. Information Sharing",
    body: (
      <>
        <p>
          <strong>We do not sell personal information.</strong>
        </p>
        <p>We may share information only with:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Your employer:</strong> the company or staffing agency that
            manages your account may access your work-related information,
            including schedules, time clock records, and attendance.
          </li>
          <li>
            <strong>Service providers:</strong> providers that operate the
            platform, such as hosting, authentication, analytics, and
            notification delivery services, under appropriate confidentiality
            obligations.
          </li>
          <li>
            <strong>Government authorities:</strong> when disclosure is legally
            required or necessary to protect rights, safety, or property.
          </li>
          <li>
            <strong>Other parties with your consent:</strong> any other sharing
            occurs only with your explicit consent.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-security",
    title: "6. Data Security",
    body: (
      <>
        <p>
          We apply industry-standard technical and organizational safeguards to
          protect personal information. These measures include encryption in
          transit (TLS), encrypted storage, tenant-level data isolation,
          role-based access control, audit logging, and regular security
          reviews.
        </p>
        <p>
          No system is completely secure, and we cannot guarantee absolute
          protection. We continuously work to strengthen our safeguards and
          respond promptly to suspected security incidents.
        </p>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "7. Data Retention",
    body: (
      <>
        <p>
          We retain personal information only as long as necessary for
          operational, legal, and contractual purposes. Retention periods
          depend on the type of information, applicable legal requirements, and
          the status of your account.
        </p>
        <p>
          After your account is deactivated, personal identifiers are removed or
          anonymized within a reasonable period, except where longer retention
          is required for legal, tax, audit, or compliance obligations.
        </p>
      </>
    ),
  },
  {
    id: "user-rights",
    title: "8. User Rights",
    body: (
      <>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Access the personal information we hold about you.</li>
          <li>Request correction of inaccurate or incomplete information.</li>
          <li>Request deletion of your personal information, where applicable.</li>
          <li>Request a copy of your personal information.</li>
          <li>
            Withdraw consent for optional data processing, such as location or
            notifications, where applicable.
          </li>
        </ul>
        <p>
          To exercise any of these rights, please contact us using the
          information in the Contact section below. We will respond within a
          reasonable timeframe and in accordance with applicable law.
        </p>
      </>
    ),
  },
  {
    id: "childrens-privacy",
    title: "9. Children's Privacy",
    body: (
      <>
        <p>
          Stafly is not intended for children under 13 years old. We do not
          knowingly collect personal information from children under 13. If you
          believe we have collected information from a child under 13, please
          contact us so we can delete it.
        </p>
      </>
    ),
  },
  {
    id: "changes-to-this-policy",
    title: "10. Changes to this Policy",
    body: (
      <>
        <p>
          We may update this Privacy Policy from time to time. When we make
          changes, we will publish the updated policy with a revised effective
          date. We encourage you to review this page periodically to stay
          informed about how we protect your information.
        </p>
        <p>
          Material changes will be communicated through the Services or by other
          reasonable means. Your continued use of the Services after a change
          takes effect constitutes acceptance of the updated policy.
        </p>
      </>
    ),
  },
  {
    id: "contact-information",
    title: "11. Contact Information",
    body: (
      <>
        <p>If you have questions about this Privacy Policy, please contact us:</p>
        <ul className="space-y-3 list-none pl-0">
          <li className="flex items-start gap-3">
            <Building2
              className="h-5 w-5 text-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>
              <span className="block font-semibold text-foreground">
                Company
              </span>
              NEX Ecosystem LLC
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Mail
              className="h-5 w-5 text-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>
              <span className="block font-semibold text-foreground">
                Support Email
              </span>
              <a
                href="mailto:support@staflycore.com"
                className="text-primary hover:underline font-medium break-all"
              >
                support@staflycore.com
              </a>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Globe
              className="h-5 w-5 text-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>
              <span className="block font-semibold text-foreground">
                Website
              </span>
              <a
                href="https://staflycore.com"
                className="text-primary hover:underline font-medium break-all"
              >
                https://staflycore.com
              </a>
            </span>
          </li>
        </ul>
      </>
    ),
  },
] as const;

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Privacy Policy | Stafly</title>
        <meta
          name="description"
          content="Learn how Stafly collects, uses, stores and protects your personal information."
        />
        <meta property="og:title" content="Privacy Policy | Stafly" />
        <meta
          property="og:description"
          content="Learn how Stafly collects, uses, stores and protects your personal information."
        />
        <meta property="og:type" content="article" />
        <link rel="canonical" href="/privacy" />
      </Helmet>

      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="container flex items-center justify-between h-14">
          <Link
            to="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Link>
          <StaflyLogo size={28} />
        </div>
      </header>

      <main
        className="container max-w-3xl px-4 sm:px-6 py-10 sm:py-14 space-y-10 animate-fade-in overflow-x-hidden"
      >
        {/* Title block */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Privacy
          </div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-foreground tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Effective Date: {EFFECTIVE_DATE}
          </p>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
            This Privacy Policy describes how Stafly collects, uses, stores, and
            protects your personal information when you use our workforce
            management services.
          </p>
        </header>

        {/* Table of contents */}
        <nav aria-label="Table of contents" className="rounded-xl border border-border/50 bg-card/50 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Contents
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Body */}
        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-20"
            >
              <h2
                id={`${section.id}-title`}
                className="text-xl sm:text-2xl font-heading font-semibold text-foreground mb-3"
              >
                {section.title}
              </h2>
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-muted-foreground leading-relaxed">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-muted-foreground">
          <div>
            &copy; {new Date().getFullYear()} NEX Ecosystem LLC. All rights
            reserved.
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
            <span className="text-border" aria-hidden="true">
              &middot;
            </span>
            <Link to="/cookies" className="hover:text-primary transition-colors">
              Cookie Policy
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
