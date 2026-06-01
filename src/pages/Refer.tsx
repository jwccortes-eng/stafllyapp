import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, UserPlus2, Loader2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  possible_duplicate: "Possible duplicate",
  matched_existing_person: "Matched to existing person",
  needs_contact: "Needs contact",
  approved_to_invite: "Approved",
  invited: "Invited",
  rejected: "Not a fit",
  archived: "Archived",
};

export default function Refer() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?next=/refer");
    }
  }, [user, loading, navigate]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [contactMethod, setContactMethod] = useState<string>("phone");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);

  const { data: myReferrals = [], isLoading: loadingList } = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("id, first_name, last_name, phone, status, reference_code, created_at, intake_kind")
        .eq("submitted_by_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setFirstName(""); setLastName(""); setPhone(""); setEmail("");
    setCity(""); setNotes(""); setSource(""); setConsent(false);
    setContactMethod("phone");
  };

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast.error("First name, last name and phone are required");
      return;
    }
    if (!consent) {
      toast.error("Please accept the consent statement");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("referral-submit", {
        body: {
          first_name: firstName,
          last_name: lastName,
          phone,
          email: email || undefined,
          city: city || undefined,
          preferred_contact_method: contactMethod,
          notes: notes || undefined,
          referral_source: source || undefined,
          intake_kind: "partner_referral",
          consent: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastRef(data.reference_code);
      toast.success(data.possible_duplicate
        ? "Referral submitted. We detected a possible match — our team will review."
        : "Referral submitted. Thanks!");
      reset();
      qc.invalidateQueries({ queryKey: ["my-referrals"] });
    } catch (err: any) {
      toast.error(err.message || "Could not submit referral");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <UserPlus2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Refer a candidate</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Submit someone you'd recommend. Our team reviews every referral before contacting them.
            No worker is activated automatically.
          </p>
        </header>

        {lastRef && (
          <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Referral received</div>
                <div className="text-muted-foreground">Reference code: <span className="font-mono">{lastRef}</span></div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fn">First name *</Label>
              <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ln">Last name *</Label>
              <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ph">Phone *</Label>
            <Input id="ph" type="tel" inputMode="tel" placeholder="(555) 123-4567"
              value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            <p className="text-xs text-muted-foreground">10-digit US number. We'll normalize automatically.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="em">Email (optional)</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ci">City</Label>
              <Input id="ci" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm">Preferred contact</Label>
              <Select value={contactMethod} onValueChange={setContactMethod}>
                <SelectTrigger id="cm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="src">How do you know them? (optional)</Label>
            <Input id="src" value={source} onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Worked with them at ACME" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nt">Notes (optional)</Label>
            <Textarea id="nt" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Anything our team should know" />
          </div>

          <label className="flex items-start gap-3 pt-2 cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
            <span className="text-sm text-muted-foreground leading-snug">
              I confirm I have this person's permission to share their contact information,
              and I understand our team will review the referral before contacting them.
            </span>
          </label>

          <Button onClick={submit} disabled={submitting || !consent} className="w-full">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit referral
          </Button>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            My referrals
          </h2>
          {loadingList ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : myReferrals.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              You haven't submitted any referrals yet.
            </Card>
          ) : (
            <div className="space-y-2">
              {myReferrals.map((r: any) => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.first_name} {r.last_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.reference_code}</div>
                  </div>
                  <Badge variant="secondary">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
