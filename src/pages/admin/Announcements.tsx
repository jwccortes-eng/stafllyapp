import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Pin, Megaphone, Image, Link2, X, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  published_at: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  media_urls: any[];
  link_url: string | null;
  link_label: string | null;
}

export default function Announcements() {
  const { user, role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const isAdmin = role === "owner" || role === "admin" || hasModuleAccess("announcements", "edit");
  const canDelete = role === "owner" || role === "admin" || hasModuleAccess("announcements", "delete");

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);

  // Form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [pinned, setPinned] = useState(false);
  const [publishNow, setPublishNow] = useState(true);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedCompanyId) loadAnnouncements();
  }, [selectedCompanyId]);

  // Realtime
  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("announcements-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => loadAnnouncements())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompanyId]);

  const loadAnnouncements = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("company_id", selectedCompanyId!)
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setAnnouncements((data ?? []) as Announcement[]);
    setLoading(false);
  };

  const resetForm = () => {
    setTitle(""); setBody(""); setPriority("normal"); setPinned(false);
    setPublishNow(true); setLinkUrl(""); setLinkLabel(""); setEditing(null);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setPriority(a.priority);
    setPinned(a.pinned);
    setPublishNow(!!a.published_at);
    setLinkUrl(a.link_url ?? "");
    setLinkLabel(a.link_label ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !selectedCompanyId || !user) return;
    setSaving(true);
    const payload = {
      company_id: selectedCompanyId,
      title: title.trim(),
      body: body.trim(),
      priority,
      pinned,
      published_at: publishNow ? new Date().toISOString() : null,
      link_url: linkUrl.trim() || null,
      link_label: linkLabel.trim() || null,
      created_by: user.id,
    };

    if (editing) {
      const { created_by, ...updatePayload } = payload;
      const { error } = await supabase.from("announcements").update(updatePayload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else toast.success("Anuncio actualizado");
    } else {
      const { error } = await supabase.from("announcements").insert(payload as any);
      if (error) toast.error(error.message);
      else toast.success("Anuncio creado");
    }
    setSaving(false);
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("announcements").update({ deleted_at: new Date().toISOString() } as any).eq("id", deleteId);
    if (error) toast.error(error.message);
    else toast.success("Anuncio eliminado");
    setDeleteId(null);
  };

  const priorityColor = (p: string) => {
    if (p === "urgent") return "destructive";
    if (p === "important") return "default";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anuncios</h1>
          <p className="text-muted-foreground text-sm">Comunicados internos para tu equipo</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo anuncio
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No hay anuncios</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => (
            <Card key={a.id} className={a.pinned ? "border-primary/30 bg-primary/5" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      <h3 className="font-semibold">{a.title}</h3>
                      <Badge variant={priorityColor(a.priority)} className="text-[10px]">{a.priority}</Badge>
                      {!a.published_at && <Badge variant="outline" className="text-[10px]">Borrador</Badge>}
                    </div>
                    {a.body && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>}
                    {a.link_url && (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {a.link_label || a.link_url}
                      </a>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-2">{format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar anuncio" : "Nuevo anuncio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del anuncio" />
            </div>
            <div>
              <Label>Contenido</Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Escribe el contenido..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="important">Importante</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 pt-6">
                <div className="flex items-center gap-2">
                  <Switch checked={pinned} onCheckedChange={setPinned} id="pinned" />
                  <Label htmlFor="pinned" className="text-sm">Fijar arriba</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={publishNow} onCheckedChange={setPublishNow} id="publish" />
                  <Label htmlFor="publish" className="text-sm">Publicar ahora</Label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>URL del enlace</Label>
                <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Texto del enlace</Label>
                <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Ver más" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar anuncio?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
