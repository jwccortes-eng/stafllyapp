/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Bilingual, Cta, EmailShell, P, SubTitle, Title } from './shared.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Tienes una invitación · You have an invitation — ${siteName}`}
  >
    <Bilingual
      es={
        <>
          <Title>Tienes una invitación</Title>
          <P>
            Te invitaron a unirte a {siteName}. Acepta la invitación para crear
            tu acceso.
          </P>
          <Cta href={confirmationUrl} label="Aceptar invitación" />
          <P>Si no esperabas esta invitación, ignora este mensaje.</P>
        </>
      }
      en={
        <>
          <SubTitle>You have an invitation</SubTitle>
          <P>
            You have been invited to join {siteName}. Accept the invitation to
            set up your access.
          </P>
          <Cta href={confirmationUrl} label="Accept invitation" />
          <P>If you were not expecting this invitation, you can ignore it.</P>
        </>
      }
    />
  </EmailShell>
)

export default InviteEmail
