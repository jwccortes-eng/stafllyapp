/**
 * Editor de comunicados oficiales — extensión de /app/announcements.
 *
 * Un solo carril: borrador (versión) → vista previa → publicar.
 * El contenido material de una versión publicada NUNCA se edita in place:
 * al abrir un comunicado ya publicado se crea/recupera un borrador de la
 * siguiente versión (`announcement_new_version`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Upload, X, Film, Users, Search, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEmployeeRoster } from "@/hooks/useEmployeeRoster";
import {
  ACK_CTA,
  COMMUNICATION_TYPES,
  type AudienceMode,
  type CommLanguage,
  type CommunicationType,
  isVideoUrl,
  mediaList,
  requiresAcknowledgment,
} from "@/lib/announcements/official-communications";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Comunicado existente; null = nuevo. */
  announcementId: string | null;
  canPublish: boolean;
  onSaved?: () => void;
}

export function OfficialCommunicationDialog({
  open,
  onOpenChange,
  companyId,
  announcementId,
  canPublish,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const { employees } = useEmployeeRoster(companyId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [annId, setAnnId] = useState<string | null>(announcementId);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number>(1);

  const [type, setType] = useState<CommunicationType>("informational");
  const [defaultLanguage, setDefaultLanguage] = useState<CommLanguage>("es");
  const [titleEs, setTitleEs] = useState("");
  const [bodyEs, setBodyEs] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all_company");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [previewLang, setPreviewLang] = useState<CommLanguage>("es");

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.is_active !== false),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeEmployees.slice(0, 200);
    return activeEmployees
      .filter((e) => `${e.first_name ?? ""} ${e.last_name ?? ""}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [activeEmployees, search]);

  const reset = useCallback(() => {
    setAnnId(null);
    setVersionId(null);
    setVersionNumber(1);
    setType("informational");
    setDefaultLanguage("es");
    setTitleEs("");
    setBodyEs("");
    setTitleEn("");
    setBodyEn("");
    setMedia([]);
    setAudienceMode("all_company");
    setSelectedIds([]);
    setSearch("");
  }, []);

  /** Abre (o crea) el borrador de la siguiente versión. */
  const loadDraft = useCallback(async () => {
    if (!announcementId) {
      reset();
      return;
    }
    setLoading(true);
    setAnnId(announcementId);
    const { data: newVersionId, error } = await supabase.rpc("announcement_new_version", {
      p_announcement_id: announcementId,
    });
    if (error) {
      toast.error("No pudimos abrir el borrador", { description: error.message });
      setLoading(false);
      return;
    }
    const { data: v } = await supabase
      .from("announcement_versions")
      .select("*")
      .eq("id", newVersionId as string)
      .maybeSingle();
    if (v) {
      setVersionId(v.id);
      setVersionNumber(v.version_number);
      setType(v.communication_type as CommunicationType);
      setDefaultLanguage((v.default_language as CommLanguage) ?? "es");
      setTitleEs(v.title_es ?? "");
      setBodyEs(v.body_es ?? "");
      setTitleEn(v.title_en ?? "");
      setBodyEn(v.body_en ?? "");
      setMedia(mediaList(v.media_urls));
      setAudienceMode((v.audience_mode as AudienceMode) ?? "all_company");
      setSelectedIds((v.audience_employee_ids as string[]) ?? []);
    }
    setLoading(false);
  }, [announcementId, reset]);

  useEffect(() => {
    if (open) loadDraft();
    else reset();
  }, [open, loadDraft, reset]);

  useEffect(() => {
    setPreviewLang(defaultLanguage);
  }, [defaultLanguage]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("announcement-media")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        toast.error(`No se pudo subir ${file.name}`, { description: error.message });
        continue;
      }
      const { data } = supabase.storage.from("announcement-media").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    setMedia((prev) => [...prev, ...urls]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const effectiveTitle = titleEs.trim() || titleEn.trim();

  /** Persiste el borrador y devuelve el id de versión. */
  const persistDraft = async (): Promise<string | null> => {
    if (!effectiveTitle) {
      toast.error("Falta el título", { description: "Escribe al menos un título en español o inglés." });
      return null;
    }
    if (audienceMode === "selected" && selectedIds.length === 0) {
      toast.error("Falta la audiencia", { description: "Selecciona al menos una persona." });
      return null;
    }
    if (!user) return null;

    let currentAnnId = annId;
    let currentVersionId = versionId;

    if (!currentAnnId) {
      const { data: created, error } = await supabase
        .from("announcements")
        .insert({
          company_id: companyId,
          title: effectiveTitle,
          body: (defaultLanguage === "en" ? bodyEn : bodyEs) || "",
          priority: type === "critical_acknowledgment" ? "urgent" : "normal",
          pinned: false,
          published_at: null,
          created_by: user.id,
          communication_type: type,
        } as any)
        .select("id")
        .single();
      if (error) {
        toast.error("No pudimos crear el comunicado", { description: error.message });
        return null;
      }
      currentAnnId = created.id;
      setAnnId(created.id);
    }

    if (!currentVersionId) {
      const { data: newVersionId, error } = await supabase.rpc("announcement_new_version", {
        p_announcement_id: currentAnnId!,
      });
      if (error) {
        toast.error("No pudimos crear la versión", { description: error.message });
        return null;
      }
      currentVersionId = newVersionId as string;
      setVersionId(currentVersionId);
    }

    const { error: upErr } = await supabase
      .from("announcement_versions")
      .update({
        communication_type: type,
        default_language: defaultLanguage,
        title_es: titleEs.trim() || null,
        body_es: bodyEs.trim() || null,
        title_en: titleEn.trim() || null,
        body_en: bodyEn.trim() || null,
        media_urls: media as any,
        audience_mode: audienceMode,
        audience_employee_ids: audienceMode === "selected" ? selectedIds : [],
      } as any)
      .eq("id", currentVersionId!);

    if (upErr) {
      toast.error("No pudimos guardar el borrador", { description: upErr.message });
      return null;
    }
    return currentVersionId!;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    const id = await persistDraft();
    setSaving(false);
    if (id) {
      toast.success("Borrador guardado", { description: "Nadie lo verá hasta que lo publiques." });
      onSaved?.();
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    const id = await persistDraft();
    if (!id) {
      setPublishing(false);
      return;
    }
    const { data, error } = await supabase.rpc("publish_announcement_version", { p_version_id: id });
    setPublishing(false);
    if (error) {
      toast.error("No se publicó el comunicado", { description: error.message });
      return;
    }
    const recipients = (data as any)?.recipients ?? 0;
    toast.success("Comunicado publicado", {
      description: `Versión ${versionNumber} emitida a ${recipients} persona(s). La audiencia quedó congelada.`,
    });
    onSaved?.();
    onOpenChange(false);
  };

  const previewTitle = previewLang === "en" ? titleEn || titleEs : titleEs || titleEn;
  const previewBody = previewLang === "en" ? bodyEn || bodyEs : bodyEs || bodyEn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {announcementId ? `Nueva versión (v${versionNumber})` : "Nuevo comunicado"}
          </DialogTitle>
          <DialogDescription>
            {announcementId
              ? "Quienes confirmaron una versión anterior mantienen su registro histórico."
              : "Español e inglés pertenecen al mismo comunicado y a la misma versión."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="content" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="content">Contenido</TabsTrigger>
              <TabsTrigger value="audience">Audiencia</TabsTrigger>
              <TabsTrigger value="preview">Vista previa</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4 pr-3">
              <TabsContent value="content" className="space-y-5 mt-0">
                <div className="space-y-2">
                  <Label>Tipo de comunicado</Label>
                  <RadioGroup value={type} onValueChange={(v) => setType(v as CommunicationType)}>
                    {COMMUNICATION_TYPES.map((t) => (
                      <label
                        key={t.value}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                          type === t.value ? "border-primary bg-primary/5" : "border-border",
                        )}
                      >
                        <RadioGroupItem value={t.value} className="mt-0.5" />
                        <span>
                          <span className="block text-sm font-medium">{t.label}</span>
                          <span className="block text-xs text-muted-foreground">{t.help}</span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Idioma principal</Label>
                  <div className="flex gap-2">
                    {(["es", "en"] as CommLanguage[]).map((l) => (
                      <Button
                        key={l}
                        type="button"
                        size="sm"
                        variant={defaultLanguage === l ? "default" : "outline"}
                        onClick={() => setDefaultLanguage(l)}
                      >
                        {l === "es" ? "Español" : "English"}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Español
                  </p>
                  <Input
                    value={titleEs}
                    onChange={(e) => setTitleEs(e.target.value)}
                    placeholder="Título en español"
                  />
                  <Textarea
                    value={bodyEs}
                    onChange={(e) => setBodyEs(e.target.value)}
                    rows={5}
                    placeholder="Contenido en español"
                  />
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    English
                  </p>
                  <Input
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="Title in English"
                  />
                  <Textarea
                    value={bodyEn}
                    onChange={(e) => setBodyEn(e.target.value)}
                    rows={5}
                    placeholder="Content in English"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Imágenes y video</Label>
                  {media.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {media.map((url, i) => (
                        <div key={url} className="relative group">
                          {isVideoUrl(url) ? (
                            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                              <Film className="h-5 w-5 text-muted-foreground" />
                            </div>
                          ) : (
                            <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover" />
                          )}
                          <button
                            type="button"
                            onClick={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                            aria-label="Quitar archivo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    {uploading ? "Subiendo..." : "Subir archivos"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="audience" className="space-y-4 mt-0">
                <RadioGroup
                  value={audienceMode}
                  onValueChange={(v) => setAudienceMode(v as AudienceMode)}
                >
                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                      audienceMode === "all_company" ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <RadioGroupItem value="all_company" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">Toda la empresa</span>
                      <span className="block text-xs text-muted-foreground">
                        {activeEmployees.length} persona(s) activas hoy. La lista se congela al publicar.
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                      audienceMode === "selected" ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <RadioGroupItem value="selected" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">Personas seleccionadas</span>
                      <span className="block text-xs text-muted-foreground">
                        {selectedIds.length} seleccionada(s).
                      </span>
                    </span>
                  </label>
                </RadioGroup>

                {audienceMode === "selected" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nombre"
                        className="pl-8"
                      />
                    </div>
                    <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
                      {filteredEmployees.map((e) => {
                        const checked = selectedIds.includes(e.id);
                        return (
                          <label
                            key={e.id}
                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSelectedIds((prev) =>
                                  v ? [...prev, e.id] : prev.filter((id) => id !== e.id),
                                )
                              }
                            />
                            <span className="text-sm">
                              {`${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Sin nombre"}
                            </span>
                          </label>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Sin resultados
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="preview" className="space-y-4 mt-0">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {audienceMode === "all_company"
                      ? `Toda la empresa (${activeEmployees.length})`
                      : `${selectedIds.length} persona(s) seleccionadas`}
                  </span>
                  <Badge variant="secondary" className="ml-auto">
                    {COMMUNICATION_TYPES.find((t) => t.value === type)?.label}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  {(["es", "en"] as CommLanguage[]).map((l) => (
                    <Button
                      key={l}
                      type="button"
                      size="sm"
                      variant={previewLang === l ? "default" : "outline"}
                      onClick={() => setPreviewLang(l)}
                    >
                      {l === "es" ? "Español" : "English"}
                    </Button>
                  ))}
                </div>

                <div className="rounded-xl border p-4 space-y-3 bg-card">
                  <h3 className="text-base font-semibold">{previewTitle || "Sin título"}</h3>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{previewBody}</p>
                  {media.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {media.map((url) =>
                        isVideoUrl(url) ? (
                          <video key={url} src={url} controls className="w-full rounded-lg" />
                        ) : (
                          <img key={url} src={url} alt="" className="w-full rounded-lg object-cover" />
                        ),
                      )}
                    </div>
                  )}
                  {requiresAcknowledgment(type) && (
                    <Button className="w-full min-h-[44px]" disabled>
                      {ACK_CTA[previewLang]}
                    </Button>
                  )}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving || publishing}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar borrador
          </Button>
          <Button onClick={handlePublish} disabled={!canPublish || saving || publishing}>
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
