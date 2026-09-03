/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Bilingual, Cta, EmailShell, P, SubTitle, Title } from './shared.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Confirma tu correo · Confirm your email — ${siteName}`}
  >
    <Bilingual
      es={
        <>
          <Title>Confirma tu correo</Title>
          <P>
            Confirma la dirección {recipient} para activar tu acceso a {siteName}.
          </P>
          <Cta href={confirmationUrl} label="Confirmar mi correo" />
          <P>Si no creaste esta cuenta, ignora este mensaje.</P>
        </>
      }
      en={
        <>
          <SubTitle>Confirm your email</SubTitle>
          <P>
            Confirm {recipient} to activate your access to {siteName}.
          </P>
          <Cta href={confirmationUrl} label="Confirm my email" />
          <P>If you did not create this account, you can ignore this message.</P>
        </>
      }
    />
  </EmailShell>
)

export default SignupEmail
