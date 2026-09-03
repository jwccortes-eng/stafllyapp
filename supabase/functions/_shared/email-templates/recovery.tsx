/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Bilingual, Cta, EmailShell, P, SubTitle, Title } from './shared.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Restablece tu contraseña · Reset your password — ${siteName}`}
  >
    <Bilingual
      es={
        <>
          <Title>Restablece tu contraseña</Title>
          <P>
            Recibimos una solicitud para restablecer la contraseña de tu cuenta
            en {siteName}.
          </P>
          <Cta href={confirmationUrl} label="Crear contraseña nueva" />
          <P>
            Si no lo pediste, ignora este mensaje: tu contraseña actual sigue
            siendo válida.
          </P>
        </>
      }
      en={
        <>
          <SubTitle>Reset your password</SubTitle>
          <P>
            We received a request to reset the password for your {siteName}{' '}
            account.
          </P>
          <Cta href={confirmationUrl} label="Set a new password" />
          <P>
            If you did not request it, ignore this message: your current
            password stays valid.
          </P>
        </>
      }
    />
  </EmailShell>
)

export default RecoveryEmail
