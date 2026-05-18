'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const links = [
  { href: '/', label: 'Overview', icon: '📊' },
  { href: '/campaigns', label: 'Campañas', icon: '📣' },
  { href: '/ad-sets', label: 'Ad Sets', icon: '🎯' },
  { href: '/analisis', label: 'Análisis', icon: '📈' },
  { href: '/alerts', label: 'Alertas', icon: '🔔' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <aside
      style={{
        width: '240px',
        minHeight: '100vh',
        backgroundColor: '#1A1D27',
        borderRight: '1px solid #2D3244',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
      }}
    >
      <div style={{ padding: '24px 20px', borderBottom: '1px solid #2D3244' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>📊</span>
          <span style={{ fontWeight: 600, fontSize: '16px', color: '#F1F5F9' }}>Meta Ads</span>
        </div>
        <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>AI Manager</p>
      </div>

      <nav style={{ padding: '16px 12px', flex: 1 }}>
        {links.map(link => {
          const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '4px',
                backgroundColor: active ? '#22263A' : 'transparent',
                color: active ? '#F1F5F9' : '#64748B',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: active ? 500 : 400,
                transition: 'all 0.15s',
              }}
            >
              <span>{link.icon}</span>
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '16px 12px', borderTop: '1px solid #2D3244' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#64748B',
            fontSize: '14px',
            cursor: 'pointer',
            textAlign: 'left',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>🚪</span> Salir
        </button>
      </div>
    </aside>
  )
}
