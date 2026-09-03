/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Bilingual, Cta, EmailShell, P, SubTitle, Title } from './shared.tsx'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail es la dirección actual (HookData.OldEmail). En el fanout seguro,
  // `email` puede ser igual al destinatario nuevo: por eso se renderiza
  // explícitamente oldEmail → newEmail.
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Confirma tu correo nuevo · Confirm your new email — ${siteName}`}
  >
    <Bilingual
      es={
        <>
          <Title>Confirma tu correo nuevo</Title>
          <P>
            Pediste cambiar el correo de tu cuenta en {siteName} de {oldEmail} a{' '}
            {newEmail}.
          </P>
          <Cta href={confirmationUrl} label="Confirmar el cambio" />
          <P>Si no fuiste tú, revisa la seguridad de tu cuenta de inmediato.</P>
        </>
      }
      en={
        <>
          <SubTitle>Confirm your new email</SubTitle>
          <P>
            You asked to change the email on your {siteName} account from{' '}
            {oldEmail} to {newEmail}.
          </P>
          <Cta href={confirmationUrl} label="Confirm the change" />
          <P>If this was not you, secure your account immediately.</P>
        </>
      }
    />
  </EmailShell>
)

export default EmailChangeEmail
