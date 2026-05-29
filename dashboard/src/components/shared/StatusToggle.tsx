'use client'

import { useState } from 'react'

interface Props {
  objectId: string
  objectType: 'campaign' | 'ad_set' | 'ad'
  initialStatus: string
}

export default function StatusToggle({ objectId, objectType, initialStatus }: Props) {
  const [status, setStatus]   = useState(initialStatus)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)

  const isActive = status === 'ACTIVE'

  async function toggle() {
    if (loading) return
    const prevStatus = status
    const action = isActive ? 'pause' : 'activate'

    // Optimistic update
    setStatus(action === 'activate' ? 'ACTIVE' : 'PAUSED')
    setLoading(true)
    setErrored(false)

    try {
      const res = await fetch('/api/meta/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectId, objectType, action }),
      })
      const data = await res.json()
      if (data.error) {
        setStatus(prevStatus)   // revert on error
        setErrored(true)
        setTimeout(() => setErrored(false), 3000)
      }
    } catch (_) {
      setStatus(prevStatus)     // revert on network error
      setErrored(true)
      setTimeout(() => setErrored(false), 3000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={isActive ? 'Pausar' : 'Activar'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '54px', height: '22px',
        borderRadius: '11px',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        background: errored ? '#EF444440' : loading ? '#1A4080' : isActive ? '#22C55E22' : '#EF444422',
        transition: 'all 0.15s',
        gap: '4px',
        padding: '0 6px',
        flexShrink: 0,
      }}
    >
      {/* Dot */}
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
        background: loading ? '#7A90AA' : isActive ? '#22C55E' : '#EF4444',
        boxShadow: loading ? 'none' : isActive ? '0 0 5px #22C55E' : 'none',
      }} />
      {/* Label */}
      <span style={{
        fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em',
        color: loading ? '#7A90AA' : isActive ? '#22C55E' : '#EF4444',
      }}>
        {loading ? '...' : isActive ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}
