/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

const LOGO_URL = 'https://jplhtputzixwqarqlrth.supabase.co/storage/v1/object/public/email-assets/stafly-logo.png'

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu código de verificación de StaflyApps</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="StaflyApps" width="120" height="auto" style={logo} />
        </Section>
        <Heading style={h1}>Código de verificación</Heading>
        <Text style={text}>Usa el siguiente código para confirmar tu identidad:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Este código expirará en breve. Si no lo solicitaste, puedes ignorar este correo.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Sora', 'Inter', Arial, sans-serif" }
const container = { padding: '40px 28px', maxWidth: '480px', margin: '0 auto' }
const logoSection = { marginBottom: '28px' }
const logo = { display: 'block' as const }
const h1 = {
  fontSize: '22px',
  fontWeight: '700' as const,
  color: 'hsl(220, 60%, 7%)',
  margin: '0 0 16px',
  fontFamily: "'Sora', Arial, sans-serif",
}
const text = {
  fontSize: '14px',
  color: 'hsl(220, 15%, 46%)',
  lineHeight: '1.6',
  margin: '0 0 20px',
  fontFamily: "'Inter', Arial, sans-serif",
}
const codeStyle = {
  fontFamily: "'Space Mono', Courier, monospace",
  fontSize: '28px',
  fontWeight: '700' as const,
  color: 'hsl(222, 100%, 59%)',
  letterSpacing: '4px',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: 'hsl(220, 15%, 46%)', margin: '30px 0 0', fontFamily: "'Inter', Arial, sans-serif" }
