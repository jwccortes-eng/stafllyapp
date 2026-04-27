/**
 * Client Experience Hub — admin entry page (Phase 1).
 *
 * Three tabs:
 *   - Inbox     → conversation threads sorted by last activity
 *   - Requests  → service requests with filters
 *   - Contacts  → client portal contacts
 *
 * No public client portal yet — that ships in Phase 2.
 */
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, ClipboardList, Users, MessageSquare } from "lucide-react";
import ClientExperienceInbox from "@/components/client-experience/ClientExperienceInbox";
import ClientExperienceRequests from "@/components/client-experience/ClientExperienceRequests";
import ClientExperienceContacts from "@/components/client-experience/ClientExperienceContacts";

export default function ClientExperience() {
  const [tab, setTab] = useState<string>("inbox");

  useEffect(() => {
    document.title = "Client Experience · Stafly";
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <MessageSquare className="h-4 w-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Client Experience
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Conversations, service requests and authorized contacts for every client.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-muted/40">
          <TabsTrigger value="inbox" className="gap-2 text-xs">
            <Inbox className="h-3.5 w-3.5" /> Inbox
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 text-xs">
            <ClipboardList className="h-3.5 w-3.5" /> Requests
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2 text-xs">
            <Users className="h-3.5 w-3.5" /> Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-0">
          <ClientExperienceInbox />
        </TabsContent>
        <TabsContent value="requests" className="mt-0">
          <ClientExperienceRequests />
        </TabsContent>
        <TabsContent value="contacts" className="mt-0">
          <ClientExperienceContacts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
