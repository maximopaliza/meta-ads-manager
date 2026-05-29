'use client'

import { useState } from 'react'

interface Props {
  objectId: string
  objectType: 'campaign' | 'ad_set' | 'ad'
  initialStatus: string
  blockedBy?: 'campaign' | 'adset' | null   // why it can't run even if own status = ACTIVE
}

export default function StatusToggle({ objectId, objectType, initialStatus, blockedBy }: Props) {
  const [status, setStatus]   = useState(initialStatus)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)

  const isActive  = status === 'ACTIVE'
  const isRunning = isActive && !blockedBy   // truly running
  const isBlocked = isActive && !!blockedBy  // active but can't run due to parent

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

  const blockLabel = blockedBy === 'campaign' ? 'Campaña off' : blockedBy === 'adset' ? 'Conjunto off' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <button
        onClick={toggle}
        disabled={loading}
        title={
          errored   ? 'Error al cambiar estado' :
          isBlocked ? `Estado propio: ON — pero ${blockLabel}` :
          isActive  ? 'Click para pausar' : 'Click para activar'
        }
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '52px', height: '20px',
          borderRadius: '10px', border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          background: errored   ? '#EF444440'
                    : loading   ? '#1A4080'
                    : isRunning ? '#22C55E22'
                    : isBlocked ? '#F59E0B18'
                    : '#EF444422',
          transition: 'all 0.15s',
          gap: '4px', padding: '0 5px', flexShrink: 0,
        }}
      >
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
          background: loading   ? '#7A90AA'
                    : isRunning ? '#22C55E'
                    : isBlocked ? '#F59E0B'
                    : '#EF4444',
          boxShadow: isRunning ? '0 0 5px #22C55E' : 'none',
        }} />
        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em',
          color: loading   ? '#7A90AA'
               : isRunning ? '#22C55E'
               : isBlocked ? '#F59E0B'
               : '#EF4444',
        }}>
          {loading ? '...' : isRunning ? 'ON' : isBlocked ? 'ON' : 'OFF'}
        </span>
      </button>
      {/* Blocked label */}
      {isBlocked && (
        <span style={{
          fontSize: '8px', color: '#F59E0B', fontWeight: 600,
          whiteSpace: 'nowrap', letterSpacing: '0.02em',
        }}>
          {blockLabel}
        </span>
      )}
    </div>
  )
}
