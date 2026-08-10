/**
 * Client Profile — operational client (within tenant) detail page.
 *
 * Tabs: Overview, Contacts, Requests, Conversations, Locations, Notes.
 *
 * Strict tenant scoping via useClient (filters by selectedCompanyId + id).
 * Reuses ClientExperience components with `clientId` prop — no duplicate tables.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useClient, useClientLocations, useUpdateClientNotes } from "@/hooks/useClients";
import { useClientContacts, useClientServiceRequests, useClientThreads } from "@/hooks/useClientExperience";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import ClientExperienceContacts from "@/components/client-experience/ClientExperienceContacts";
import ClientExperienceRequests from "@/components/client-experience/ClientExperienceRequests";
import ClientExperienceInbox from "@/components/client-experience/ClientExperienceInbox";
import { WorkerPreferenceList } from "@/components/preferences/WorkerPreferenceList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { ClientIdentityPack } from "@/components/clients/ClientIdentityPack";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowLeft, Building2, Mail, Phone, MessageCircle, MapPin, Users, ClipboardList,
  MessageSquare, FileText, Loader2, Star, Car, AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

const OPEN_REQUEST_STATUSES = new Set([
  "new",
  "reviewing",
  "approved_for_scheduling",
  "in_progress",
]);

export default function ClientProfile() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("overview");
  const { canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();
  const isPrivileged = canAccessAdminForCompany(selectedCompanyId);

  const clientQ = useClient(clientId);
  const contactsQ = useClientContacts(clientId);
  const requestsQ = useClientServiceRequests({ clientId });
  const threadsQ = useClientThreads({ clientId });
  const locationsQ = useClientLocations(clientId);

  const client = clientQ.data;

  useEffect(() => {
    document.title = client?.name ? `${client.name} · Clients` : "Client · Stafly";
  }, [client?.name]);

  const openRequests = useMemo(
    () => (requestsQ.data ?? []).filter((r) => OPEN_REQUEST_STATUSES.has(r.status)),
    [requestsQ.data],
  );
  const unreadConv = useMemo(
    () => (threadsQ.data ?? []).reduce((acc, t) => acc + (t.unread_admin_count ?? 0), 0),
    [threadsQ.data],
  );

  if (clientQ.isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4 animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/clients")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to clients
        </Button>
        <EmptyState
          icon={AlertCircle}
          title="Client not found"
          description="This client may have been archived or belongs to another company."
        />
      </div>
    );
  }

  const phone = client.contact_phone?.replace(/[^+\d]/g, "") ?? "";

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 animate-fade-in">
      {/* Back */}
      <Link
        to="/app/clients"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Clients
      </Link>

      {/* Identidad canónica del Cliente (P1 — Client Identity Pack) */}
      <ClientIdentityPack
        clientId={client.id}
        name={client.name}
        reference={(client as { client_code?: string | null }).client_code ?? null}
        status={client.deleted_at ? "archived" : client.status}
        venueCount={locationsQ.data?.length ?? 0}
        dataQualityLabel={client.contact_name ? null : "Sin contacto principal"}
      />

      {/* Contacto y acciones */}
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-card to-muted/20 border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {client.contact_name && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> {client.contact_name}
                </span>
              )}
              {client.contact_email && (
                <a href={`mailto:${client.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Mail className="h-3 w-3" /> {client.contact_email}
                </a>
              )}
              {client.contact_phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="h-3 w-3" /> {client.contact_phone}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {phone && (
              <>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={`tel:${phone}`}><Phone className="h-3.5 w-3.5" /> Call</a>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={`https://wa.me/${phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
              </>
            )}
            {client.contact_email && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={`mailto:${client.contact_email}`}><Mail className="h-3.5 w-3.5" /> Email</a>
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          <KpiCard size="sm" accent="primary" icon={<Users className="h-3.5 w-3.5" />}
            value={contactsQ.data?.length ?? 0} label="Contacts" />
          <KpiCard size="sm" accent="warning" icon={<ClipboardList className="h-3.5 w-3.5" />}
            value={openRequests.length} label="Open requests" />
          <KpiCard size="sm" accent="primary" icon={<MessageSquare className="h-3.5 w-3.5" />}
            value={unreadConv} label="Unread messages" />
          <KpiCard size="sm" accent="muted" icon={<MapPin className="h-3.5 w-3.5" />}
            value={locationsQ.data?.length ?? 0} label="Locations" />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-muted/40 flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-2 text-xs"><Building2 className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2 text-xs"><Users className="h-3.5 w-3.5" /> Contacts</TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 text-xs"><ClipboardList className="h-3.5 w-3.5" /> Requests</TabsTrigger>
          <TabsTrigger value="conversations" className="gap-2 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Conversations</TabsTrigger>
          <TabsTrigger value="locations" className="gap-2 text-xs"><MapPin className="h-3.5 w-3.5" /> Locations</TabsTrigger>
          {isPrivileged && (
            <TabsTrigger value="fit" className="gap-2 text-xs"><Star className="h-3.5 w-3.5" /> Fit</TabsTrigger>
          )}
          <TabsTrigger value="notes" className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" /> Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <OverviewPanel
            primaryContact={contactsQ.data?.find((c) => c.is_primary) ?? contactsQ.data?.[0] ?? null}
            openRequestsCount={openRequests.length}
            recentRequest={requestsQ.data?.[0] ?? null}
            recentThread={threadsQ.data?.[0] ?? null}
            onOpenTab={setTab}
          />
        </TabsContent>
        <TabsContent value="contacts" className="mt-0">
          <ClientExperienceContacts clientId={clientId} />
        </TabsContent>
        <TabsContent value="requests" className="mt-0">
          <ClientExperienceRequests clientId={clientId} />
        </TabsContent>
        <TabsContent value="conversations" className="mt-0">
          <ClientExperienceInbox clientId={clientId} />
        </TabsContent>
        <TabsContent value="locations" className="mt-0">
          <LocationsPanel
            isLoading={locationsQ.isLoading}
            locations={locationsQ.data ?? []}
          />
        </TabsContent>
        {isPrivileged && selectedCompanyId && clientId && (
          <TabsContent value="fit" className="mt-0">
            <Card className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Preferred workers</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Preferred workers appear higher in Recommended for this client. Blocked workers can't be assigned from Recommended until cleared. Internal — not visible to workers.
                </p>
              </div>
              <WorkerPreferenceList
                mode="client"
                companyId={selectedCompanyId}
                targetId={clientId}
                canManage={isPrivileged}
              />
            </Card>
          </TabsContent>
        )}
        <TabsContent value="notes" className="mt-0">
          <NotesPanel clientId={clientId} initialNotes={client.notes ?? ""} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function OverviewPanel({
  primaryContact,
  openRequestsCount,
  recentRequest,
  recentThread,
  onOpenTab,
}: {
  primaryContact: { name: string; title: string | null; email: string | null; phone: string | null; is_primary: boolean } | null;
  openRequestsCount: number;
  recentRequest: { id: string; title: string | null; request_code: string; status: string; created_at: string } | null;
  recentThread: { id: string; subject: string | null; last_message_preview: string | null; last_message_at: string | null } | null;
  onOpenTab: (t: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Primary contact</h3>
        </div>
        {primaryContact ? (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{primaryContact.name}</p>
            {primaryContact.title && (
              <p className="text-xs text-muted-foreground">{primaryContact.title}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
              {primaryContact.email && (
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {primaryContact.email}</span>
              )}
              {primaryContact.phone && (
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {primaryContact.phone}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground space-y-2">
            <p>No contacts added yet.</p>
            <Button size="sm" variant="outline" onClick={() => onOpenTab("contacts")}>Add contact</Button>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Latest request</h3>
          {openRequestsCount > 0 && (
            <Badge variant="outline" className="ml-auto text-[10px]">{openRequestsCount} open</Badge>
          )}
        </div>
        {recentRequest ? (
          <button
            type="button"
            onClick={() => onOpenTab("requests")}
            className="w-full text-left rounded-lg border border-border/40 hover:border-border/80 hover:bg-muted/30 transition-colors p-3 space-y-1"
          >
            <p className="text-sm font-semibold truncate">
              {recentRequest.title ?? recentRequest.request_code}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {recentRequest.request_code} · <span className="capitalize">{recentRequest.status.replace(/_/g, " ")}</span> · {formatDistanceToNow(new Date(recentRequest.created_at), { addSuffix: true, locale: enUS })}
            </p>
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">No requests yet.</p>
        )}
      </Card>

      <Card className="p-4 space-y-3 lg:col-span-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Most recent conversation</h3>
        </div>
        {recentThread ? (
          <button
            type="button"
            onClick={() => onOpenTab("conversations")}
            className="w-full text-left rounded-lg border border-border/40 hover:border-border/80 hover:bg-muted/30 transition-colors p-3 space-y-1"
          >
            <p className="text-sm font-semibold truncate">
              {recentThread.subject ?? "General conversation"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {recentThread.last_message_preview ?? "No messages yet"}
            </p>
            <p className="text-[10px] text-muted-foreground/70">
              {recentThread.last_message_at
                ? formatDistanceToNow(new Date(recentThread.last_message_at), { addSuffix: true, locale: enUS })
                : "—"}
            </p>
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">No conversations yet — start one from the Conversations tab.</p>
        )}
      </Card>
    </div>
  );
}

function LocationsPanel({
  isLoading,
  locations,
}: {
  isLoading: boolean;
  locations: Array<{
    id: string;
    name: string;
    address: string | null;
    default_pay_type: string | null;
    default_clock_method: string | null;
    require_car: boolean;
    contact_name: string | null;
    contact_phone: string | null;
  }>;
}) {
  if (isLoading) {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </Card>
    );
  }
  if (locations.length === 0) {
    return (
      <Card className="p-12">
        <EmptyState
          icon={MapPin}
          title="No locations yet"
          description="Locations for this client appear here. You can add them from the client edit dialog in the Clients list."
        />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border/60">
        {locations.map((loc) => (
          <div key={loc.id} className="px-4 py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{loc.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                {loc.address && <span className="truncate">{loc.address}</span>}
                {loc.default_pay_type && (
                  <span className="capitalize">{loc.default_pay_type}</span>
                )}
                {loc.default_clock_method && (
                  <span className="capitalize">{loc.default_clock_method}</span>
                )}
                {loc.require_car && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <Car className="h-3 w-3" /> Transport
                  </span>
                )}
              </div>
            </div>
            {loc.contact_phone && (
              <Button asChild size="xs" variant="ghost" className="gap-1 text-[10px]">
                <a href={`tel:${loc.contact_phone}`}><Phone className="h-3 w-3" /> {loc.contact_name ?? loc.contact_phone}</a>
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotesPanel({ clientId, initialNotes }: { clientId: string | undefined; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const update = useUpdateClientNotes(clientId);
  const dirty = notes !== initialNotes;

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Internal notes</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">Visible to your team only.</span>
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={8}
        placeholder="Add operational context, preferences, escalation paths…"
        className="text-sm resize-none"
      />
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setNotes(initialNotes)} disabled={update.isPending}>
            Discard
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => update.mutate(notes)}
          disabled={!dirty || update.isPending}
        >
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save notes"}
        </Button>
      </div>
    </Card>
  );
}
