import { MapPin, Navigation, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { googleMapsUrl, appleMapsUrl, wazeUrl } from "@/lib/geo-helpers";

interface NavigationButtonsProps {
  latitude: number;
  longitude: number;
  label?: string;
  compact?: boolean;
}

export function NavigationButtons({ latitude, longitude, label, compact }: NavigationButtonsProps) {
  const links = [
    { name: "Google Maps", url: googleMapsUrl(latitude, longitude), icon: "🗺️" },
    { name: "Apple Maps", url: appleMapsUrl(latitude, longitude), icon: "🍎" },
    { name: "Waze", url: wazeUrl(latitude, longitude), icon: "🚗" },
  ];

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
            <Navigation className="h-3 w-3" />
            Navegar
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1.5" align="end">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm hover:bg-muted transition-colors"
            >
              <span>{l.icon}</span>
              <span>{l.name}</span>
              <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
            </a>
          ))}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {label}
        </p>
      )}
      <div className="flex gap-1.5 flex-wrap">
        {links.map((l) => (
          <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <span>{l.icon}</span> {l.name}
            </Button>
          </a>
        ))}
      </div>
    </div>
  );
}
