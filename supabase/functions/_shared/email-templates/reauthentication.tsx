/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Bilingual, EmailShell, P, SubTitle, Title, styles } from './shared.tsx'

interface ReauthenticationEmailProps {
  token: string
  siteName?: string
}

export const ReauthenticationEmail = ({
  token,
  siteName = 'Stafly',
}: ReauthenticationEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview="Tu código de verificación · Your verification code"
  >
    <Bilingual
      es={
        <>
          <Title>Tu código de verificación</Title>
          <P>Usa este código para confirmar tu identidad. Vence en poco tiempo.</P>
          <Text style={styles.code}>{token}</Text>
          <P>Si no lo pediste, ignora este mensaje.</P>
        </>
      }
      en={
        <>
          <SubTitle>Your verification code</SubTitle>
          <P>Use this code to confirm your identity. It expires shortly.</P>
          <Text style={styles.code}>{token}</Text>
          <P>If you did not request it, ignore this message.</P>
        </>
      }
    />
  </EmailShell>
)

export default ReauthenticationEmail
