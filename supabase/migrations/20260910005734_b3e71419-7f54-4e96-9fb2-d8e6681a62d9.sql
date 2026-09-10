DO $$
DECLARE
  v_company uuid := '00000000-0000-0000-0000-000000000001';
  v_old uuid := 'b506eaa5-a037-4569-80a6-b5774d6d9a72';
  v_author uuid;
  v_new_ann uuid;
  v_media jsonb := '["https://jplhtputzixwqarqlrth.supabase.co/storage/v1/object/public/announcement-media/00000000-0000-0000-0000-000000000001/1788467823100-idbb21ycf4.jpeg"]'::jsonb;
  v_aud uuid[] := ARRAY[
    '482e78ca-d42b-4e12-86f5-6963c3012e61'::uuid, -- Jorge Cortes
    'e6c121cb-917b-43bf-9a63-9bb54e4341a8'::uuid, -- Keury Camilo
    'da9cbc9e-ea0a-438a-9f4c-98d9e0172a43'::uuid  -- Maria Sanabria
  ];
  v_body_es text := 'En Quality Staff, la presentación personal, la higiene y la seguridad son parte fundamental de una experiencia de servicio profesional.

Para meseros, bartenders y otros profesionales independientes de servicio que acepten asignaciones en alimentos, bebidas, hospitalidad o áreas donde corresponda, el cabello largo debe mantenerse completamente recogido y controlado durante el servicio.

Evita llevar el cabello suelto, sobre la espalda, cerca del rostro o en una posición que pueda entrar en contacto con alimentos, bebidas, utensilios o superficies de servicio.

Entre las opciones apropiadas se encuentran una cola alta bien asegurada o un moño completamente recogido, teniendo en cuenta también los requisitos específicos del venue, cliente o asignación.

Antes de iniciar cada servicio, revisa tu presentación y asegúrate de conocer los estándares aplicables a la asignación que has aceptado.

Mantener una presentación limpia, segura y profesional ayuda a brindar una mejor experiencia a clientes, invitados y a todo el equipo de servicio.';
  v_body_en text := 'At Quality Staff, personal presentation, hygiene, and safety are fundamental to providing a professional service experience.

For servers, bartenders, and other independent service professionals accepting assignments in food, beverage, hospitality, or other applicable service environments, long hair should remain fully secured and controlled throughout the service.

Avoid wearing long hair loose, down the back, near the face, or in a position where it may come into contact with food, beverages, utensils, or service surfaces.

Appropriate options include a secure high ponytail or a fully secured bun, while also following any specific requirements applicable to the venue, client, or assignment.

Before beginning each service, review your presentation and make sure you understand the standards applicable to the assignment you have accepted.

Maintaining a clean, safe, and professional presentation helps provide a better experience for clients, guests, and everyone involved in the service.';
BEGIN
  SELECT created_by INTO v_author FROM public.announcements WHERE id = v_old;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'No se encontró el comunicado histórico';
  END IF;

  -- 1) ARCHIVAR el histórico. Solo metadato operativo: no toca contenido,
  --    versiones, destinatarios, tipo ni published_at.
  UPDATE public.announcements
     SET archived_at = now(), pinned = false
   WHERE id = v_old AND archived_at IS NULL;

  -- 2) NUEVO comunicado canónico del piloto controlado.
  INSERT INTO public.announcements (company_id, title, body, communication_type, priority, created_by, media_urls)
  VALUES (v_company,
          'Tu presentación también es parte del servicio',
          v_body_es,
          'acknowledgment_required',
          'normal',
          v_author,
          v_media)
  RETURNING id INTO v_new_ann;

  -- 3) V1 LIMPIA en borrador, audiencia seleccionada de 3 personas.
  INSERT INTO public.announcement_versions (
    announcement_id, company_id, status, communication_type, default_language,
    title_es, body_es, title_en, body_en, media_urls, attachments,
    audience_mode, audience_employee_ids)
  VALUES (
    v_new_ann, v_company, 'draft', 'acknowledgment_required', 'es',
    'Tu presentación también es parte del servicio', v_body_es,
    'Your Presentation Is Part of the Service', v_body_en,
    v_media, '[]'::jsonb,
    'selected', v_aud);

  RAISE NOTICE 'Nuevo comunicado piloto: %', v_new_ann;
END $$;