import { MessageCircle, MessageSquare, Mail } from "lucide-react";
import {
  contactWhatsApp,
  contactSms,
  STAFLY_EMAIL,
  buildStaflyMailto,
} from "@/lib/contact";

interface Props {
  className?: string;
}

export function PublicContactStrip({ className = "" }: Props) {
  const mailto = buildStaflyMailto(
    "StaflyApps inquiry",
    "Hi, I'd like to learn more about StaflyApps for my company."
  );

  return (
    <section className={`border-t border-border/40 bg-muted/20 ${className}`}>
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-3">
          Talk to us
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
          Have questions before starting setup? Message us directly and we'll help
          you choose the right plan.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={contactWhatsApp()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl h-12 px-6 bg-primary text-primary-foreground font-semibold text-sm shadow-sm hover:opacity-90 transition-all w-full sm:w-auto"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp us
          </a>
          <a
            href={contactSms()}
            className="inline-flex items-center justify-center gap-2 rounded-xl h-12 px-6 border border-border font-semibold text-sm hover:bg-muted/40 transition-all w-full sm:w-auto"
          >
            <MessageSquare className="h-4 w-4" /> Text us
          </a>
          {STAFLY_EMAIL && (
            <a
              href={mailto}
              className="inline-flex items-center justify-center gap-2 rounded-xl h-12 px-6 border border-border font-semibold text-sm hover:bg-muted/40 transition-all w-full sm:w-auto"
            >
              <Mail className="h-4 w-4" /> Email us
            </a>
          )}
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground/80 leading-relaxed">
          Guided setup starts at $299. New companies are activated manually after review.
        </p>
      </div>
    </section>
  );
}
