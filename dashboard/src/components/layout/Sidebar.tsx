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
        padding: '18px 16px 16px',
        borderBottom: '1px solid #1A3050',
        background: 'linear-gradient(180deg, #0A1828 0%, #070A14 100%)',
      }}>
        {/* Sistema activo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
          <div className="live-dot" style={{ width: '5px', height: '5px', marginRight: 0 }} />
          <span style={{ fontSize: '8px', color: '#22C55E', fontWeight: 700, letterSpacing: '0.18em' }}>
            SISTEMA ACTIVO
          </span>
        </div>

        {/* Nombre principal con gradiente */}
        <div style={{
          fontSize: '21px',
          fontWeight: 900,
          letterSpacing: '0.1em',
          lineHeight: 1,
          background: 'linear-gradient(90deg, #FFFFFF 0%, #A5B4FC 45%, #6366F1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '8px',
        }}>
          J.A.R.V.I.S
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '9px',
            padding: '3px 8px',
            borderRadius: '5px',
            background: 'linear-gradient(90deg, #6366F1 0%, #818CF8 100%)',
            color: '#fff',
            fontWeight: 800,
            letterSpacing: '0.14em',
            boxShadow: '0 0 10px #6366F140',
          }}>MASIVO</span>
          <span style={{
            fontSize: '8px',
            color: '#2A4060',
            fontWeight: 600,
            letterSpacing: '0.12em',
          }}>· ARG</span>
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
                backgroundColor: active ? '#0E1B30' : 'transparent',
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
