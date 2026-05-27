'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const links = [
  { href: '/', label: 'Overview',   icon: '◎', desc: 'Métricas del día' },
  { href: '/campaigns', label: 'Campañas', icon: '⬡', desc: 'Vista de campañas' },
  { href: '/ad-sets',   label: 'Ad Sets',  icon: '◈', desc: 'Conjuntos de ads' },
  { href: '/ads',       label: 'Ads',      icon: '▣', desc: 'Creativos' },
  { href: '/analisis',  label: 'Análisis', icon: '◉', desc: 'Performance & embudo' },
  { href: '/analisis/diagnostico', label: 'Diagnóstico', icon: '🔍', desc: 'Días buenos vs malos' },
  { href: '/alerts',    label: 'Alertas',  icon: '◌', desc: 'Notificaciones' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <aside style={{
      width: '220px',
      minHeight: '100vh',
      backgroundColor: '#131620',
      borderRight: '1px solid #2D3244',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '22px 20px 18px',
        borderBottom: '1px solid #2D3244',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
          }}>
            ◎
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#F1F5F9', letterSpacing: '-0.01em' }}>Meta Ads</div>
            <div style={{ fontSize: '10px', color: '#6366F1', fontWeight: 500, letterSpacing: '0.04em' }}>AI MANAGER</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1 }}>
        <div style={{ fontSize: '9px', color: '#3A3F5C', fontWeight: 700, letterSpacing: '0.1em', padding: '4px 10px 8px', textTransform: 'uppercase' }}>
          NAVEGACIÓN
        </div>
        {links.map(link => {
          const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '8px',
                marginBottom: '2px',
                backgroundColor: active ? '#1E2235' : 'transparent',
                color: active ? '#F1F5F9' : '#64748B',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                position: 'relative',
                borderLeft: active ? '3px solid #6366F1' : '3px solid transparent',
                paddingLeft: active ? '8px' : '10px',
                transition: 'all 0.12s ease',
              }}
            >
              <span style={{
                fontSize: '14px',
                color: active ? '#6366F1' : '#3A4060',
                width: '18px',
                textAlign: 'center',
              }}>{link.icon}</span>
              <span>{link.label}</span>
              {active && (
                <span style={{
                  marginLeft: 'auto',
                  width: '5px', height: '5px',
                  borderRadius: '50%',
                  background: '#6366F1',
                  boxShadow: '0 0 6px #6366F1',
                  flexShrink: 0,
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid #2D3244' }}>
        <button
          onClick={handleLogout}
          className="nav-link"
          style={{
            width: '100%',
            padding: '9px 10px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#64748B',
            fontSize: '13px',
            cursor: 'pointer',
            textAlign: 'left',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderLeft: '3px solid transparent',
          }}
        >
          <span style={{ fontSize: '14px', color: '#3A4060', width: '18px', textAlign: 'center' }}>→</span>
          Salir
        </button>
      </div>
    </aside>
  )
}
