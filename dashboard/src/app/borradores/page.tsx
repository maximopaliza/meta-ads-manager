'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

type AdDraft = {
  driveFileId: string
  fileName: string
  adId?: string
  headline?: string
  primaryText?: string
  angle?: string
  error?: string
}

type Draft = {
  id: string
  campaign_id: string
  ad_set_id: string
  campaign_name: string
  ad_set_name: string
  campaign_type: string
  budget_cents: number
  budget_level: string
  objective: string
  status: string
  ads: AdDraft[]
  start_date: string | null
  notes: string | null
  created_at: string
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: '#080E1C', border: '1px solid #1A4080', borderRadius: '12px',
  padding: '20px', marginBottom: '16px',
}
const badge = (color: string): React.CSSProperties => ({
  fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '4px',
  background: color + '18', color, border: `1px solid ${color}35`, display: 'inline-block',
})
const btnPrimary: React.CSSProperties = {
  background: '#6366F1', color: '#fff', border: 'none', borderRadius: '6px',
  padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  background: 'transparent', color: '#EF4444', border: '1px solid #EF444435',
  borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#0C1A2E', color: '#C0CFDF', border: '1px solid #1A4080',
  borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
}

function fmt(cents: number, level: string) {
  const aud = (cents / 100).toFixed(0)
  return `${level === 'campaign' ? 'CBO' : 'ABO'} · AUD $${aud}/día`
}

export default function BorradoresPage() {
  const [drafts, setDrafts]     = useState<Draft[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [acting, setActing]     = useState<string | null>(null)
  const [toast, setToast]       = useState('')
  const [filter, setFilter]     = useState<'PAUSED' | 'ACTIVE' | 'ALL'>('PAUSED')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  async function load() {
    setLoading(true)
    const res = await fetch('/api/drafts')
    const data = await res.json()
    setDrafts(data.drafts || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toggleExpand(id: string) {
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function activate(draftId: string) {
    if (!confirm('¿Activar esta campaña en Meta Ads?')) return
    setActing(draftId)
    const res = await fetch('/api/campaign/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    })
    const data = await res.json()
    setActing(null)
    if (data.error) { showToast('❌ ' + data.error); return }
    showToast('✅ Campaña activada en Meta Ads')
    load()
  }

  async function deleteDraft(draftId: string) {
    if (!confirm('¿Eliminar este borrador? También pausará la campaña en Meta.')) return
    setActing(draftId)
    await fetch('/api/campaign/delete-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    })
    setActing(null)
    showToast('🗑 Borrador eliminado')
    load()
  }

  const filtered = drafts.filter(d => filter === 'ALL' || d.status === filter)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Borradores" subtitle="Campañas creadas como PAUSED listas para activar" />

        {toast && (
          <div style={{
            position: 'fixed', top: '80px', right: '24px', zIndex: 9999,
            background: '#0C1A2E', border: '1px solid #1A4080', borderRadius: '8px',
            padding: '12px 20px', fontSize: '13px', color: '#E8EDF5',
          }}>{toast}</div>
        )}

        <main style={{ padding: '20px', maxWidth: '1100px' }}>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {(['PAUSED', 'ACTIVE', 'ALL'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: filter === f ? '#6366F1' : '#0C1A2E',
                color: filter === f ? '#fff' : '#7A90AA',
                border: filter === f ? 'none' : '1px solid #1A4080',
              }}>
                {f === 'PAUSED' ? 'En borrador' : f === 'ACTIVE' ? 'Activados' : 'Todos'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              <a href="/lanzar" style={{
                ...btnPrimary, display: 'inline-block', textDecoration: 'none', padding: '7px 18px',
              }}>+ Nueva campaña</a>
            </div>
          </div>

          {loading ? (
            <div style={{ color: '#7A90AA', textAlign: 'center', padding: '60px' }}>Cargando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
              <div style={{ color: '#E8EDF5', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                No hay borradores
              </div>
              <div style={{ color: '#7A90AA', fontSize: '13px', marginBottom: '20px' }}>
                Creá tu primera campaña desde la sección Lanzar
              </div>
              <a href="/lanzar" style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none' }}>
                Ir a Lanzar
              </a>
            </div>
          ) : (
            filtered.map(d => {
              const isExpanded = expanded.has(d.id)
              const isActing   = acting === d.id
              const okAds      = (d.ads || []).filter(a => !a.error)
              const errAds     = (d.ads || []).filter(a => a.error)
              const date       = new Date(d.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

              return (
                <div key={d.id} style={card}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#E8EDF5' }}>{d.campaign_name}</span>
                        <span style={badge(d.status === 'ACTIVE' ? '#22C55E' : d.status === 'DELETED' ? '#EF4444' : '#F59E0B')}>
                          {d.status === 'ACTIVE' ? '✓ ACTIVA' : d.status === 'DELETED' ? '✗ ELIMINADA' : '⏸ BORRADOR'}
                        </span>
                        <span style={badge('#6366F1')}>{d.campaign_type}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#7A90AA', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span>📁 {d.ad_set_name}</span>
                        <span>💰 {fmt(d.budget_cents, d.budget_level)}</span>
                        <span>🎯 {d.objective}</span>
                        <span>📅 {date}</span>
                        <span>{okAds.length} ads{errAds.length > 0 ? ` · ${errAds.length} con error` : ''}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                      <button onClick={() => toggleExpand(d.id)} style={btnSecondary}>
                        {isExpanded ? '▲ Ocultar' : '▼ Ver ads'}
                      </button>
                      {d.status === 'PAUSED' && (
                        <>
                          <button onClick={() => activate(d.id)} disabled={isActing} style={btnPrimary}>
                            {isActing ? '⏳...' : '▶ Activar'}
                          </button>
                          <button onClick={() => deleteDraft(d.id)} disabled={isActing} style={btnDanger}>✕</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ad list expanded */}
                  {isExpanded && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid #1A4080', paddingTop: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#7A90AA', fontWeight: 700, marginBottom: '10px', letterSpacing: '0.1em' }}>
                        ADS ({d.ads?.length || 0})
                      </div>
                      {(d.ads || []).map((ad, i) => (
                        <div key={i} style={{
                          background: '#050C1E', borderRadius: '8px', padding: '12px 14px',
                          marginBottom: '8px', border: ad.error ? '1px solid #EF444435' : '1px solid #1A4080',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: ad.error ? '#EF4444' : '#E8EDF5', marginBottom: '3px' }}>
                                {ad.fileName || ad.driveFileId}
                              </div>
                              {ad.error ? (
                                <div style={{ fontSize: '12px', color: '#EF4444' }}>⚠ Error: {ad.error}</div>
                              ) : (
                                <>
                                  {ad.angle && <div style={{ fontSize: '11px', color: '#6366F1', marginBottom: '3px' }}>🎯 {ad.angle}</div>}
                                  {ad.headline && <div style={{ fontSize: '12px', color: '#C0CFDF', fontWeight: 600, marginBottom: '2px' }}>"{ad.headline}"</div>}
                                  {ad.primaryText && (
                                    <div style={{ fontSize: '11px', color: '#7A90AA', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {ad.primaryText.slice(0, 120)}{ad.primaryText.length > 120 ? '...' : ''}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            {ad.adId && (
                              <div style={{ fontSize: '11px', color: '#3A5270', flexShrink: 0, fontFamily: 'monospace' }}>
                                {ad.adId}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </main>
      </div>
    </div>
  )
}
