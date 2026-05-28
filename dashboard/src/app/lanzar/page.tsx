'use client'

import { useEffect, useRef, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { SUBFOLDER_NAMES, SUBFOLDER_EMOJI, type DriveFolder } from '@/lib/drive-constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type DriveFile = {
  id: string
  name: string
  size: number
  mimeType: string
  modifiedTime: string
  folder: string
  isVideo: boolean
  thumbnailLink?: string
}

type AnalysisResult = {
  cached: boolean
  angle: string
  analysis: string
  primary_text: string
  headline: string
  audience_summary: string
  targeting: Record<string, unknown>
  error?: string
}

type AdConfig = {
  driveFileId: string
  fileName: string
  mimeType: string
  isVideo: boolean
  thumbnailLink?: string
  headline: string
  primaryText: string
  angle: string
  targeting: Record<string, unknown>
  analysisLoading: boolean
  analysisError?: string
}

type CampaignConfig = {
  campaignName: string
  adSetName: string
  campaignType: 'CBO' | 'ABO'
  budgetAmount: string
  budgetLevel: 'campaign' | 'adset'
  objective: 'ventas' | 'trafico' | 'alcance'
  accountId: string
  pageId: string
  destinationUrl: string
  startDate: string
  productId: string
}

type CreationProgress = {
  status: 'idle' | 'creating' | 'done' | 'error'
  log: string[]
  draftId?: string
  errors: number
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  card: {
    background: '#080E1C', border: '1px solid #1A4080', borderRadius: '12px', padding: '20px',
  } as React.CSSProperties,
  inputStyle: {
    width: '100%', background: '#050C1E', border: '1px solid #1A4080',
    borderRadius: '6px', color: '#E8EDF5', fontSize: '13px', padding: '8px 12px',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  label: { fontSize: '12px', color: '#7A90AA', display: 'block', marginBottom: '5px' } as React.CSSProperties,
  btnPrimary: {
    background: '#6366F1', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    background: '#0C1A2E', color: '#C0CFDF', border: '1px solid #1A4080',
    borderRadius: '6px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer',
  } as React.CSSProperties,
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={S.inputStyle} />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...S.inputStyle, appearance: 'none' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Step Indicator ─────────────────────────────────────────────────────────────
const STEPS = ['1. Archivos', '2. Análisis', '3. Configurar', '4. Revisar', '5. Crear']

function StepBar({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: '0', marginBottom: '28px' }}>
      {STEPS.map((s, i) => {
        const done    = i < step
        const current = i === step
        return (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{
              flex: 1, height: '3px',
              background: i === 0 ? 'transparent' : (done || current ? '#6366F1' : '#1A4080'),
            }} />
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
                margin: '0 auto 4px',
                background: done ? '#6366F1' : current ? '#6366F118' : 'transparent',
                border: `2px solid ${done || current ? '#6366F1' : '#1A4080'}`,
                color: done ? '#fff' : current ? '#6366F1' : '#3A5270',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: '10px', color: current ? '#6366F1' : done ? '#7A90AA' : '#3A5270', whiteSpace: 'nowrap' }}>
                {s.split('. ')[1]}
              </div>
            </div>
            <div style={{
              flex: 1, height: '3px',
              background: i === STEPS.length - 1 ? 'transparent' : (done ? '#6366F1' : '#1A4080'),
            }} />
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LanzarPage() {
  const [step, setStep] = useState(0)

  // Step 1
  const [driveFiles, setDriveFiles]       = useState<Record<string, DriveFile[]>>({})
  const [activeFolder, setActiveFolder]   = useState<DriveFolder>('No subidos')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [loadingDrive, setLoadingDrive]   = useState(false)

  // Step 2
  const [adConfigs, setAdConfigs] = useState<AdConfig[]>([])

  // Step 3
  const [accounts, setAccounts]     = useState<any[]>([])
  const [products, setProducts]     = useState<any[]>([])
  const [config, setConfig]         = useState<CampaignConfig>({
    campaignName: '',
    adSetName: '',
    campaignType: 'CBO',
    budgetAmount: '50',
    budgetLevel: 'campaign',
    objective: 'ventas',
    accountId: '',
    pageId: '',
    destinationUrl: '',
    startDate: '',
    productId: '',
  })

  // Step 5
  const [progress, setProgress] = useState<CreationProgress>({ status: 'idle', log: [], errors: 0 })
  const logRef = useRef<HTMLDivElement>(null)

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadDrive() {
    setLoadingDrive(true)
    try {
      const res = await fetch('/api/drive/files')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setDriveFiles(data)
    } catch (e: any) {
      console.error('Drive load error:', e)
    }
    setLoadingDrive(false)
  }

  async function loadMeta() {
    const [accRes, prodRes] = await Promise.all([
      fetch('/api/meta/accounts'),
      fetch('/api/products'),
    ])
    const accData  = await accRes.json()
    const prodData = await prodRes.json()
    setAccounts(accData.accounts || [])
    setProducts(prodData.products || [])
    if (accData.accounts?.length) {
      setConfig(c => ({ ...c, accountId: accData.accounts[0].id }))
    }
    if (prodData.products?.length) {
      setConfig(c => ({
        ...c,
        productId:      prodData.products[0].id,
        destinationUrl: prodData.products[0].url || '',
      }))
    }
  }

  useEffect(() => { loadDrive() }, [])

  // ── File selection ─────────────────────────────────────────────────────────
  function toggleFile(id: string) {
    setSelectedFiles(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAll() {
    const cur = (driveFiles[activeFolder] || []).map(f => f.id)
    setSelectedFiles(s => {
      const n = new Set(s)
      cur.forEach(id => n.add(id))
      return n
    })
  }
  function clearAll() {
    const cur = new Set((driveFiles[activeFolder] || []).map(f => f.id))
    setSelectedFiles(s => { const n = new Set(s); cur.forEach(id => n.delete(id)); return n })
  }

  function goToAnalysis() {
    const allFiles = Object.values(driveFiles).flat()
    const selected = allFiles.filter(f => selectedFiles.has(f.id))
    const configs: AdConfig[] = selected.map(f => ({
      driveFileId:     f.id,
      fileName:        f.name,
      mimeType:        f.mimeType,
      isVideo:         f.isVideo,
      thumbnailLink:   f.thumbnailLink,
      headline:        '',
      primaryText:     '',
      angle:           '',
      targeting:       { geo_locations: { countries: ['AR'] }, age_min: 18, age_max: 65 },
      analysisLoading: false,
    }))
    setAdConfigs(configs)
    // Auto-suggest campaign name
    const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }).replace('/', '.')
    setConfig(c => ({
      ...c,
      campaignName: `Campaña ${today}`,
      adSetName:    `Conjunto ${today}`,
    }))
    loadMeta()
    setStep(1)
    // Trigger auto-analysis for all
    setTimeout(() => analyzeAll(configs), 100)
  }

  // ── Analysis ───────────────────────────────────────────────────────────────
  async function analyzeOne(idx: number, productId?: string) {
    setAdConfigs(prev => {
      const n = [...prev]
      n[idx] = { ...n[idx], analysisLoading: true, analysisError: undefined }
      return n
    })
    try {
      const ad = adConfigs[idx]
      const res = await fetch('/api/creative/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId:    ad.driveFileId,
          fileName:  ad.fileName,
          mimeType:  ad.mimeType,
          productId: productId || config.productId || undefined,
        }),
      })
      const data: AnalysisResult = await res.json()
      setAdConfigs(prev => {
        const n = [...prev]
        n[idx] = {
          ...n[idx],
          analysisLoading: false,
          headline:    data.headline || n[idx].headline,
          primaryText: data.primary_text || n[idx].primaryText,
          angle:       data.angle || '',
          targeting:   data.targeting || n[idx].targeting,
          analysisError: data.error,
        }
        return n
      })
    } catch (e: any) {
      setAdConfigs(prev => {
        const n = [...prev]
        n[idx] = { ...n[idx], analysisLoading: false, analysisError: e.message }
        return n
      })
    }
  }

  function analyzeAll(configs?: AdConfig[]) {
    const list = configs || adConfigs
    list.forEach((_, i) => analyzeOne(i, config.productId || undefined))
  }

  function updateAdConfig(idx: number, field: keyof AdConfig, val: any) {
    setAdConfigs(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: val }; return n })
  }

  // ── Campaign creation ──────────────────────────────────────────────────────
  async function createCampaign() {
    setStep(4)
    setProgress({ status: 'creating', log: ['Iniciando creación en Meta Ads...'], errors: 0 })

    const addLog = (msg: string) => setProgress(p => ({ ...p, log: [...p.log, msg] }))

    try {
      addLog(`Creando campaña: ${config.campaignName}`)
      const budgetCents = Math.round(parseFloat(config.budgetAmount) * 100)
      const res = await fetch('/api/campaign/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName:   config.campaignName,
          adSetName:      config.adSetName,
          campaignType:   config.campaignType,
          budgetCents,
          budgetLevel:    config.budgetLevel,
          objective:      config.objective,
          accountId:      config.accountId,
          pageId:         config.pageId,
          destinationUrl: config.destinationUrl,
          startDate:      config.startDate || undefined,
          productId:      config.productId || undefined,
          ads: adConfigs.map(a => ({
            driveFileId: a.driveFileId,
            mimeType:    a.mimeType,
            fileName:    a.fileName,
            headline:    a.headline,
            primaryText: a.primaryText,
            angle:       a.angle,
            targeting:   a.targeting,
          })),
        }),
      })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      addLog(`✅ Campaña creada: ${data.campaignId}`)
      addLog(`✅ Conjunto creado: ${data.adSetId}`)
      addLog(`✅ ${data.ads?.filter((a: any) => !a.error).length || 0} ads subidos exitosamente`)
      if (data.errors > 0) addLog(`⚠ ${data.errors} ads fallaron`)

      setProgress(p => ({
        ...p, status: 'done',
        draftId: data.draftId,
        errors:  data.errors || 0,
        log: [...p.log, 'Todo creado como BORRADOR en Meta Ads. Activar desde Borradores.'],
      }))
    } catch (e: any) {
      setProgress(p => ({ ...p, status: 'error', log: [...p.log, '❌ Error: ' + e.message] }))
    }
  }

  // ── Scroll log ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [progress.log])

  const totalSelected = selectedFiles.size

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Lanzar campaña" subtitle="Creación automática de campañas desde Google Drive" />
        <main style={{ padding: '20px', maxWidth: '1200px' }}>

          <StepBar step={step} />

          {/* ── STEP 0: Archivos ── */}
          {step === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'start' }}>
              {/* Folder nav */}
              <div style={S.card}>
                <div style={{ fontSize: '11px', color: '#3A5270', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '10px' }}>CARPETAS</div>
                {SUBFOLDER_NAMES.map(folder => {
                  const count = (driveFiles[folder] || []).length
                  const active = folder === activeFolder
                  return (
                    <button key={folder} onClick={() => setActiveFolder(folder as DriveFolder)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px', borderRadius: '6px', marginBottom: '3px',
                      background: active ? '#071428' : 'transparent',
                      border: active ? '1px solid #1A4080' : '1px solid transparent',
                      color: active ? '#E8EDF5' : '#7A90AA', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <span>{SUBFOLDER_EMOJI[folder]} {folder}</span>
                      {count > 0 && <span style={{ fontSize: '11px', color: '#3A5270' }}>{count}</span>}
                    </button>
                  )
                })}
              </div>

              {/* File grid */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <h3 style={{ color: '#E8EDF5', fontSize: '14px', fontWeight: 700, margin: 0, flex: 1 }}>
                    {SUBFOLDER_EMOJI[activeFolder]} {activeFolder}
                    {(driveFiles[activeFolder] || []).length > 0 && (
                      <span style={{ color: '#7A90AA', fontWeight: 400 }}> · {(driveFiles[activeFolder] || []).length} archivos</span>
                    )}
                  </h3>
                  <button onClick={loadDrive} style={S.btnSecondary} disabled={loadingDrive}>
                    {loadingDrive ? '...' : '↻ Actualizar'}
                  </button>
                  <button onClick={selectAll} style={S.btnSecondary}>Selec. todos</button>
                  <button onClick={clearAll} style={S.btnSecondary}>Limpiar</button>
                </div>

                {loadingDrive ? (
                  <div style={{ color: '#7A90AA', padding: '40px', textAlign: 'center' }}>Cargando Drive...</div>
                ) : (driveFiles[activeFolder] || []).length === 0 ? (
                  <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#7A90AA', fontSize: '13px' }}>
                    No hay archivos en esta carpeta
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                    {(driveFiles[activeFolder] || []).map(file => {
                      const sel = selectedFiles.has(file.id)
                      return (
                        <div key={file.id} onClick={() => toggleFile(file.id)} style={{
                          ...S.card, padding: '0', cursor: 'pointer', overflow: 'hidden',
                          border: sel ? '2px solid #6366F1' : '1px solid #1A4080',
                          position: 'relative',
                        }}>
                          {/* Thumbnail */}
                          <div style={{ width: '100%', height: '100px', background: '#050C1E', position: 'relative', overflow: 'hidden' }}>
                            {file.thumbnailLink ? (
                              <img src={file.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '32px' }}>
                                {file.isVideo ? '🎬' : '🖼'}
                              </div>
                            )}
                            {file.isVideo && (
                              <div style={{
                                position: 'absolute', top: '6px', left: '6px', background: '#00000080',
                                borderRadius: '4px', padding: '2px 6px', fontSize: '9px', color: '#fff', fontWeight: 700,
                              }}>VIDEO</div>
                            )}
                            {sel && (
                              <div style={{
                                position: 'absolute', top: '6px', right: '6px', width: '20px', height: '20px',
                                background: '#6366F1', borderRadius: '50%', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: 700,
                              }}>✓</div>
                            )}
                          </div>
                          {/* Name */}
                          <div style={{ padding: '8px 10px' }}>
                            <div style={{
                              fontSize: '11px', color: '#C0CFDF', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={file.name}>{file.name}</div>
                            <div style={{ fontSize: '10px', color: '#3A5270', marginTop: '2px' }}>
                              {(file.size / 1024 / 1024).toFixed(1)} MB
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 1: Análisis ── */}
          {step === 1 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', color: '#7A90AA', flex: 1 }}>
                  Analizando {adConfigs.length} creativos con Gemini...
                </div>
                <button onClick={() => analyzeAll()} style={S.btnSecondary}>↻ Re-analizar todos</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {adConfigs.map((ad, i) => (
                  <div key={ad.driveFileId} style={S.card}>
                    <div style={{ display: 'flex', gap: '14px' }}>
                      {/* Thumbnail */}
                      <div style={{ width: '80px', height: '80px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: '#050C1E' }}>
                        {ad.thumbnailLink
                          ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '28px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>
                        }
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#C0CFDF', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ad.fileName}
                          {ad.angle && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6366F1' }}>· {ad.angle}</span>}
                        </div>

                        {ad.analysisLoading ? (
                          <div style={{ color: '#7A90AA', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                            Analizando con Gemini...
                          </div>
                        ) : ad.analysisError ? (
                          <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '8px' }}>
                            ⚠ Error: {ad.analysisError}
                            <button onClick={() => analyzeOne(i)} style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px', marginLeft: '8px' }}>
                              Reintentar
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                              <label style={S.label}>Título (máx 40 chars)</label>
                              <input
                                value={ad.headline}
                                onChange={e => updateAdConfig(i, 'headline', e.target.value)}
                                maxLength={40}
                                style={{ ...S.inputStyle, fontWeight: 600 }}
                              />
                              <div style={{ fontSize: '10px', color: ad.headline.length > 35 ? '#F59E0B' : '#3A5270', marginTop: '2px', textAlign: 'right' }}>
                                {ad.headline.length}/40
                              </div>
                            </div>
                            <div>
                              <label style={S.label}>Ángulo detectado</label>
                              <input
                                value={ad.angle}
                                onChange={e => updateAdConfig(i, 'angle', e.target.value)}
                                style={S.inputStyle}
                              />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={S.label}>Texto principal</label>
                              <textarea
                                value={ad.primaryText}
                                onChange={e => updateAdConfig(i, 'primaryText', e.target.value)}
                                rows={3}
                                style={{ ...S.inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <button onClick={() => analyzeOne(i)} style={{ ...S.btnSecondary, alignSelf: 'flex-start', flexShrink: 0, padding: '6px 10px', fontSize: '11px' }}>
                        ↻
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: Configurar ── */}
          {step === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={S.card}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '16px' }}>Campaña</div>
                <Field label="Nombre campaña *" value={config.campaignName} onChange={(v: string) => setConfig(c => ({ ...c, campaignName: v }))} />
                <Field label="Nombre conjunto *" value={config.adSetName} onChange={(v: string) => setConfig(c => ({ ...c, adSetName: v }))} />
                <Select label="Tipo" value={config.campaignType} onChange={v => setConfig(c => ({ ...c, campaignType: v as any }))}
                  options={[{ value: 'CBO', label: 'CBO — Presupuesto de campaña' }, { value: 'ABO', label: 'ABO — Presupuesto por conjunto' }]} />
                <Select label="Objetivo" value={config.objective} onChange={v => setConfig(c => ({ ...c, objective: v as any }))}
                  options={[{ value: 'ventas', label: '🛒 Ventas' }, { value: 'trafico', label: '🔗 Tráfico' }, { value: 'alcance', label: '📢 Alcance' }]} />
              </div>

              <div style={S.card}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '16px' }}>Presupuesto & Cuenta</div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={S.label}>Presupuesto diario (AUD)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#7A90AA', fontSize: '14px', fontWeight: 700 }}>$</span>
                    <input type="number" value={config.budgetAmount} onChange={e => setConfig(c => ({ ...c, budgetAmount: e.target.value }))}
                      min="1" step="1" style={{ ...S.inputStyle, width: '120px' }} />
                    <span style={{ color: '#7A90AA', fontSize: '13px' }}>AUD / día</span>
                  </div>
                </div>
                <Select label="Cuenta publicitaria"
                  value={config.accountId}
                  onChange={v => setConfig(c => ({ ...c, accountId: v }))}
                  options={accounts.map(a => ({ value: a.id, label: `${a.name} (${a.id})` }))} />
                <Field label="Page ID (Fanpage)" value={config.pageId} onChange={(v: string) => setConfig(c => ({ ...c, pageId: v }))} placeholder="Ej: 123456789" />
                <Field label="URL destino *" value={config.destinationUrl} onChange={(v: string) => setConfig(c => ({ ...c, destinationUrl: v }))} type="url" />
                <Field label="Fecha inicio (opcional)" value={config.startDate} onChange={(v: string) => setConfig(c => ({ ...c, startDate: v }))} type="date" />
                <Select label="Producto (para copy automático)"
                  value={config.productId}
                  onChange={v => setConfig(c => ({ ...c, productId: v }))}
                  options={[{ value: '', label: '— Sin producto —' }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
              </div>
            </div>
          )}

          {/* ── STEP 3: Revisar ── */}
          {step === 3 && (
            <div>
              <div style={{ ...S.card, marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Resumen de campaña</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                  {[
                    { label: 'Campaña', value: config.campaignName },
                    { label: 'Conjunto', value: config.adSetName },
                    { label: 'Tipo', value: config.campaignType },
                    { label: 'Presupuesto', value: `AUD $${config.budgetAmount}/día` },
                    { label: 'Objetivo', value: config.objective },
                    { label: 'Ads', value: `${adConfigs.length} creativos` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '11px', color: '#7A90AA' }}>{label}</div>
                      <div style={{ fontSize: '13px', color: '#E8EDF5', fontWeight: 600, marginTop: '2px' }}>{value}</div>
                    </div>
                  ))}
                </div>
                {config.destinationUrl && (
                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#7A90AA' }}>
                    URL: <span style={{ color: '#6366F1' }}>{config.destinationUrl}</span>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '12px', fontWeight: 700, color: '#7A90AA', letterSpacing: '0.1em', marginBottom: '10px' }}>
                ADS ({adConfigs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {adConfigs.map((ad, i) => (
                  <div key={i} style={{ ...S.card, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: '#050C1E' }}>
                        {ad.thumbnailLink
                          ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '22px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8EDF5' }}>{ad.fileName}</div>
                        {ad.angle && <div style={{ fontSize: '11px', color: '#6366F1', marginTop: '2px' }}>🎯 {ad.angle}</div>}
                        {ad.headline && <div style={{ fontSize: '12px', color: '#C0CFDF', marginTop: '4px', fontStyle: 'italic' }}>"{ad.headline}"</div>}
                        {ad.primaryText && (
                          <div style={{ fontSize: '11px', color: '#7A90AA', marginTop: '4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {ad.primaryText}
                          </div>
                        )}
                        {!ad.headline && !ad.primaryText && (
                          <div style={{ fontSize: '12px', color: '#F59E0B' }}>⚠ Sin copy — editá en el paso anterior</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: Creando ── */}
          {step === 4 && (
            <div style={{ maxWidth: '700px' }}>
              <div style={S.card}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8EDF5', marginBottom: '16px' }}>
                  {progress.status === 'creating' && '⏳ Creando campaña...'}
                  {progress.status === 'done' && '✅ Campaña creada como borrador'}
                  {progress.status === 'error' && '❌ Error al crear campaña'}
                </div>

                <div ref={logRef} style={{
                  background: '#050C1E', borderRadius: '8px', padding: '14px', fontFamily: 'monospace',
                  fontSize: '12px', maxHeight: '300px', overflowY: 'auto', marginBottom: '16px',
                }}>
                  {progress.log.map((line, i) => (
                    <div key={i} style={{ color: line.startsWith('❌') ? '#EF4444' : line.startsWith('⚠') ? '#F59E0B' : '#22C55E', marginBottom: '4px' }}>
                      {line}
                    </div>
                  ))}
                  {progress.status === 'creating' && (
                    <div style={{ color: '#7A90AA', animation: 'pulse 1s infinite' }}>...</div>
                  )}
                </div>

                {progress.status === 'done' && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <a href="/borradores" style={{ ...S.btnPrimary, textDecoration: 'none', display: 'inline-block' }}>
                      Ver en Borradores
                    </a>
                    <button onClick={() => { setStep(0); setSelectedFiles(new Set()); setAdConfigs([]); loadDrive() }} style={S.btnSecondary}>
                      Nueva campaña
                    </button>
                  </div>
                )}
                {progress.status === 'error' && (
                  <button onClick={() => setStep(3)} style={S.btnSecondary}>← Volver</button>
                )}
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          {step < 4 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <div>
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)} style={S.btnSecondary}>← Anterior</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {step === 0 && totalSelected > 0 && (
                  <span style={{ fontSize: '13px', color: '#7A90AA' }}>{totalSelected} seleccionados</span>
                )}
                {step === 0 && (
                  <button
                    onClick={goToAnalysis}
                    disabled={totalSelected === 0}
                    style={{ ...S.btnPrimary, opacity: totalSelected === 0 ? 0.5 : 1, cursor: totalSelected === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Analizar {totalSelected > 0 ? `(${totalSelected})` : ''} →
                  </button>
                )}
                {step === 1 && (
                  <button
                    onClick={() => setStep(2)}
                    disabled={adConfigs.some(a => a.analysisLoading)}
                    style={{ ...S.btnPrimary, opacity: adConfigs.some(a => a.analysisLoading) ? 0.5 : 1 }}
                  >
                    Configurar →
                  </button>
                )}
                {step === 2 && (
                  <button
                    onClick={() => {
                      if (!config.campaignName || !config.accountId || !config.pageId || !config.destinationUrl) {
                        alert('Completá todos los campos requeridos')
                        return
                      }
                      setStep(3)
                    }}
                    style={S.btnPrimary}
                  >
                    Revisar →
                  </button>
                )}
                {step === 3 && (
                  <button onClick={createCampaign} style={{ ...S.btnPrimary, background: '#22C55E' }}>
                    ✓ Crear como borrador
                  </button>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
