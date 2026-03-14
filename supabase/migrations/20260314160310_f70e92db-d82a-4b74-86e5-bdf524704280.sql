
SELECT pgmq.purge_queue('transactional_emails');

SELECT pgmq.send('transactional_emails', jsonb_build_object(
  'to', 'jwc.cortes@icloud.com',
  'subject', '✅ Prueba - Invitación Portal StaflyApps',
  'html', '<div style="font-family: Sora, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 28px;"><div style="background: linear-gradient(135deg, #3366FF, #5B8DEF); padding: 32px 24px; text-align: center; border-radius: 16px 16px 0 0;"><h1 style="color: #fff; font-size: 22px; margin: 0;">StaflyApps</h1><p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 8px 0 0;">Portal de Empleados</p></div><div style="padding: 32px 24px;"><h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px;">¡Hola! 👋</h2><p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px;">Prueba exitosa desde notify.staflyapps.com</p><a href="https://staflyapps.com/auth" style="display: block; text-align: center; background: #3366FF; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Acceder al Portal →</a></div></div>',
  'from', 'StaflyApps <noreply@notify.staflyapps.com>',
  'sender_domain', 'notify.staflyapps.com',
  'purpose', 'transactional',
  'label', 'test_invite',
  'run_id', gen_random_uuid()::text,
  'message_id', gen_random_uuid()::text,
  'queued_at', now()::text
));
