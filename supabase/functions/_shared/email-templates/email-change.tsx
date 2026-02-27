/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

const LOGO_URL = 'https://jplhtputzixwqarqlrth.supabase.co/storage/v1/object/public/email-assets/stafly-logo.png'

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirma tu cambio de correo en stafly</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="stafly" width="120" height="auto" style={logo} />
        </Section>
        <Heading style={h1}>Confirmar cambio de correo</Heading>
        <Text style={text}>
          Solicitaste cambiar tu correo en stafly de{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
          a{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>
          Haz clic en el botón para confirmar este cambio:
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Confirmar cambio
          </Button>
        </Section>
        <Text style={footer}>
          Si no solicitaste este cambio, asegura tu cuenta de inmediato.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
const link = { color: 'hsl(222, 100%, 59%)', textDecoration: 'underline' }
const buttonSection = { margin: '8px 0 28px' }
const button = {
  backgroundColor: 'hsl(222, 100%, 59%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '16px',
  padding: '12px 28px',
  textDecoration: 'none',
  fontFamily: "'Sora', Arial, sans-serif",
}
const footer = { fontSize: '12px', color: 'hsl(220, 15%, 46%)', margin: '30px 0 0', fontFamily: "'Inter', Arial, sans-serif" }
