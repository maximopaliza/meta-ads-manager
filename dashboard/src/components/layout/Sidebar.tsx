'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const links = [
  { href: '/', label: 'Overview',   icon: '◎' },
  { href: '/campaigns', label: 'Campañas', icon: '⬡' },
  { href: '/ad-sets',   label: 'Ad Sets',  icon: '◈' },
  { href: '/ads',       label: 'Ads',      icon: '▣' },
  { href: '/creativos', label: 'Creativos', icon: '🎬' },
  { href: '/analisis',  label: 'Análisis', icon: '◉' },
  { href: '/analisis/diagnostico', label: 'Diagnóstico', icon: '🔍' },
  { href: '/alerts',    label: 'Alertas',  icon: '◌' },
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
      borderRight: '1px solid #1C3255',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '16px 16px 14px',
        borderBottom: '1px solid #1C3255',
        background: 'linear-gradient(180deg, #091628 0%, #070A14 100%)',
      }}>
        {/* Indicador live */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '9px' }}>
          <div className="live-dot" style={{ width: '5px', height: '5px', marginRight: 0 }} />
          <span style={{ fontSize: '8px', color: '#22C55E', fontWeight: 700, letterSpacing: '0.16em' }}>
            SISTEMA ACTIVO
          </span>
        </div>

        {/* JARVIS + MASIVO en la misma línea */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <span style={{
            fontSize: '19px',
            fontWeight: 900,
            letterSpacing: '0.08em',
            lineHeight: 1,
            background: 'linear-gradient(90deg, #FFFFFF 0%, #B4C0F8 40%, #6366F1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            flexShrink: 0,
          }}>
            J.A.R.V.I.S
          </span>
          <span style={{
            fontSize: '9px',
            padding: '3px 7px',
            borderRadius: '5px',
            background: 'linear-gradient(90deg, #4F52D6 0%, #818CF8 100%)',
            color: '#fff',
            fontWeight: 800,
            letterSpacing: '0.12em',
            boxShadow: '0 0 10px #6366F145',
            flexShrink: 0,
          }}>MASIVO</span>
        </div>

        {/* Subtítulo */}
        <div style={{ fontSize: '8px', color: '#3A5270', fontWeight: 600, letterSpacing: '0.14em' }}>
          ARGENTINA · META ADS AI
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '10px 10px', flex: 1 }}>
        <div style={{
          fontSize: '9px', color: '#3A5272', fontWeight: 700,
          letterSpacing: '0.12em', padding: '4px 10px 8px', textTransform: 'uppercase',
        }}>
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
                marginBottom: '1px',
                backgroundColor: active ? '#0D1E35' : 'transparent',
                color: active ? '#E8EDF5' : '#7A90AA',
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
                color: active ? '#6366F1' : '#4A6080',
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
      <div style={{ padding: '10px 10px', borderTop: '1px solid #1C3255' }}>
        <button
          onClick={handleLogout}
          className="nav-link"
          style={{
            width: '100%',
            padding: '9px 10px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#7A90AA',
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
          <span style={{ fontSize: '13px', color: '#4A6080', width: '18px', textAlign: 'center' }}>→</span>
          Salir
        </button>
      </div>
    </aside>
  )
}
