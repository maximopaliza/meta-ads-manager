'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const links = [
  { href: '/', label: 'Overview',   icon: '◎', desc: 'Métricas del día' },
  { href: '/campaigns', label: 'Campañas', icon: '⬡', desc: 'Vista de campañas' },
  { href: '/ad-sets',   label: 'Ad Sets',  icon: '◈', desc: 'Conjuntos de ads' },
  { href: '/ads',       label: 'Ads',      icon: '▣', desc: 'Creativos' },
  { href: '/creativos', label: 'Creativos', icon: '🎬', desc: 'Análisis de creativos' },
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
      backgroundColor: '#070A14',
      borderRight: '1px solid #182036',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 18px 16px',
        borderBottom: '1px solid #182036',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #1a1d2e 0%, #23273a 100%)',
            border: '1px solid #6366F130',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', flexShrink: 0,
            boxShadow: '0 0 12px rgba(99,102,241,0.15)',
          }}>
            ◈
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '13px', color: '#E8EDF5', letterSpacing: '0.06em' }}>J.A.R.V.I.S</div>
            <div style={{ fontSize: '10px', color: '#6366F1', fontWeight: 700, letterSpacing: '0.12em' }}>MASIVO</div>
            <div style={{ fontSize: '8px', color: '#2D3350', fontWeight: 500, letterSpacing: '0.08em', marginTop: '1px' }}>ARGENTINA</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1 }}>
        <div style={{ fontSize: '8px', color: '#1E2338', fontWeight: 700, letterSpacing: '0.12em', padding: '4px 10px 8px', textTransform: 'uppercase' }}>
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
                borderRadius: '6px',
                marginBottom: '2px',
                backgroundColor: active ? '#111828' : 'transparent',
                color: active ? '#E8EDF5' : '#5A6C88',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                position: 'relative',
                borderLeft: active ? '2px solid #6366F1' : '2px solid transparent',
                paddingLeft: active ? '8px' : '10px',
                transition: 'all 0.12s ease',
              }}
            >
              <span style={{
                fontSize: '13px',
                color: active ? '#6366F1' : '#3E5070',
                width: '18px',
                textAlign: 'center',
              }}>{link.icon}</span>
              <span>{link.label}</span>
              {active && (
                <span style={{
                  marginLeft: 'auto',
                  width: '4px', height: '4px',
                  borderRadius: '50%',
                  background: '#6366F1',
                  boxShadow: '0 0 8px #6366F1',
                  flexShrink: 0,
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid #182036' }}>
        <button
          onClick={handleLogout}
          className="nav-link"
          style={{
            width: '100%',
            padding: '9px 10px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#2D3350',
            fontSize: '13px',
            cursor: 'pointer',
            textAlign: 'left',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderLeft: '2px solid transparent',
          }}
        >
          <span style={{ fontSize: '13px', color: '#252B40', width: '18px', textAlign: 'center' }}>→</span>
          Salir
        </button>
      </div>
    </aside>
  )
}
