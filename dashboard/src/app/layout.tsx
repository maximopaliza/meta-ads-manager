import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Meta Ads Manager',
  description: 'Dashboard de gestión de Meta Ads con IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className} style={{ backgroundColor: '#0F1117', color: '#F1F5F9' }}>
        {children}
      </body>
    </html>
  )
}
