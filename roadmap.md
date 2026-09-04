# Roadmap

## P0.2 — QA real de email con cuentas autorizadas
Cuentas autorizadas (únicas permitidas): qa-es@staflyapps.com, qa-en@staflyapps.com.
Reporte: `docs/qa/P0.2_EMAIL_REAL_QA.md` — veredicto 🔴 STOP.

- [x] Invitación ES → qa-es (aceptada por el backend, rechazada en despacho)
- [x] Invitación EN → qa-en (idem)
- [x] Idempotencia con clave estable (sin duplicado)
- [x] Branding por tenant y destino del enlace (validado en composición)
- [ ] Recovery ES/EN — bloqueado: exige persona real (auth/production data)
- [ ] Activation / verification real — bloqueado por lo mismo
- [ ] Confirmación en bandeja — bloqueada: ningún correo se entrega

## Bloqueantes abiertos
- [ ] Ruta de envío del proyecto para `notify.staflyapps.com` no verificada: la plataforma rechaza todo envío de aplicación ("domain is not allowed to send"). Nada de correo funciona hasta resolverlo.
- [ ] Verdad de entrega optimista: el backend marca `sent` al aceptar el API, aunque la plataforma rechace después. Debe ser `accepted` y reconciliar con eventos `rejected`.
- [ ] No conectar Comunicados Oficiales al correo hasta cerrar los dos puntos anteriores.
