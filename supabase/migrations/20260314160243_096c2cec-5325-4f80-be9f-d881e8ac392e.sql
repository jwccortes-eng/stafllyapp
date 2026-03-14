
SELECT pgmq.send('transactional_emails', jsonb_build_object(
  'to', 'jwc.cortes@icloud.com',
  'subject', '✅ Prueba - Invitación Portal StaflyApps',
  'html', '<div style="font-family: Sora, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 28px;"><div style="background: linear-gradient(135deg, #3366FF, #5B8DEF); padding: 32px 24px; text-align: center; border-radius: 16px 16px 0 0;"><h1 style="color: #fff; font-size: 22px; margin: 0;">StaflyApps</h1><p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 8px 0 0;">Portal de Empleados</p></div><div style="padding: 32px 24px;"><h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px;">¡Hola! 👋</h2><p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px;">Este es un email de prueba desde <strong>notify.staflyapps.com</strong>. Si lo recibes, el sistema funciona correctamente.</p><div style="background: #f0f4ff; border-radius: 12px; padding: 20px; margin: 0 0 24px;"><p style="font-size: 13px; font-weight: 600; color: #3366FF; margin: 0 0 12px;">🔐 Ejemplo de credenciales</p><table style="width: 100%; font-size: 14px; color: #333;"><tr><td style="padding: 4px 0; color: #777;">Portal:</td><td style="padding: 4px 0; font-weight: 600;">staflyapps.com/auth</td></tr><tr><td style="padding: 4px 0; color: #777;">PIN:</td><td style="padding: 4px 0; font-weight: 600; font-family: monospace; font-size: 18px; letter-spacing: 4px;">1234</td></tr></table></div><a href="https://staflyapps.com/auth" style="display: block; text-align: center; background: #3366FF; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Acceder al Portal →</a></div><div style="padding: 16px 24px; background: #f8f9fc; text-align: center; border-radius: 0 0 16px 16px;"><p style="font-size: 11px; color: #999; margin: 0;">StaflyApps · Gestión de personal inteligente</p></div></div>',
  'from', 'StaflyApps <noreply@notify.staflyapps.com>',
  'sender_domain', 'notify.staflyapps.com',
  'purpose', 'transactional',
  'label', 'test_invite',
  'message_id', gen_random_uuid()::text,
  'queued_at', now()::text
));
