import { useEffect, useRef } from "react";
import L from "leaflet";
import { googleMapsUrl } from "@/lib/geo-helpers";
import "leaflet/dist/leaflet.css";

export type LiveMapLayer = "all" | "workers" | "locations" | "alerts";

export interface LiveMapWorker {
  employee_id: string;
  employee_name: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  clock_in: string;
  shift_title: string;
  client_name: string;
  phone: string | null;
}

export interface LiveMapLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  city: string | null;
}

interface LiveOperationsMapProps {
  workers: LiveMapWorker[];
  locations: LiveMapLocation[];
  showLayer: LiveMapLayer;
}

const DEFAULT_CENTER: [number, number] = [25.7617, -80.1918];

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const workerIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const locationIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatClockTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildLocationPopup(location: LiveMapLocation): string {
  const locationLink = googleMapsUrl(location.latitude, location.longitude);

  return `
    <div style="font-size:12px;line-height:1.35;min-width:160px;">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px;">${escapeHtml(location.name)}</p>
      ${location.city ? `<p style="margin:0 0 4px;color:#64748b;">${escapeHtml(location.city)}</p>` : ""}
      <p style="margin:0 0 6px;">Radio: ${Math.round(location.geofence_radius)}m</p>
      <a href="${locationLink}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">Abrir en Maps</a>
    </div>
  `;
}

function buildWorkerPopup(worker: LiveMapWorker): string {
  const locationLink = googleMapsUrl(worker.latitude, worker.longitude);

  return `
    <div style="font-size:12px;line-height:1.35;min-width:180px;">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px;">🟢 ${escapeHtml(worker.employee_name)}</p>
      <p style="margin:0 0 3px;"><strong>Turno:</strong> ${escapeHtml(worker.shift_title)}</p>
      ${worker.client_name ? `<p style="margin:0 0 3px;"><strong>Cliente:</strong> ${escapeHtml(worker.client_name)}</p>` : ""}
      <p style="margin:0 0 3px;"><strong>Entrada:</strong> ${formatClockTime(worker.clock_in)}</p>
      <p style="margin:0 0 6px;"><strong>Precisión GPS:</strong> ±${Math.round(worker.accuracy)}m</p>
      ${worker.phone ? `<a href="tel:${escapeHtml(worker.phone)}" style="display:block;color:#2563eb;text-decoration:underline;margin-bottom:4px;">📞 ${escapeHtml(worker.phone)}</a>` : ""}
      <a href="${locationLink}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">Navegar</a>
    </div>
  `;
}

export function LiveOperationsMap({ workers, locations, showLayer }: LiveOperationsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView(DEFAULT_CENTER, 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const bounds: L.LatLngTuple[] = [];

    if (showLayer === "all" || showLayer === "locations") {
      locations.forEach((location) => {
        const point: L.LatLngTuple = [location.latitude, location.longitude];
        bounds.push(point);

        const geofence = L.circle(point, {
          radius: location.geofence_radius,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.1,
          weight: 1,
        });

        const marker = L.marker(point, { icon: locationIcon }).bindPopup(buildLocationPopup(location));

        geofence.addTo(layerGroup);
        marker.addTo(layerGroup);
      });
    }

    if (showLayer === "all" || showLayer === "workers") {
      workers.forEach((worker) => {
        const point: L.LatLngTuple = [worker.latitude, worker.longitude];
        bounds.push(point);

        L.marker(point, { icon: workerIcon }).bindPopup(buildWorkerPopup(worker)).addTo(layerGroup);
      });
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    } else {
      map.setView(DEFAULT_CENTER, 12);
    }
  }, [workers, locations, showLayer]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
