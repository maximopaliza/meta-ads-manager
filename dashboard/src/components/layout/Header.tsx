'use client'

import { useState } from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState<boolean | null>(null)

  async function handleSync() {
    setSyncing(true)
    setMessage('')
    setOk(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      setMessage(data.message || 'Sync completado')
      setOk(true)
    } catch {
      setMessage('Error al sincronizar')
      setOk(false)
    }
    setSyncing(false)
    setTimeout(() => { setMessage(''); setOk(null) }, 5000)
  }

  return (
    <header style={{
      padding: '16px 28px',
      borderBottom: '1px solid #1A4080',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#131620',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#F1F5F9',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}>{title}</h1>
          {subtitle && (
            <p style={{
              fontSize: '11px',
              color: '#7A90AA',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span className="live-dot" />
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {message && (
          <span style={{
            fontSize: '12px',
            color: ok ? '#22C55E' : '#EF4444',
            padding: '4px 10px',
            borderRadius: '6px',
            backgroundColor: ok ? '#22C55E12' : '#EF444412',
            border: `1px solid ${ok ? '#22C55E30' : '#EF444430'}`,
          }}>
            {ok ? '✓' : '✗'} {message}
          </span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            padding: '7px 16px',
            background: syncing
              ? 'rgba(99,102,241,0.4)'
              : 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: syncing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            letterSpacing: '0.01em',
            boxShadow: syncing ? 'none' : '0 2px 8px rgba(99,102,241,0.35)',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{
            display: 'inline-block',
            animation: syncing ? 'spin 1s linear infinite' : 'none',
          }}>
            {syncing ? '⟳' : '↻'}
          </span>
          {syncing ? 'Sincronizando...' : 'Sync'}
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </header>
  )
}
