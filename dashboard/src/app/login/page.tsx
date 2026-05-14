'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/')
    } else {
      setError('Contraseña incorrecta')
    }
    setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0F1117',
      }}
    >
      <div
        style={{
          backgroundColor: '#1A1D27',
          border: '1px solid #2D3244',
          borderRadius: '12px',
          padding: '48px',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#F1F5F9' }}>Meta Ads Manager</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Ingresá tu contraseña para continuar</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748B', marginBottom: '8px' }}>
              CONTRASEÑA
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: '#0F1117',
                border: `1px solid ${error ? '#EF4444' : '#2D3244'}`,
                borderRadius: '8px',
                color: '#F1F5F9',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: loading ? '#4B4DA8' : '#6366F1',
              color: '#fff',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
