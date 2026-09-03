/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Bilingual, Cta, EmailShell, P, SubTitle, Title } from './shared.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Tu enlace de acceso · Your login link — ${siteName}`}
  >
    <Bilingual
      es={
        <>
          <Title>Tu enlace de acceso</Title>
          <P>
            Entra a {siteName} con este enlace. Vence en poco tiempo y solo
            funciona una vez.
          </P>
          <Cta href={confirmationUrl} label="Entrar" />
          <P>Si no lo pediste, ignora este mensaje: tu acceso sigue igual.</P>
        </>
      }
      en={
        <>
          <SubTitle>Your login link</SubTitle>
          <P>
            Sign in to {siteName} with this link. It expires shortly and works
            only once.
          </P>
          <Cta href={confirmationUrl} label="Sign in" />
          <P>If you did not request it, ignore this message.</P>
        </>
      }
    />
  </EmailShell>
)

export default MagicLinkEmail
