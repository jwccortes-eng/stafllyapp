import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { toast } from "sonner";
import {
  MapPin, Star, Search, Filter, X, Target, Clock, Briefcase,
  ChevronRight, Send, Eye, TrendingUp, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ─── Types ─── */
interface AvailableWorker {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  skills: string[] | null;
  english_level: string | null;
  years_experience: number | null;
  employee_role: string | null;
  approx_latitude: number | null;
  approx_longitude: number | null;
  // Computed
  reputationScore: number;
  totalShifts: number;
  totalHours: number;
}

/* ─── Haversine distance in km ─── */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Worker Card ─── */
function WorkerCard({
  worker,
  onViewProfile,
  onInvite,
}: {
  worker: AvailableWorker;
  onViewProfile: () => void;
  onInvite: () => void;
}) {
  return (
    <Card className="border-border/40 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <EmployeeAvatar
            avatarUrl={worker.avatar_url}
            firstName={worker.first_name}
            lastName={worker.last_name}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {worker.first_name} {worker.last_name}
            </p>
            {worker.employee_role && (
              <p className="text-xs text-muted-foreground">{worker.employee_role}</p>
            )}

            {/* Skills */}
            {worker.skills && worker.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {worker.skills.slice(0, 3).map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{s}</Badge>
                ))}
                {worker.skills.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{worker.skills.length - 3}</span>
                )}
              </div>
            )}

            {/* Metrics */}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                {(worker.reputationScore / 10).toFixed(1)}
              </span>
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {worker.totalShifts} jobs
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {worker.totalHours}h
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="xs" className="flex-1 gap-1" onClick={onViewProfile}>
            <Eye className="h-3 w-3" /> Profile
          </Button>
          <Button size="xs" className="flex-1 gap-1" onClick={onInvite}>
            <Send className="h-3 w-3" /> Invite
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Component ─── */
export default function WorkerMap() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<AvailableWorker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<AvailableWorker | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [minReputation, setMinReputation] = useState(0);
  const [maxDistance, setMaxDistance] = useState(50); // km
  const [skillFilter, setSkillFilter] = useState("");
  const [centerLat, setCenterLat] = useState(25.76);
  const [centerLng, setCenterLng] = useState(-80.19);

  // Try to get user's location
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setCenterLat(pos.coords.latitude);
        setCenterLng(pos.coords.longitude);
      },
      () => {} // ignore error
    );
  }, []);

  // Load available workers
  useEffect(() => {
    if (!selectedCompanyId) return;
    loadWorkers();
  }, [selectedCompanyId]);

  async function loadWorkers() {
    setLoading(true);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, avatar_url, skills, english_level, years_experience, employee_role, approx_latitude, approx_longitude, available_for_work, passport_public")
      .eq("available_for_work", true)
      .eq("is_active", true)
      .not("approx_latitude", "is", null)
      .not("approx_longitude", "is", null);

    if (!employees || employees.length === 0) {
      setWorkers([]);
      setLoading(false);
      return;
    }

    // Get metrics for each worker
    const workerIds = employees.map((e: any) => e.id);

    // Shift assignments count
    const { data: assignmentCounts } = await supabase
      .from("shift_assignments")
      .select("employee_id")
      .in("employee_id", workerIds)
      .eq("status", "confirmed");

    const shiftCountMap: Record<string, number> = {};
    for (const a of (assignmentCounts || []) as any[]) {
      shiftCountMap[a.employee_id] = (shiftCountMap[a.employee_id] || 0) + 1;
    }

    // Reviews
    const { data: reviews } = await supabase
      .from("shift_reviews")
      .select("reviewed_employee_id, overall_rating")
      .in("reviewed_employee_id", workerIds)
      .eq("reviewer_type", "manager");

    const reviewMap: Record<string, { sum: number; count: number }> = {};
    for (const r of (reviews || []) as any[]) {
      if (!reviewMap[r.reviewed_employee_id]) reviewMap[r.reviewed_employee_id] = { sum: 0, count: 0 };
      reviewMap[r.reviewed_employee_id].sum += r.overall_rating || 0;
      reviewMap[r.reviewed_employee_id].count += 1;
    }

    const result: AvailableWorker[] = (employees as any[]).map((e) => {
      const rev = reviewMap[e.id];
      const avgRating = rev ? rev.sum / rev.count : 0;
      return {
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        avatar_url: e.avatar_url,
        skills: e.skills,
        english_level: e.english_level,
        years_experience: e.years_experience,
        employee_role: e.employee_role,
        approx_latitude: e.approx_latitude,
        approx_longitude: e.approx_longitude,
        reputationScore: Math.round(avgRating * 20), // 0-100 scale
        totalShifts: shiftCountMap[e.id] || 0,
        totalHours: (shiftCountMap[e.id] || 0) * 6, // estimate
      };
    });

    setWorkers(result);
    setLoading(false);
  }

  // All unique skills
  const allSkills = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => w.skills?.forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [workers]);

  // Filtered workers
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = `${w.first_name} ${w.last_name}`.toLowerCase();
        const skillMatch = w.skills?.some((s) => s.toLowerCase().includes(q));
        if (!name.includes(q) && !skillMatch) return false;
      }
      if (minReputation > 0 && w.reputationScore < minReputation) return false;
      if (skillFilter && !w.skills?.some((s) => s.toLowerCase() === skillFilter.toLowerCase())) return false;
      if (w.approx_latitude && w.approx_longitude) {
        const dist = haversine(centerLat, centerLng, w.approx_latitude, w.approx_longitude);
        if (dist > maxDistance) return false;
      }
      return true;
    });
  }, [workers, searchQuery, minReputation, maxDistance, skillFilter, centerLat, centerLng]);

  // Score color
  function scoreColor(score: number) {
    if (score >= 80) return "hsl(163,68%,45%)";
    if (score >= 60) return "hsl(45,80%,50%)";
    return "hsl(0,70%,55%)";
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Live Worker Map"
        subtitle="Find available workers near you"
      />

      {/* Search & Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="default"
          className="gap-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4" /> Filters
        </Button>
      </div>

      {/* Expandable Filters */}
      {showFilters && (
        <Card className="border-border/40">
          <CardContent className="p-4 grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Skill</label>
              <Select value={skillFilter} onValueChange={setSkillFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All skills" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All skills</SelectItem>
                  {allSkills.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Min reputation: {minReputation}%
              </label>
              <Slider
                value={[minReputation]}
                onValueChange={([v]) => setMinReputation(v)}
                max={100}
                step={5}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Max distance: {maxDistance}km
              </label>
              <Slider
                value={[maxDistance]}
                onValueChange={([v]) => setMaxDistance(v)}
                min={5}
                max={200}
                step={5}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {filteredWorkers.length} workers available
        </span>
        <span className="flex items-center gap-1">
          <Building2 className="h-3.5 w-3.5" />
          Within {maxDistance}km
        </span>
      </div>

      {/* Map + List Layout */}
      <div className="grid lg:grid-cols-3 gap-4" style={{ minHeight: "500px" }}>
        {/* Map */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-border/40 shadow-sm">
          {loading ? (
            <Skeleton className="h-full min-h-[400px] w-full rounded-2xl" />
          ) : (
            <MapContainer
              center={[centerLat, centerLng]}
              zoom={11}
              style={{ height: "100%", minHeight: "400px", width: "100%" }}
              className="rounded-2xl z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              {filteredWorkers.map((w) =>
                w.approx_latitude && w.approx_longitude ? (
                  <CircleMarker
                    key={w.id}
                    center={[w.approx_latitude, w.approx_longitude]}
                    radius={10}
                    pathOptions={{
                      fillColor: scoreColor(w.reputationScore),
                      color: "white",
                      weight: 2,
                      fillOpacity: 0.85,
                    }}
                    eventHandlers={{
                      click: () => setSelectedWorker(w),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px] p-1">
                        <div className="flex items-center gap-2 mb-2">
                          <EmployeeAvatar
                            avatarUrl={w.avatar_url}
                            firstName={w.first_name}
                            lastName={w.last_name}
                            size="sm"
                          />
                          <div>
                            <p className="font-semibold text-sm">{w.first_name} {w.last_name}</p>
                            {w.employee_role && (
                              <p className="text-xs text-muted-foreground">{w.employee_role}</p>
                            )}
                          </div>
                        </div>
                        {w.skills && w.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {w.skills.slice(0, 3).map((s, i) => (
                              <span key={i} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                            {(w.reputationScore / 10).toFixed(1)}/10
                          </span>
                          <span>{w.totalShifts} jobs</span>
                          <span>{w.totalHours}h</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => navigate(`/app/passport?id=${w.id}`)}
                            className="flex-1 text-[10px] font-medium py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-center"
                          >
                            View profile
                          </button>
                          <button
                            onClick={() => {
                              toast.success(`Invitation sent to ${w.first_name}`);
                            }}
                            className="flex-1 text-[10px] font-medium py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-center"
                          >
                            Invite
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ) : null
              )}
            </MapContainer>
          )}
        </div>

        {/* Side List */}
        <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
          <p className="text-xs font-medium text-muted-foreground px-1">
            {filteredWorkers.length} available workers
          </p>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))
          ) : filteredWorkers.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="p-8 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No workers available in this area</p>
              </CardContent>
            </Card>
          ) : (
            filteredWorkers.map((w) => (
              <WorkerCard
                key={w.id}
                worker={w}
                onViewProfile={() => navigate(`/app/passport?id=${w.id}`)}
                onInvite={() => toast.success(`Invitation sent to ${w.first_name}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* Selected worker detail */}
      {selectedWorker && (
        <Card className="border-primary/30 border-2">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <EmployeeAvatar
                avatarUrl={selectedWorker.avatar_url}
                firstName={selectedWorker.first_name}
                lastName={selectedWorker.last_name}
                size="lg"
                className="h-16 w-16"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">
                    {selectedWorker.first_name} {selectedWorker.last_name}
                  </h3>
                  <button onClick={() => setSelectedWorker(null)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                {selectedWorker.employee_role && (
                  <p className="text-sm text-muted-foreground">{selectedWorker.employee_role}</p>
                )}

                {selectedWorker.skills && selectedWorker.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedWorker.skills.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{(selectedWorker.reputationScore / 10).toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">Reputation</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedWorker.totalShifts}</p>
                    <p className="text-[10px] text-muted-foreground">Jobs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedWorker.totalHours}h</p>
                    <p className="text-[10px] text-muted-foreground">Worked</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => navigate(`/app/passport?id=${selectedWorker.id}`)}
                  >
                    <Eye className="h-4 w-4" /> View passport
                  </Button>
                  <Button
                    className="flex-1 gap-1"
                    onClick={() => toast.success(`Invitation sent to ${selectedWorker.first_name}`)}
                  >
                    <Send className="h-4 w-4" /> Invite to work
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
