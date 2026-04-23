import { cn } from "@/lib/utils";
import heroPlatformPremium from "@/assets/hero-platform-premium.jpg";
import staflyDashboardMockup from "@/assets/stafly-dashboard-mockup.png";
import staflyHero from "@/assets/stafly-hero.png";

const ATTRACT_SLIDES = [
  {
    id: "ecosystem",
    image: heroPlatformPremium,
    position: "center center",
    secondary: staflyDashboardMockup,
    secondaryClassName: "left-[7%] top-[16%] w-[36vw] max-w-[34rem]",
  },
  {
    id: "community",
    image: heroPlatformPremium,
    position: "left center",
    secondary: staflyHero,
    secondaryClassName: "right-[6%] bottom-[10%] w-[30vw] max-w-[26rem]",
  },
  {
    id: "operations",
    image: heroPlatformPremium,
    position: "right center",
    secondary: staflyDashboardMockup,
    secondaryClassName: "right-[5%] top-[14%] w-[34vw] max-w-[32rem]",
  },
  {
    id: "growth",
    image: staflyDashboardMockup,
    position: "center top",
    secondary: heroPlatformPremium,
    secondaryClassName: "left-[4%] top-[8%] h-[84%] w-[48vw] max-w-[40rem]",
  },
];

/**
 * Active session backdrop — clean, premium, minimal.
 * Used while the user is actively interacting with the kiosk
 * (welcome, phone, selection, profile, payments, closure, etc.).
 * No marketing artwork; just a soft gradient + barely-perceptible grid
 * so the form content is the protagonist.
 */
export function FrontDeskBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-background" />
      {/* Very soft premium gradient — adds depth without competing with content */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 12% 0%, hsl(var(--primary) / 0.05), transparent 42%), radial-gradient(circle at 92% 100%, hsl(var(--accent) / 0.05), transparent 40%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.35) 100%)",
        }}
      />
      {/* Barely-there grid for premium SaaS feel */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.08)_1px,transparent_1px)] bg-[size:56px_56px] opacity-60" />
    </div>
  );
}

/**
 * Legacy expressive backdrop — kept for attract/idle surfaces only.
 * Do NOT use during active session flows.
 */
export function FrontDeskIdleBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-background" />
      <img
        src={heroPlatformPremium}
        alt=""
        className="absolute inset-y-0 right-[-10%] h-full w-[68%] object-cover opacity-20 blur-md saturate-[0.9]"
      />
      <img
        src={staflyDashboardMockup}
        alt=""
        className="absolute left-[-6%] top-[14%] w-[42%] max-w-[30rem] opacity-12 blur-[1px]"
      />
      <img
        src={staflyHero}
        alt=""
        className="absolute bottom-[-4%] right-[6%] w-[28%] max-w-[20rem] opacity-10 blur-[0.5px]"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at top left, hsl(var(--primary) / 0.14), transparent 34%), radial-gradient(circle at bottom right, hsl(var(--accent) / 0.16), transparent 30%), linear-gradient(135deg, hsl(var(--background) / 0.74), hsl(var(--background) / 0.92))",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.12)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.12)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40" />
    </div>
  );
}

export function FrontDeskAttractGallery({
  activeIndex,
  className,
}: {
  activeIndex: number;
  className?: string;
}) {
  const safeIndex = ((activeIndex % ATTRACT_SLIDES.length) + ATTRACT_SLIDES.length) % ATTRACT_SLIDES.length;

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {ATTRACT_SLIDES.map((slide, index) => {
        const isActive = index === safeIndex;

        return (
          <div
            key={slide.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000",
              isActive ? "opacity-100" : "opacity-0"
            )}
          >
            <img
              src={slide.image}
              alt=""
              className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px] saturate-[0.95]"
              style={{ objectPosition: slide.position }}
            />
            <div className="absolute inset-0 bg-background/58" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--background) / 0.30), hsl(var(--background) / 0.68)), radial-gradient(circle at 18% 18%, hsl(var(--primary) / 0.18), transparent 26%), radial-gradient(circle at 86% 70%, hsl(var(--accent) / 0.16), transparent 24%)",
              }}
            />

            {slide.secondary && (
              <div
                className={cn(
                  "absolute overflow-hidden rounded-[2rem] border border-border/30 bg-card/10 shadow-2xl backdrop-blur-[2px]",
                  slide.secondaryClassName
                )}
              >
                <img src={slide.secondary} alt="" className="h-full w-full object-cover opacity-80" />
              </div>
            )}
          </div>
        );
      })}

      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.1)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.1)_1px,transparent_1px)] bg-[size:52px_52px] opacity-35" />
    </div>
  );
}