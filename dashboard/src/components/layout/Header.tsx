'use client'

import { useState } from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSync() {
    setSyncing(true)
    setMessage('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      setMessage(data.message || 'Sync iniciado')
    } catch {
      setMessage('Error al iniciar sync')
    }
    setSyncing(false)
    setTimeout(() => setMessage(''), 4000)
  }

  return (
    <header
      style={{
        padding: '20px 32px',
        borderBottom: '1px solid #2D3244',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1A1D27',
      }}
    >
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#F1F5F9' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{subtitle}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {message && (
          <span style={{ fontSize: '13px', color: '#64748B' }}>{message}</span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            padding: '8px 16px',
            backgroundColor: syncing ? '#4B4DA8' : '#6366F1',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: syncing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync ahora'}
        </button>
      </div>
    </header>
  )
}
