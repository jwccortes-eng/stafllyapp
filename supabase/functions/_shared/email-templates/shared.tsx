/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

/**
 * Cascarón común de los emails de cuenta/acceso.
 *
 * Reglas:
 *  - Marca: "Stafly" cuando no hay contexto de compañía; "<Compañía> — powered
 *    by Stafly" cuando el remitente sí conoce el tenant. Nunca se fija una
 *    compañía concreta dentro de la plantilla.
 *  - Idioma: los emails de auth no tienen preferencia confiable del
 *    destinatario, así que se envían bilingües ES/EN (español primero).
 */

export const styles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' },
  container: { padding: '24px 26px', maxWidth: '520px' },
  brand: {
    fontSize: '12px',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: '#6b7280',
    margin: '0 0 18px',
  },
  h1: {
    fontSize: '22px',
    fontWeight: 'bold' as const,
    color: '#0b1220',
    margin: '0 0 14px',
  },
  h2: {
    fontSize: '16px',
    fontWeight: 'bold' as const,
    color: '#0b1220',
    margin: '0 0 10px',
  },
  text: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.6',
    margin: '0 0 18px',
  },
  code: {
    fontFamily: 'Courier, monospace',
    fontSize: '30px',
    letterSpacing: '8px',
    fontWeight: 'bold' as const,
    color: '#0b1220',
    margin: '0 0 20px',
  },
  button: {
    backgroundColor: '#1a4dff',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    border: '1px solid #1a4dff',
    borderRadius: '12px',
    padding: '13px 22px',
    textDecoration: 'none',
  },
  hr: { borderColor: '#e5e7eb', margin: '26px 0' },
  footer: { fontSize: '12px', color: '#9ca3af', margin: '24px 0 0' },
  link: { color: 'inherit', textDecoration: 'underline' },
}

// Se renderiza como texto: sin >, & ni comillas.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #0b1220 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #0b1220 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #0b1220 !important; }
`

interface ShellProps {
  siteName: string
  preview: string
  children: React.ReactNode
}

export const EmailShell = ({ siteName, preview, children }: ShellProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{preview}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{siteName}</Text>
        {children}
        <Text style={styles.footer}>
          {siteName} · Stafly
        </Text>
      </Container>
    </Body>
  </Html>
)

interface CtaProps {
  href: string
  label: string
}

export const Cta = ({ href, label }: CtaProps) => (
  <Button className="dm-btn" style={styles.button} href={href}>
    {label}
  </Button>
)

/** Bloque bilingüe: español arriba, inglés debajo, separados por una línea. */
interface BilingualProps {
  es: React.ReactNode
  en: React.ReactNode
}

export const Bilingual = ({ es, en }: BilingualProps) => (
  <>
    {es}
    <Hr style={styles.hr} />
    {en}
  </>
)

export const Title = ({ children }: { children: React.ReactNode }) => (
  <Heading style={styles.h1}>{children}</Heading>
)

export const SubTitle = ({ children }: { children: React.ReactNode }) => (
  <Heading as="h2" style={styles.h2}>
    {children}
  </Heading>
)

export const P = ({ children }: { children: React.ReactNode }) => (
  <Text style={styles.text}>{children}</Text>
)
