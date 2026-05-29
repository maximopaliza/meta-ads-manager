'use client'

import { useEffect, useRef, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { SUBFOLDER_NAMES, SUBFOLDER_EMOJI, type DriveFolder } from '@/lib/drive-constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type DriveFile = {
  id: string; name: string; size: number; mimeType: string
  modifiedTime: string; folder: string; isVideo: boolean; thumbnailLink?: string
}

type AdConfig = {
  driveFileId: string; fileName: string; mimeType: string
  isVideo: boolean; thumbnailLink?: string
  headline: string; primaryText: string; angle: string
  targeting: Record<string, unknown>
  analysisLoading: boolean; analysisError?: string
  adSetIdx: number  // which ad set this ad belongs to (0-based)
}

type AdSetGroup = {
  idx: number       // 0-based
  customName: string
}

type CampaignConfig = {
  campaignName: string
  campaignType: 'CBO' | 'ABO'
  budgetAmount: string
  objective: 'ventas' | 'trafico' | 'alcance'
  accountId: string
  pageId: string
  destinationUrl: string
  startDate: string
  startTime: string
  numAdSets: number
  productId: string
  ageMin: number
  ageMax: number
  gender: 'all' | 'male' | 'female'
}

type CreationProgress = {
  status: 'idle' | 'creating' | 'done' | 'error'
  log: string[]
  draftId?: string
  errors: number
}

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = ['Archivos', 'Copy', 'Configurar', 'Estructura', 'Revisar', 'Crear']

// ── Predefined angles ──────────────────────────────────────────────────────────
const ANGLES = [
  { value: '',                     label: '— Elegir ángulo —' },
  { value: 'deterioro_silencioso', label: '👁 Deterioro silencioso de la vista' },
  { value: 'fatiga_pantallas',     label: '💻 Fatiga visual por pantallas' },
  { value: 'ojo_seco',             label: '💧 Ojo seco crónico — las gotas no llegan' },
  { value: 'danos_sol',            label: '☀️ Daños del sol en la retina' },
  { value: 'glaucoma_macular',     label: '🔬 Glaucoma y degeneración macular' },
  { value: 'diabetes_hipertension',label: '🩺 Diabetes e hipertensión — retina en riesgo' },
  { value: 'carnosidad',           label: '🔴 Carnosidad / pterigión — frenar sin cirugía' },
  { value: 'ojos_rojos',           label: '🔴 Ojos rojos e inflamados' },
  { value: 'antecedentes',         label: '👨‍👩‍👧 Antecedentes familiares oculares' },
  { value: 'spray_vs_capsula',     label: '💊 Spray vs cápsula — absorción vía sangre' },
  { value: 'estudio_areds2',       label: '📊 68% menos riesgo — Estudio AREDS2' },
  { value: 'recuperacion',         label: '✨ Recuperación — células que vuelven a nutrirse' },
  { value: 'paso_anos',            label: '⏳ El paso de los años — deterioro progresivo' },
  { value: 'conductores',          label: '🚗 Conductores nocturnos — halos y visión borrosa' },
  { value: 'oferta_urgencia',      label: '⚡ Oferta limitada / stock limitado' },
  { value: 'prevencion',           label: '🛡 Prevención general — cuidar antes de que falle' },
  { value: 'posicionamiento',      label: '🏆 El mejor suplemento ocular — posicionamiento' },
  { value: 'antes_cirugia',        label: '🏥 Quería intentar todo antes de operarme' },
  { value: 'comparativa_packs',    label: '📦 Comparativa de packs — precio por mes' },
]

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  card:      { background: '#080E1C', border: '1px solid #1A4080', borderRadius: '12px', padding: '20px' } as React.CSSProperties,
  input:     { width: '100%', background: '#050C1E', border: '1px solid #1A4080', borderRadius: '6px', color: '#E8EDF5', fontSize: '13px', padding: '8px 12px', boxSizing: 'border-box' as const },
  label:     { fontSize: '12px', color: '#7A90AA', display: 'block', marginBottom: '5px' } as React.CSSProperties,
  btnPri:    { background: '#6366F1', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnSec:    { background: '#0C1A2E', color: '#C0CFDF', border: '1px solid #1A4080', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' } as React.CSSProperties,
  btnGreen:  { background: '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
}

function Field({ label, value, onChange, type = 'text', placeholder = '', small = false }: any) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={{ ...S.input, ...(small ? { width: 'auto' } : {}) }} />
    </div>
  )
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...S.input, appearance: 'none' as any }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function StepBar({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', marginBottom: '28px' }}>
      {STEPS.map((s, i) => {
        const done = i < step; const cur = i === step
        return (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, height: '3px', background: i === 0 ? 'transparent' : (done || cur ? '#6366F1' : '#1A4080') }} />
            <div style={{ textAlign: 'center', padding: '0 6px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, margin: '0 auto 3px', background: done ? '#6366F1' : cur ? '#6366F118' : 'transparent', border: `2px solid ${done || cur ? '#6366F1' : '#1A4080'}`, color: done ? '#fff' : cur ? '#6366F1' : '#3A5270' }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: '9px', color: cur ? '#6366F1' : done ? '#7A90AA' : '#3A5270', whiteSpace: 'nowrap' }}>{s}</div>
            </div>
            <div style={{ flex: 1, height: '3px', background: i === STEPS.length - 1 ? 'transparent' : (done ? '#6366F1' : '#1A4080') }} />
          </div>
        )
      })}
    </div>
  )
}

// ── Auto-name for an ad set based on ads inside ────────────────────────────────
function autoSetName(ads: AdConfig[], setIdx: number): string {
  const inside = ads.filter(a => a.adSetIdx === setIdx)
  if (!inside.length) return `Conjunto ${setIdx + 1}`
  return inside.map(a => a.fileName.replace(/\.[^.]+$/, '')).join(' | ').slice(0, 80)
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LanzarPage() {
  const [step, setStep] = useState(0)

  // Step 0
  const [driveFiles, setDriveFiles]       = useState<Record<string, DriveFile[]>>({})
  const [activeFolder, setActiveFolder]   = useState<DriveFolder>('No subidos')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [loadingDrive, setLoadingDrive]   = useState(false)

  // Step 1
  const [adConfigs, setAdConfigs] = useState<AdConfig[]>([])

  // Step 2
  const [accounts, setAccounts] = useState<any[]>([])
  const [pages, setPages]       = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [config, setConfig]     = useState<CampaignConfig>({
    campaignName: '', campaignType: 'CBO', budgetAmount: '50',
    objective: 'ventas', accountId: '', pageId: '',
    destinationUrl: '', startDate: '', startTime: '08:00',
    numAdSets: 1, productId: '', ageMin: 35, ageMax: 65, gender: 'all',
  })

  // Step 3 — ad set groups (auto-managed)
  const adSetGroups = (): AdSetGroup[] =>
    Array.from({ length: config.numAdSets }, (_, i) => ({
      idx: i,
      customName: autoSetName(adConfigs, i),
    }))

  // Step 5
  const [progress, setProgress] = useState<CreationProgress>({ status: 'idle', log: [], errors: 0 })
  const logRef = useRef<HTMLDivElement>(null)

  // ── Drive ─────────────────────────────────────────────────────────────────
  async function loadDrive() {
    setLoadingDrive(true)
    try { const r = await fetch('/api/drive/files'); setDriveFiles(await r.json()) } catch (_) {}
    setLoadingDrive(false)
  }
  useEffect(() => { loadDrive() }, [])

  async function loadMeta() {
    const [a, p, pr] = await Promise.all([
      fetch('/api/meta/accounts'), fetch('/api/meta/pages'), fetch('/api/products'),
    ])
    const ad = await a.json(); const pd = await p.json(); const prd = await pr.json()
    setAccounts(ad.accounts || [])
    setPages(pd.pages || [])
    setProducts(prd.products || [])
    setConfig(c => ({
      ...c,
      ...(ad.accounts?.length ? { accountId: ad.accounts[0].id } : {}),
      ...(pd.pages?.length    ? { pageId: pd.pages[0].id }        : {}),
      ...(prd.products?.length ? { productId: prd.products[0].id, destinationUrl: prd.products[0].url || '' } : {}),
    }))
  }

  // ── File selection ─────────────────────────────────────────────────────────
  function toggleFile(id: string) { setSelectedFiles(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  function goToAnalysis() {
    const all = Object.values(driveFiles).flat()
    const sel = all.filter(f => selectedFiles.has(f.id))
    const cfgs: AdConfig[] = sel.map(f => ({
      driveFileId: f.id, fileName: f.name, mimeType: f.mimeType,
      isVideo: f.isVideo, thumbnailLink: f.thumbnailLink,
      headline: '', primaryText: '', angle: '',
      targeting: { geo_locations: { countries: ['AR'] }, age_min: config.ageMin, age_max: config.ageMax },
      analysisLoading: false,  // no auto-analysis — manual copy
      adSetIdx: 0,
    }))
    setAdConfigs(cfgs)
    const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }).replace('/', '.')
    setConfig(c => ({ ...c, campaignName: `Campaña ${today}` }))
    loadMeta()
    setStep(1)
    // No Gemini call — user fills copy manually
  }

  // ── Analysis ───────────────────────────────────────────────────────────────
  async function analyzeOne(idx: number, adData: AdConfig) {
    setAdConfigs(prev => { const n = [...prev]; if (n[idx]) n[idx] = { ...n[idx], analysisLoading: true, analysisError: undefined }; return n })
    try {
      const res = await fetch('/api/creative/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: adData.driveFileId, fileName: adData.fileName,
          mimeType: adData.mimeType, isVideo: adData.isVideo,
          thumbnailLink: adData.thumbnailLink || undefined,
          productId: config.productId || undefined,
        }),
      })
      const data = await res.json()
      setAdConfigs(prev => {
        const n = [...prev]
        n[idx] = { ...n[idx], analysisLoading: false, headline: data.headline || '', primaryText: data.primary_text || '', angle: data.angle || '', targeting: data.targeting || n[idx].targeting, analysisError: data.error }
        return n
      })
    } catch (e: any) {
      setAdConfigs(prev => { const n = [...prev]; n[idx] = { ...n[idx], analysisLoading: false, analysisError: e.message }; return n })
    }
  }

  async function analyzeAllSeq(cfgs?: AdConfig[]) {
    const list = cfgs || adConfigs
    for (let i = 0; i < list.length; i++) await analyzeOne(i, list[i])
  }

  function updateAd(idx: number, field: keyof AdConfig, val: any) {
    setAdConfigs(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: val }; return n })
  }

  // ── Campaign creation ──────────────────────────────────────────────────────
  async function createCampaign() {
    setStep(5)
    setProgress({ status: 'creating', log: ['Iniciando creación en Meta Ads...'], errors: 0 })
    const addLog = (msg: string) => setProgress(p => ({ ...p, log: [...p.log, msg] }))

    try {
      const budgetCents = Math.round(parseFloat(config.budgetAmount) * 100)
      const targeting: any = {
        geo_locations: { countries: ['AR'] },
        age_min: config.ageMin,
        age_max: config.ageMax,
      }
      if (config.gender === 'male')   targeting.genders = [1]
      if (config.gender === 'female') targeting.genders = [2]

      // Build ad sets list with assigned ads
      const adSetsPayload = adSetGroups().map(g => ({
        name: g.customName,
        ads: adConfigs
          .filter(a => a.adSetIdx === g.idx)
          .map(a => ({ driveFileId: a.driveFileId, mimeType: a.mimeType, fileName: a.fileName, headline: a.headline, primaryText: a.primaryText, angle: a.angle })),
      }))

      let startDateTime: string | undefined
      if (config.startDate) {
        startDateTime = `${config.startDate}T${config.startTime || '08:00'}:00`
      }

      addLog(`Creando campaña "${config.campaignName}"...`)
      const res = await fetch('/api/campaign/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: config.campaignName,
          campaignType: config.campaignType,
          budgetCents, objective: config.objective,
          accountId: config.accountId, pageId: config.pageId,
          destinationUrl: config.destinationUrl,
          startDateTime,
          targeting,
          productId: config.productId || undefined,
          adSets: adSetsPayload,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      addLog(`✅ Campaña creada: ${data.campaignId}`)
      data.adSets?.forEach((s: any) => addLog(`✅ Conjunto: ${s.name} → ${s.adIds?.length || 0} ads`))
      if (data.errors > 0) addLog(`⚠ ${data.errors} ads fallaron`)
      addLog('Todo creado como BORRADOR. Activar desde Borradores.')
      setProgress(p => ({ ...p, status: 'done', draftId: data.draftId, errors: data.errors || 0 }))
    } catch (e: any) {
      setProgress(p => ({ ...p, status: 'error', log: [...p.log, '❌ Error: ' + e.message] }))
    }
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [progress.log])

  const totalSel = selectedFiles.size

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Lanzar campaña" subtitle="Creación automática desde Google Drive" />
        <main style={{ padding: '20px', maxWidth: '1200px' }}>
          <StepBar step={step} />

          {/* ── STEP 0: Archivos ─────────────────────────────────────────── */}
          {step === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'start' }}>
              {/* Folder nav */}
              <div style={S.card}>
                <div style={{ fontSize: '11px', color: '#3A5270', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '10px' }}>CARPETAS</div>
                {SUBFOLDER_NAMES.map(folder => {
                  const count = (driveFiles[folder] || []).length
                  const active = folder === activeFolder
                  return (
                    <button key={folder} onClick={() => setActiveFolder(folder as DriveFolder)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', borderRadius: '6px', marginBottom: '3px', background: active ? '#071428' : 'transparent', border: active ? '1px solid #1A4080' : '1px solid transparent', color: active ? '#E8EDF5' : '#7A90AA', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>
                      <span>{SUBFOLDER_EMOJI[folder]} {folder}</span>
                      {count > 0 && <span style={{ fontSize: '10px', color: '#3A5270' }}>{count}</span>}
                    </button>
                  )
                })}
              </div>
              {/* File grid */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ color: '#E8EDF5', fontSize: '14px', fontWeight: 700, flex: 1 }}>{SUBFOLDER_EMOJI[activeFolder]} {activeFolder}</span>
                  <button onClick={loadDrive} style={S.btnSec} disabled={loadingDrive}>{loadingDrive ? '...' : '↻'}</button>
                  <button onClick={() => { const ids = (driveFiles[activeFolder] || []).map(f => f.id); setSelectedFiles(s => { const n = new Set(s); ids.forEach(id => n.add(id)); return n }) }} style={S.btnSec}>Todos</button>
                  <button onClick={() => { const ids = new Set((driveFiles[activeFolder] || []).map(f => f.id)); setSelectedFiles(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n }) }} style={S.btnSec}>Ninguno</button>
                </div>
                {loadingDrive ? <div style={{ color: '#7A90AA', padding: '40px', textAlign: 'center' }}>Cargando...</div>
                  : (driveFiles[activeFolder] || []).length === 0 ? <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#7A90AA' }}>Carpeta vacía</div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                      {(driveFiles[activeFolder] || []).map(f => {
                        const sel = selectedFiles.has(f.id)
                        return (
                          <div key={f.id} onClick={() => toggleFile(f.id)} style={{ ...S.card, padding: 0, cursor: 'pointer', overflow: 'hidden', border: sel ? '2px solid #6366F1' : '1px solid #1A4080', position: 'relative' }}>
                            <div style={{ width: '100%', height: '95px', background: '#050C1E', position: 'relative' }}>
                              {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '28px' }}>{f.isVideo ? '🎬' : '🖼'}</div>}
                              {f.isVideo && <div style={{ position: 'absolute', top: '5px', left: '5px', background: '#00000080', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', color: '#fff', fontWeight: 700 }}>VIDEO</div>}
                              {sel && <div style={{ position: 'absolute', top: '5px', right: '5px', width: '18px', height: '18px', background: '#6366F1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: 700 }}>✓</div>}
                            </div>
                            <div style={{ padding: '7px 9px' }}>
                              <div style={{ fontSize: '10px', color: '#C0CFDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                              <div style={{ fontSize: '9px', color: '#3A5270', marginTop: '1px' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* ── STEP 1: Copy manual ──────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: '13px', color: '#7A90AA', marginBottom: '16px' }}>
                Abrí cada video, elegí el ángulo y completá el copy. El título va en el anuncio de Meta (máx 40 chars).
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {adConfigs.map((ad, i) => (
                  <div key={ad.driveFileId} style={{ ...S.card, padding: '0', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '180px' }}>

                      {/* Left: preview */}
                      <div style={{ background: '#050C1E', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        {/* Thumbnail */}
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                          {ad.thumbnailLink
                            ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '40px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>
                          }
                          {ad.isVideo && (
                            <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#00000080', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', color: '#fff', fontWeight: 700 }}>VIDEO</div>
                          )}
                        </div>
                        {/* File name + open button */}
                        <div style={{ padding: '8px 10px', borderTop: '1px solid #1A4080' }}>
                          <div style={{ fontSize: '10px', color: '#7A90AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '6px' }} title={ad.fileName}>
                            {ad.fileName}
                          </div>
                          <a
                            href={`https://drive.google.com/file/d/${ad.driveFileId}/view`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: '#6366F1', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}
                          >
                            ▶ Ver {ad.isVideo ? 'video' : 'imagen'}
                          </a>
                        </div>
                      </div>

                      {/* Right: copy form */}
                      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                        {/* Angle selector */}
                        <div>
                          <label style={S.label}>Ángulo del ad</label>
                          <select value={ad.angle} onChange={e => updateAd(i, 'angle', e.target.value)}
                            style={{ ...S.input, appearance: 'none' as any }}>
                            {ANGLES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>

                        {/* Headline */}
                        <div>
                          <label style={S.label}>
                            Título del anuncio
                            <span style={{ marginLeft: '8px', fontSize: '11px', color: ad.headline.length > 35 ? '#F59E0B' : '#3A5270' }}>
                              {ad.headline.length}/40
                            </span>
                          </label>
                          <input
                            value={ad.headline}
                            onChange={e => updateAd(i, 'headline', e.target.value)}
                            maxLength={40}
                            placeholder="Ej: ¿Tu vista está fallando después de los 40?"
                            style={{ ...S.input, fontWeight: 600 }}
                          />
                        </div>

                        {/* Primary text */}
                        <div style={{ flex: 1 }}>
                          <label style={S.label}>Texto principal del anuncio</label>
                          <textarea
                            value={ad.primaryText}
                            onChange={e => updateAd(i, 'primaryText', e.target.value)}
                            rows={4}
                            placeholder="Escribí el copy del anuncio..."
                            style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: Configurar ──────────────────────────────────────── */}
          {step === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Col 1 */}
              <div>
                <div style={S.card}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Campaña</div>
                  <Field label="Nombre campaña *" value={config.campaignName} onChange={(v: string) => setConfig(c => ({ ...c, campaignName: v }))} />
                  <Sel label="Tipo" value={config.campaignType} onChange={v => setConfig(c => ({ ...c, campaignType: v as any }))}
                    options={[{ value: 'CBO', label: 'CBO — Presupuesto de campaña' }, { value: 'ABO', label: 'ABO — Presupuesto por conjunto' }]} />
                  <Sel label="Objetivo" value={config.objective} onChange={v => setConfig(c => ({ ...c, objective: v as any }))}
                    options={[{ value: 'ventas', label: '🛒 Ventas' }, { value: 'trafico', label: '🔗 Tráfico' }, { value: 'alcance', label: '📢 Alcance' }]} />
                  <div style={{ marginBottom: '14px' }}>
                    <label style={S.label}>Cantidad de conjuntos</label>
                    <input type="number" min="1" max="20" value={config.numAdSets}
                      onChange={e => {
                        const n = parseInt(e.target.value) || 1
                        setConfig(c => ({ ...c, numAdSets: n }))
                        // Reset all ads to set 0 when numAdSets changes
                        setAdConfigs(prev => prev.map(a => ({ ...a, adSetIdx: Math.min(a.adSetIdx, n - 1) })))
                      }}
                      style={{ ...S.input, width: '80px', textAlign: 'center', fontWeight: 700, fontSize: '16px' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={S.label}>Presupuesto diario ({config.campaignType === 'CBO' ? 'campaña' : 'por conjunto'})</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: '#7A90AA', fontWeight: 700 }}>$</span>
                      <input type="number" value={config.budgetAmount} onChange={e => setConfig(c => ({ ...c, budgetAmount: e.target.value }))} min="1" step="1" style={{ ...S.input, width: '120px' }} />
                      <span style={{ color: '#7A90AA', fontSize: '13px' }}>/ día</span>
                    </div>
                  </div>
                </div>

                {/* Fecha y hora */}
                <div style={{ ...S.card, marginTop: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Fecha y hora de activación</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <Field label="Fecha (opcional)" value={config.startDate} onChange={(v: string) => setConfig(c => ({ ...c, startDate: v }))} type="date" />
                    <Field label="Hora" value={config.startTime} onChange={(v: string) => setConfig(c => ({ ...c, startTime: v }))} type="time" />
                  </div>
                  <div style={{ fontSize: '11px', color: '#3A5270' }}>Sin fecha → activa inmediatamente (en borrador, se activa manualmente)</div>
                </div>
              </div>

              {/* Col 2 */}
              <div>
                <div style={S.card}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Cuenta & Fanpage</div>
                  <Sel label="Cuenta publicitaria"
                    value={config.accountId} onChange={v => setConfig(c => ({ ...c, accountId: v }))}
                    options={accounts.length ? accounts.map(a => ({ value: a.id, label: `${a.name} (${a.id})` })) : [{ value: '', label: 'Cargando...' }]} />
                  <div style={{ marginBottom: '14px' }}>
                    <label style={S.label}>Fanpage</label>
                    {pages.length > 0 ? (
                      <select value={config.pageId} onChange={e => setConfig(c => ({ ...c, pageId: e.target.value }))}
                        style={{ ...S.input, appearance: 'none' as any }}>
                        {pages.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                      </select>
                    ) : (
                      <>
                        <input value={config.pageId} onChange={e => setConfig(c => ({ ...c, pageId: e.target.value }))}
                          placeholder="ID de la fanpage (ej: 123456789)" style={S.input} />
                        <div style={{ fontSize: '10px', color: '#3A5270', marginTop: '3px' }}>No se encontraron páginas automáticamente. Ingresá el ID manualmente.</div>
                      </>
                    )}
                  </div>
                  <Field label="URL destino *" value={config.destinationUrl} onChange={(v: string) => setConfig(c => ({ ...c, destinationUrl: v }))} type="url" />
                  <Sel label="Producto (para copy automático)"
                    value={config.productId} onChange={v => setConfig(c => ({ ...c, productId: v }))}
                    options={[{ value: '', label: '— Sin producto —' }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
                </div>

                {/* Audiencia */}
                <div style={{ ...S.card, marginTop: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Público objetivo</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={S.label}>Edad mínima</label>
                      <input type="number" min="18" max="65" value={config.ageMin}
                        onChange={e => setConfig(c => ({ ...c, ageMin: parseInt(e.target.value) || 18 }))}
                        style={{ ...S.input, textAlign: 'center' }} />
                    </div>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={S.label}>Edad máxima</label>
                      <input type="number" min="18" max="65" value={config.ageMax}
                        onChange={e => setConfig(c => ({ ...c, ageMax: parseInt(e.target.value) || 65 }))}
                        style={{ ...S.input, textAlign: 'center' }} />
                    </div>
                  </div>
                  <Sel label="Género" value={config.gender} onChange={v => setConfig(c => ({ ...c, gender: v as any }))}
                    options={[{ value: 'all', label: 'Todos (hombres y mujeres)' }, { value: 'female', label: 'Solo mujeres' }, { value: 'male', label: 'Solo hombres' }]} />
                  <div style={{ background: '#0C1A2E', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: '#7A90AA' }}>
                    🇦🇷 País: Argentina · Edades {config.ageMin}-{config.ageMax} · {config.gender === 'all' ? 'Todos los géneros' : config.gender === 'female' ? 'Mujeres' : 'Hombres'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Estructura ──────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: '13px', color: '#7A90AA', marginBottom: '16px' }}>
                Asigná cada ad a un conjunto. El conjunto toma el nombre de los ads que tenga adentro.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(config.numAdSets, 3)}, 1fr)`, gap: '12px', marginBottom: '20px' }}>
                {adSetGroups().map(g => {
                  const inside = adConfigs.filter(a => a.adSetIdx === g.idx)
                  return (
                    <div key={g.idx} style={{ ...S.card, border: '1px solid #1A4080' }}>
                      <div style={{ fontSize: '11px', color: '#6366F1', fontWeight: 700, marginBottom: '6px' }}>CONJUNTO {g.idx + 1}</div>
                      <div style={{ fontSize: '12px', color: '#E8EDF5', fontWeight: 600, marginBottom: '10px', minHeight: '32px', lineHeight: 1.4 }}>
                        {g.customName}
                      </div>
                      {inside.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#3A5270', textAlign: 'center', padding: '10px' }}>Sin ads asignados</div>
                      ) : (
                        inside.map(ad => (
                          <div key={ad.driveFileId} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', background: '#050C1E', borderRadius: '6px', padding: '6px 8px' }}>
                            <div style={{ width: '32px', height: '32px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', background: '#0C1A2E' }}>
                              {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '14px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, fontSize: '11px', color: '#C0CFDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Ad assignment list */}
              <div style={{ ...S.card }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#7A90AA', marginBottom: '12px', letterSpacing: '0.1em' }}>ASIGNAR ADS A CONJUNTOS</div>
                {adConfigs.map((ad, i) => (
                  <div key={ad.driveFileId} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', padding: '8px 10px', background: '#050C1E', borderRadius: '8px' }}>
                    <div style={{ width: '40px', height: '40px', flexShrink: 0, borderRadius: '5px', overflow: 'hidden', background: '#0C1A2E' }}>
                      {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '18px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: '#E8EDF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                      {ad.headline && <div style={{ fontSize: '10px', color: '#6366F1', marginTop: '1px' }}>"{ad.headline}"</div>}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <label style={{ ...S.label, fontSize: '10px', marginBottom: '2px' }}>Conjunto</label>
                      <select value={ad.adSetIdx} onChange={e => updateAd(i, 'adSetIdx', parseInt(e.target.value))}
                        style={{ ...S.input, width: 'auto', fontSize: '12px', padding: '5px 10px', appearance: 'none' as any }}>
                        {Array.from({ length: config.numAdSets }, (_, j) => (
                          <option key={j} value={j}>Conjunto {j + 1}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: Revisar ─────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <div style={{ ...S.card, marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Resumen</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Campaña', value: config.campaignName },
                    { label: 'Tipo', value: config.campaignType },
                    { label: 'Presupuesto', value: `$${config.budgetAmount}/día` },
                    { label: 'Objetivo', value: config.objective },
                    { label: 'Conjuntos', value: String(config.numAdSets) },
                    { label: 'Total ads', value: String(adConfigs.length) },
                    { label: 'Público', value: `${config.ageMin}-${config.ageMax} · ${config.gender}` },
                    { label: 'Inicio', value: config.startDate ? `${config.startDate} ${config.startTime}` : 'Borrador (manual)' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: '#7A90AA' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#E8EDF5', fontWeight: 600, marginTop: '2px' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {adSetGroups().map(g => {
                const inside = adConfigs.filter(a => a.adSetIdx === g.idx)
                return (
                  <div key={g.idx} style={{ ...S.card, marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366F1', marginBottom: '10px' }}>Conjunto {g.idx + 1} — {g.customName}</div>
                    {inside.map(ad => (
                      <div key={ad.driveFileId} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px', padding: '8px', background: '#050C1E', borderRadius: '6px' }}>
                        <div style={{ width: '44px', height: '44px', flexShrink: 0, borderRadius: '5px', overflow: 'hidden', background: '#0C1A2E' }}>
                          {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '18px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: '#E8EDF5', fontWeight: 600 }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                          {ad.headline && <div style={{ fontSize: '11px', color: '#C0CFDF', marginTop: '2px' }}>"{ad.headline}"</div>}
                          {!ad.headline && <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '2px' }}>⚠ Sin titular — el ad se crea igual</div>}
                        </div>
                      </div>
                    ))}
                    {inside.length === 0 && <div style={{ fontSize: '11px', color: '#EF4444' }}>⚠ Conjunto vacío — no se va a crear</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── STEP 5: Crear ───────────────────────────────────────────── */}
          {step === 5 && (
            <div style={{ maxWidth: '700px' }}>
              <div style={S.card}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>
                  {progress.status === 'creating' && '⏳ Creando campaña...'}
                  {progress.status === 'done'     && '✅ Campaña creada como borrador'}
                  {progress.status === 'error'    && '❌ Error al crear'}
                </div>
                <div ref={logRef} style={{ background: '#050C1E', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', maxHeight: '280px', overflowY: 'auto', marginBottom: '16px' }}>
                  {progress.log.map((l, i) => (
                    <div key={i} style={{ color: l.startsWith('❌') ? '#EF4444' : l.startsWith('⚠') ? '#F59E0B' : '#22C55E', marginBottom: '3px' }}>{l}</div>
                  ))}
                  {progress.status === 'creating' && <div style={{ color: '#7A90AA' }}>...</div>}
                </div>
                {progress.status === 'done' && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <a href="/borradores" style={{ ...S.btnPri, textDecoration: 'none', display: 'inline-block' }}>Ver en Borradores</a>
                    <button onClick={() => { setStep(0); setSelectedFiles(new Set()); setAdConfigs([]); loadDrive() }} style={S.btnSec}>Nueva campaña</button>
                  </div>
                )}
                {progress.status === 'error' && <button onClick={() => setStep(4)} style={S.btnSec}>← Volver</button>}
              </div>
            </div>
          )}

          {/* ── Navigation ──────────────────────────────────────────────── */}
          {step < 5 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <div>
                {step > 0 && <button onClick={() => setStep(s => s - 1)} style={S.btnSec}>← Anterior</button>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {step === 0 && (
                  <>
                    {totalSel > 0 && <span style={{ fontSize: '13px', color: '#7A90AA' }}>{totalSel} seleccionados</span>}
                    <button onClick={goToAnalysis} disabled={totalSel === 0}
                      style={{ ...S.btnPri, opacity: totalSel === 0 ? 0.4 : 1, cursor: totalSel === 0 ? 'not-allowed' : 'pointer' }}>
                      Analizar ({totalSel}) →
                    </button>
                  </>
                )}
                {step === 1 && (
                  <button onClick={() => setStep(2)} style={S.btnPri}>Configurar →</button>
                )}
                {step === 2 && (
                  <button onClick={() => {
                    if (!config.campaignName || !config.accountId || !config.pageId || !config.destinationUrl) {
                      alert('Completá campaña, cuenta, fanpage y URL destino')
                      return
                    }
                    setStep(3)
                  }} style={S.btnPri}>Estructura →</button>
                )}
                {step === 3 && <button onClick={() => setStep(4)} style={S.btnPri}>Revisar →</button>}
                {step === 4 && <button onClick={createCampaign} style={S.btnGreen}>✓ Crear como borrador</button>}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
