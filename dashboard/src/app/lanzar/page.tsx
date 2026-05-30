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

type AdDraft = {
  uid: string           // unique — same driveFileId can appear multiple times
  driveFileId: string
  fileName: string
  mimeType: string
  isVideo: boolean
  thumbnailLink?: string
  angle: string
  headline: string
  primaryText: string
  adSetIndices: number[]  // which sets this ad belongs to
  loading: boolean
  error?: string
}

type CampaignConfig = {
  campaignName: string
  campaignType: 'CBO' | 'ABO'
  objective: 'ventas' | 'trafico' | 'alcance'
  optimizationGoal: 'OFFSITE_CONVERSIONS' | 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS' | 'REACH'
  pixelEvent: 'Purchase' | 'AddToCart' | 'InitiateCheckout' | 'ViewContent'
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP' | 'COST_CAP' | 'BID_CAP'
  bidAmount: string
  budgetAmount: string
  placements: string[]
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

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = ['Archivos', 'Copies', 'Estructura', 'Configurar', 'Revisar', 'Crear']

const PLACEMENTS_OPTIONS = [
  { value: 'feed',        label: 'Feed' },
  { value: 'reels',       label: 'Reels' },
  { value: 'stories',     label: 'Stories' },
  { value: 'search',      label: 'Search' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'video_feeds', label: 'Video Feeds' },
]

const S = {
  card:    { background: '#080E1C', border: '1px solid #1A4080', borderRadius: '12px', padding: '20px' } as React.CSSProperties,
  input:   { width: '100%', background: '#050C1E', border: '1px solid #1A4080', borderRadius: '6px', color: '#E8EDF5', fontSize: '13px', padding: '8px 12px', boxSizing: 'border-box' as const },
  label:   { fontSize: '12px', color: '#7A90AA', display: 'block', marginBottom: '5px' } as React.CSSProperties,
  btnPri:  { background: '#6366F1', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnSec:  { background: '#0C1A2E', color: '#C0CFDF', border: '1px solid #1A4080', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' } as React.CSSProperties,
  btnGreen:{ background: '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnSm:   { background: '#0C1A2E', color: '#C0CFDF', border: '1px solid #1A4080', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' } as React.CSSProperties,
}

function uid() { return Math.random().toString(36).slice(2) }

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

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={S.input} />
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LanzarPage() {
  const [step, setStep] = useState(0)

  // Step 0
  const [driveFiles, setDriveFiles]       = useState<Record<string, DriveFile[]>>({})
  const [activeFolder, setActiveFolder]   = useState<DriveFolder>('No subidos')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [loadingDrive, setLoadingDrive]   = useState(false)
  const [filterType, setFilterType]       = useState<'all' | 'video' | 'image'>('all')
  const [filterSort, setFilterSort]       = useState<'newest' | 'oldest' | 'name'>('newest')
  const [filterSearch, setFilterSearch]   = useState('')

  // Step 1 — ads with auto-generated copy
  const [ads, setAds] = useState<AdDraft[]>([])

  // Step 2 — ad sets (names auto from ads)
  // numAdSets lives in config

  // Step 3 — campaign config
  const [accounts, setAccounts] = useState<any[]>([])
  const [pages, setPages]       = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [config, setConfig]     = useState<CampaignConfig>({
    campaignName: '', campaignType: 'CBO', objective: 'ventas',
    optimizationGoal: 'OFFSITE_CONVERSIONS', pixelEvent: 'Purchase',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP', bidAmount: '',
    budgetAmount: '50', placements: ['feed', 'reels', 'stories'],
    accountId: '', pageId: '1121231927732288', destinationUrl: '',
    startDate: '', startTime: '08:00',
    numAdSets: 1, productId: '', ageMin: 35, ageMax: 65, gender: 'all',
  })

  // Step 3 tabs
  const [configTab, setConfigTab] = useState<'campaign' | 'adset' | 'ad'>('campaign')

  // Step 5
  const [progress, setProgress] = useState<CreationProgress>({ status: 'idle', log: [], errors: 0 })
  const logRef = useRef<HTMLDivElement>(null)

  // ── Drive ──────────────────────────────────────────────────────────────────
  async function loadDrive() {
    setLoadingDrive(true)
    try { const r = await fetch('/api/drive/files'); setDriveFiles(await r.json()) } catch (_) {}
    setLoadingDrive(false)
  }
  useEffect(() => { loadDrive() }, [])

  async function loadMeta() {
    const [a, p, pr] = await Promise.all([fetch('/api/meta/accounts'), fetch('/api/meta/pages'), fetch('/api/products')])
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

  function toggleFile(id: string) {
    setSelectedFiles(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Step 0 → 1: auto-analyze all selected videos ──────────────────────────
  async function goToStep1() {
    const all = Object.values(driveFiles).flat()
    const sel = all.filter(f => selectedFiles.has(f.id))
    const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }).replace('/', '.')
    setConfig(c => ({ ...c, campaignName: `Campaña ${today}` }))
    loadMeta()

    const drafts: AdDraft[] = sel.map(f => ({
      uid: uid(), driveFileId: f.id, fileName: f.name, mimeType: f.mimeType,
      isVideo: f.isVideo, thumbnailLink: f.thumbnailLink,
      angle: '', headline: '', primaryText: '',
      adSetIndices: [0], loading: true, error: undefined,
    }))
    setAds(drafts)
    setStep(1)

    // Analyze all in parallel
    await Promise.all(drafts.map((d, i) => analyzeAd(i, d)))
  }

  async function analyzeAd(idx: number, ad: AdDraft) {
    try {
      const res = await fetch('/api/creative/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: ad.driveFileId, fileName: ad.fileName, mimeType: ad.mimeType, isVideo: ad.isVideo, thumbnailLink: ad.thumbnailLink }),
      })
      const data = await res.json()
      setAds(prev => {
        const n = [...prev]
        if (n[idx]) n[idx] = { ...n[idx], loading: false, angle: data.angle || '', headline: data.headline || '', primaryText: data.primary_text || '', error: data.error }
        return n
      })
    } catch (e: any) {
      setAds(prev => { const n = [...prev]; if (n[idx]) n[idx] = { ...n[idx], loading: false, error: e.message }; return n })
    }
  }

  async function regenerateCopy(idx: number) {
    const ad = ads[idx]
    setAds(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: true, error: undefined }; return n })
    try {
      const res = await fetch('/api/copy/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angle: ad.angle, driveFileId: ad.driveFileId, thumbnailLink: ad.thumbnailLink }),
      })
      const data = await res.json()
      setAds(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: false, headline: data.headline || n[idx].headline, primaryText: data.primary_text || n[idx].primaryText, error: data.error }; return n })
    } catch (e: any) {
      setAds(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: false, error: e.message }; return n })
    }
  }

  function updateAd(idx: number, field: keyof AdDraft, val: any) {
    setAds(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: val }; return n })
  }

  function duplicateAd(idx: number) {
    const ad = ads[idx]
    const copy: AdDraft = { ...ad, uid: uid(), adSetIndices: [0] }
    setAds(prev => { const n = [...prev]; n.splice(idx + 1, 0, copy); return n })
  }

  function removeAd(idx: number) {
    setAds(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Ad set helpers ────────────────────────────────────────────────────────
  function adSetName(setIdx: number): string {
    const inside = ads.filter(a => a.adSetIndices.includes(setIdx))
    if (!inside.length) return `Conjunto ${setIdx + 1}`
    return inside.map(a => a.fileName.replace(/\.[^.]+$/, '')).join(' | ').slice(0, 60)
  }

  function toggleAdSet(adIdx: number, setIdx: number) {
    setAds(prev => {
      const n = [...prev]
      const ad = { ...n[adIdx] }
      if (ad.adSetIndices.includes(setIdx)) {
        if (ad.adSetIndices.length === 1) return n // must belong to at least 1
        ad.adSetIndices = ad.adSetIndices.filter(i => i !== setIdx)
      } else {
        ad.adSetIndices = [...ad.adSetIndices, setIdx].sort()
      }
      n[adIdx] = ad
      return n
    })
  }

  // ── Campaign creation ─────────────────────────────────────────────────────
  async function createCampaign() {
    setStep(5)
    setProgress({ status: 'creating', log: ['Iniciando creación en Meta Ads...'], errors: 0 })
    const addLog = (msg: string) => setProgress(p => ({ ...p, log: [...p.log, msg] }))

    try {
      const budgetCents = Math.round(parseFloat(config.budgetAmount) * 100)
      const targeting: any = { geo_locations: { countries: ['AR'] }, age_min: config.ageMin, age_max: config.ageMax }
      if (config.gender === 'male')   targeting.genders = [1]
      if (config.gender === 'female') targeting.genders = [2]

      const numSets = config.numAdSets
      const adSetsPayload = Array.from({ length: numSets }, (_, setIdx) => ({
        name: adSetName(setIdx),
        ads: ads
          .filter(a => a.adSetIndices.includes(setIdx))
          .map(a => ({ driveFileId: a.driveFileId, mimeType: a.mimeType, fileName: a.fileName, headline: a.headline, primaryText: a.primaryText, angle: a.angle })),
      }))

      addLog(`Creando campaña "${config.campaignName}"...`)
      const res = await fetch('/api/campaign/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: config.campaignName, campaignType: config.campaignType,
          budgetCents, objective: config.objective,
          optimizationGoal: config.optimizationGoal, pixelEvent: config.pixelEvent,
          bidStrategy: config.bidStrategy, bidAmount: config.bidAmount ? parseFloat(config.bidAmount) * 100 : undefined,
          placements: config.placements,
          accountId: config.accountId, pageId: config.pageId,
          destinationUrl: config.destinationUrl,
          startDateTime: config.startDate ? `${config.startDate}T${config.startTime || '08:00'}:00` : undefined,
          targeting, productId: config.productId || undefined,
          adSets: adSetsPayload,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      addLog(`✅ Campaña creada: ${data.campaignId}`)
      data.adSets?.forEach((s: any) => addLog(`✅ Conjunto: ${s.name} → ${s.adIds?.length || 0} ads`))
      if (data.errors > 0) addLog(`⚠ ${data.errors} ads fallaron`)
      addLog('Todo creado como BORRADOR.')
      setProgress(p => ({ ...p, status: 'done', draftId: data.draftId, errors: data.errors || 0 }))
    } catch (e: any) {
      setProgress(p => ({ ...p, status: 'error', log: [...p.log, '❌ ' + e.message] }))
    }
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [progress.log])

  const loadingCount = ads.filter(a => a.loading).length
  const totalSel = selectedFiles.size

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Lanzar campaña" subtitle="Creación masiva desde Google Drive" />
        <main style={{ padding: '20px', maxWidth: '1300px' }}>
          <StepBar step={step} />

          {/* ── STEP 0: Archivos ──────────────────────────────────────────── */}
          {step === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '16px', alignItems: 'start' }}>
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
              <div>
                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#E8EDF5', fontSize: '14px', fontWeight: 700, flex: 1 }}>{SUBFOLDER_EMOJI[activeFolder]} {activeFolder}</span>

                  {/* Type filter */}
                  {(['all', 'video', 'image'] as const).map(t => (
                    <button key={t} onClick={() => setFilterType(t)} style={{ ...S.btnSm, background: filterType === t ? '#6366F1' : '#0C1A2E', color: filterType === t ? '#fff' : '#7A90AA', border: filterType === t ? '1px solid #6366F1' : '1px solid #1A4080' }}>
                      {t === 'all' ? 'Todos' : t === 'video' ? '🎬 Videos' : '🖼 Imágenes'}
                    </button>
                  ))}

                  {/* Search by name */}
                  <input
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                    placeholder="Buscar por nombre..."
                    style={{ ...S.input, width: '160px', fontSize: '11px', padding: '4px 10px' }}
                  />

                  {/* Sort */}
                  <select value={filterSort} onChange={e => setFilterSort(e.target.value as any)} style={{ ...S.input, width: 'auto', fontSize: '11px', padding: '4px 10px' }}>
                    <option value="newest">Más nuevos primero</option>
                    <option value="oldest">Más viejos primero</option>
                    <option value="name">Nombre A→Z</option>
                  </select>

                  <button onClick={loadDrive} style={S.btnSec} disabled={loadingDrive}>{loadingDrive ? '...' : '↻'}</button>
                  <button onClick={() => {
                    const filtered = (driveFiles[activeFolder] || [])
                      .filter(f => filterType === 'all' || (filterType === 'video' ? f.isVideo : !f.isVideo))
                    filtered.forEach(f => setSelectedFiles(s => { const n = new Set(s); n.add(f.id); return n }))
                  }} style={S.btnSec}>Todos</button>
                  <button onClick={() => { const ids = new Set((driveFiles[activeFolder] || []).map(f => f.id)); setSelectedFiles(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n }) }} style={S.btnSec}>Ninguno</button>
                  {totalSel > 0 && (
                    <button onClick={goToStep1} style={{ ...S.btnPri, fontSize: '12px', padding: '8px 16px' }}>
                      ✨ Analizar {totalSel} ads →
                    </button>
                  )}
                </div>

                {loadingDrive
                  ? <div style={{ color: '#7A90AA', padding: '40px', textAlign: 'center' }}>Cargando...</div>
                  : !(driveFiles[activeFolder] || []).length
                    ? <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#7A90AA' }}>Carpeta vacía</div>
                    : (() => {
                        let files = [...(driveFiles[activeFolder] || [])]
                        if (filterType === 'video') files = files.filter(f => f.isVideo)
                        if (filterType === 'image') files = files.filter(f => !f.isVideo)
                        if (filterSearch.trim()) files = files.filter(f => f.name.toLowerCase().includes(filterSearch.toLowerCase()))
                        if (filterSort === 'newest') files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
                        if (filterSort === 'oldest') files.sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime))
                        if (filterSort === 'name')   files.sort((a, b) => a.name.localeCompare(b.name))
                        return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                        {files.map(f => {
                          const sel = selectedFiles.has(f.id)
                          return (
                            <div key={f.id} onClick={() => toggleFile(f.id)} style={{ ...S.card, padding: 0, cursor: 'pointer', overflow: 'hidden', border: sel ? '2px solid #6366F1' : '1px solid #1A4080', position: 'relative' }}>
                              <div style={{ width: '100%', height: '90px', background: '#050C1E', position: 'relative' }}>
                                {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '28px' }}>{f.isVideo ? '🎬' : '🖼'}</div>}
                                {f.isVideo && <div style={{ position: 'absolute', top: '4px', left: '4px', background: '#00000080', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', color: '#fff', fontWeight: 700 }}>VIDEO</div>}
                                {sel && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', background: '#6366F1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: 700 }}>✓</div>}
                              </div>
                              <div style={{ padding: '6px 8px' }}>
                                <div style={{ fontSize: '10px', color: '#C0CFDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                                <div style={{ fontSize: '9px', color: '#3A5270', marginTop: '1px' }}>
                                  {(f.size / 1024 / 1024).toFixed(1)} MB · {new Date(f.modifiedTime).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                        )
                      })()
                }
              </div>
            </div>
          )}

          {/* ── STEP 1: Copies (auto-generated, editable) ─────────────────── */}
          {step === 1 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: '#7A90AA' }}>
                  {loadingCount > 0 ? `⏳ Analizando ${loadingCount} video(s)...` : `${ads.length} ads listos. Editá lo que quieras.`}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#3A5270', alignSelf: 'center' }}>{ads.length} ads</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ads.map((ad, i) => (
                  <div key={ad.uid} style={{ ...S.card, padding: 0, overflow: 'hidden', opacity: ad.loading ? 0.7 : 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '160px' }}>

                      {/* Preview */}
                      <div style={{ background: '#050C1E', display: 'flex', flexDirection: 'column' }}>
                        {ad.isVideo ? (
                          <video controls preload="metadata" style={{ width: '100%', objectFit: 'cover', display: 'block', flex: 1, maxHeight: '260px' }}>
                            <source src={`/api/drive/stream?id=${ad.driveFileId}`} type="video/mp4" />
                          </video>
                        ) : (
                          <div style={{ flex: 1, minHeight: '120px', position: 'relative' }}>
                            {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '32px' }}>🖼</div>}
                          </div>
                        )}
                        <div style={{ padding: '6px 10px', borderTop: '1px solid #1A4080' }}>
                          <div style={{ fontSize: '9px', color: '#7A90AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.fileName}>{ad.fileName}</div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                            <button onClick={() => duplicateAd(i)} style={{ ...S.btnSm, flex: 1 }} title="Duplicar para otro conjunto">⧉ Duplicar</button>
                            <button onClick={() => removeAd(i)} style={{ ...S.btnSm, color: '#EF4444', borderColor: '#EF4444' }} title="Eliminar">✕</button>
                          </div>
                        </div>
                      </div>

                      {/* Copy form */}
                      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {ad.loading && (
                          <div style={{ fontSize: '12px', color: '#6366F1' }}>⏳ Analizando con IA...</div>
                        )}
                        {ad.error && (
                          <div style={{ fontSize: '11px', color: '#EF4444', background: '#1a0808', borderRadius: '5px', padding: '5px 8px' }}>❌ {ad.error}</div>
                        )}

                        {/* Ángulo */}
                        <div>
                          <label style={S.label}>Ángulo detectado</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input value={ad.angle} onChange={e => updateAd(i, 'angle', e.target.value)} placeholder="Ej: deterioro_silencioso" style={{ ...S.input, flex: 1, fontSize: '12px' }} />
                            <button onClick={() => regenerateCopy(i)} disabled={ad.loading} style={{ ...S.btnSm, whiteSpace: 'nowrap', background: '#6366F120', borderColor: '#6366F1', color: '#6366F1' }}>
                              {ad.loading ? '⏳' : '↻ Re-generar'}
                            </button>
                          </div>
                        </div>

                        {/* Headline */}
                        <div>
                          <label style={S.label}>
                            Título
                            <span style={{ marginLeft: '8px', fontSize: '10px', color: ad.headline.length > 35 ? '#F59E0B' : '#3A5270' }}>{ad.headline.length}/40</span>
                          </label>
                          <input value={ad.headline} onChange={e => updateAd(i, 'headline', e.target.value)} maxLength={40} placeholder="Ej: ¿Tu vista está fallando?" style={{ ...S.input, fontWeight: 600, fontSize: '13px' }} />
                        </div>

                        {/* Primary text */}
                        <div style={{ flex: 1 }}>
                          <label style={S.label}>Texto principal</label>
                          <textarea value={ad.primaryText} onChange={e => updateAd(i, 'primaryText', e.target.value)} rows={3} style={{ ...S.input, resize: 'vertical', lineHeight: 1.5 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: Estructura (asignación libre a conjuntos) ─────────── */}
          {step === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: '#7A90AA' }}>Asigná cada ad a uno o varios conjuntos. El mismo video puede estar en varios conjuntos.</span>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button onClick={() => setConfig(c => ({ ...c, numAdSets: Math.max(1, c.numAdSets - 1) }))} style={S.btnSm}>−</button>
                  <span style={{ color: '#E8EDF5', fontSize: '13px', fontWeight: 700, alignSelf: 'center', minWidth: '90px', textAlign: 'center' }}>{config.numAdSets} conjunto{config.numAdSets > 1 ? 's' : ''}</span>
                  <button onClick={() => setConfig(c => ({ ...c, numAdSets: c.numAdSets + 1 }))} style={S.btnSm}>+</button>
                </div>
              </div>

              {/* Ad set columns */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(config.numAdSets, 4)}, 1fr)`, gap: '10px', marginBottom: '20px' }}>
                {Array.from({ length: config.numAdSets }, (_, setIdx) => {
                  const inside = ads.filter(a => a.adSetIndices.includes(setIdx))
                  return (
                    <div key={setIdx} style={{ ...S.card, padding: '12px', minHeight: '80px' }}>
                      <div style={{ fontSize: '11px', color: '#6366F1', fontWeight: 700, marginBottom: '8px' }}>CONJUNTO {setIdx + 1}</div>
                      <div style={{ fontSize: '11px', color: '#3A5270', marginBottom: '8px' }}>{inside.length} ad{inside.length !== 1 ? 's' : ''}</div>
                      {inside.map(ad => (
                        <div key={ad.uid} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', background: '#050C1E', borderRadius: '5px', padding: '4px 7px' }}>
                          <div style={{ width: '24px', height: '24px', flexShrink: 0, borderRadius: '3px', overflow: 'hidden', background: '#0C1A2E' }}>
                            {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '10px' }}>🎬</div>}
                          </div>
                          <div style={{ fontSize: '10px', color: '#C0CFDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                        </div>
                      ))}
                      {!inside.length && <div style={{ fontSize: '10px', color: '#3A5270', textAlign: 'center', padding: '8px 0' }}>Sin ads</div>}
                    </div>
                  )
                })}
              </div>

              {/* Ad assignment */}
              <div style={S.card}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#7A90AA', marginBottom: '12px', letterSpacing: '0.1em' }}>ASIGNAR ADS</div>
                {ads.map((ad, adIdx) => (
                  <div key={ad.uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '8px 10px', background: '#050C1E', borderRadius: '8px' }}>
                    <div style={{ width: '36px', height: '36px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', background: '#0C1A2E' }}>
                      {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '14px' }}>🎬</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11px', color: '#E8EDF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                      {ad.headline && <div style={{ fontSize: '10px', color: '#6366F1', marginTop: '1px' }}>"{ad.headline}"</div>}
                    </div>
                    {/* Set toggles + duplicate */}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                      {Array.from({ length: config.numAdSets }, (_, setIdx) => {
                        const active = ad.adSetIndices.includes(setIdx)
                        return (
                          <button key={setIdx} onClick={() => toggleAdSet(adIdx, setIdx)} style={{ width: '28px', height: '28px', borderRadius: '5px', border: active ? '2px solid #6366F1' : '1px solid #1A4080', background: active ? '#6366F1' : '#050C1E', color: active ? '#fff' : '#3A5270', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                            {setIdx + 1}
                          </button>
                        )
                      })}
                      <button onClick={() => duplicateAd(adIdx)} title="Duplicar con otro copy" style={{ ...S.btnSm, marginLeft: '4px' }}>⧉</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 3: Configurar (3 tabs) ──────────────────────────────── */}
          {step === 3 && (
            <div>
              {/* Tab bar */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#080E1C', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
                {([['campaign', '📢 Campaña'], ['adset', '🎯 Conjunto de anuncios'], ['ad', '🖼 Anuncio']] as const).map(([tab, label]) => (
                  <button key={tab} onClick={() => setConfigTab(tab)} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: configTab === tab ? '#6366F1' : 'transparent', color: configTab === tab ? '#fff' : '#7A90AA', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── TAB: Campaña ── */}
              {configTab === 'campaign' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>CONFIGURACIÓN DE CAMPAÑA</div>
                      <Field label="Nombre de la campaña *" value={config.campaignName} onChange={(v: string) => setConfig(c => ({ ...c, campaignName: v }))} placeholder="Ej: Campaña Vision Complete Mayo" />
                      <Sel label="Objetivo de campaña" value={config.objective} onChange={v => setConfig(c => ({ ...c, objective: v as any }))}
                        options={[
                          { value: 'ventas',  label: '🛒 Ventas (OUTCOME_SALES)' },
                          { value: 'trafico', label: '🔗 Tráfico (OUTCOME_TRAFFIC)' },
                          { value: 'alcance', label: '📢 Alcance (OUTCOME_AWARENESS)' },
                        ]} />
                      <Sel label="Tipo de presupuesto" value={config.campaignType} onChange={v => setConfig(c => ({ ...c, campaignType: v as any }))}
                        options={[
                          { value: 'CBO', label: 'CBO — Advantage Campaign Budget (recomendado)' },
                          { value: 'ABO', label: 'ABO — Presupuesto por conjunto' },
                        ]} />
                      <div style={{ marginBottom: '14px' }}>
                        <label style={S.label}>Presupuesto diario ({config.campaignType === 'CBO' ? 'total campaña' : 'por conjunto'})</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: '#7A90AA', fontWeight: 700, fontSize: '14px' }}>$</span>
                          <input type="number" value={config.budgetAmount} onChange={e => setConfig(c => ({ ...c, budgetAmount: e.target.value }))} min="1" style={{ ...S.input, width: '140px', fontSize: '16px', fontWeight: 700 }} />
                          <span style={{ color: '#6366F1', fontSize: '13px', fontWeight: 700 }}>
                            {accounts.find(a => a.id === config.accountId)?.currency || '—'} / día
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>CUENTA & DESTINO</div>
                      <Sel label="Cuenta publicitaria" value={config.accountId} onChange={v => setConfig(c => ({ ...c, accountId: v }))}
                        options={accounts.length ? accounts.map(a => ({ value: a.id, label: `${a.name} (${a.id})` })) : [{ value: '', label: 'Cargando...' }]} />
                      <div style={{ marginBottom: '14px' }}>
                        <label style={S.label}>Fanpage / Página de Facebook</label>
                        {pages.length > 0
                          ? <select value={config.pageId} onChange={e => setConfig(c => ({ ...c, pageId: e.target.value }))} style={{ ...S.input, appearance: 'none' as any }}>
                              <option value="">— Elegir página —</option>
                              {pages.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                            </select>
                          : <>
                              <input value={config.pageId} onChange={e => setConfig(c => ({ ...c, pageId: e.target.value }))} placeholder="ID numérico de la fanpage" style={S.input} />
                              <div style={{ fontSize: '10px', color: '#F59E0B', marginTop: '4px' }}>⚠ No se encontraron páginas. Pegá el ID manualmente.</div>
                            </>
                        }
                      </div>
                      <Field label="URL de destino *" value={config.destinationUrl} onChange={(v: string) => setConfig(c => ({ ...c, destinationUrl: v }))} type="url" placeholder="https://ovitta.store/..." />
                      <Sel label="Producto (para contexto de copy)" value={config.productId} onChange={v => setConfig(c => ({ ...c, productId: v }))}
                        options={[{ value: '', label: '— Sin producto —' }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
                    </div>
                    <div style={{ ...S.card, background: '#0C1A2E' }}>
                      <div style={{ fontSize: '11px', color: '#3A5270' }}>
                        ✅ <b style={{ color: '#7A90AA' }}>Campaña:</b> {config.campaignName || '—'} · {config.objective} · ${config.budgetAmount}/día · {config.campaignType}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: Conjunto de anuncios ── */}
              {configTab === 'adset' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>OPTIMIZACIÓN & PUJA</div>
                      <Sel label="Objetivo de optimización" value={config.optimizationGoal} onChange={v => setConfig(c => ({ ...c, optimizationGoal: v as any }))}
                        options={[
                          { value: 'OFFSITE_CONVERSIONS',  label: 'Conversiones (recomendado)' },
                          { value: 'LANDING_PAGE_VIEWS',   label: 'Landing Page Views' },
                          { value: 'LINK_CLICKS',           label: 'Link Clicks' },
                          { value: 'REACH',                 label: 'Alcance' },
                          { value: 'IMPRESSIONS',           label: 'Impresiones' },
                        ]} />
                      {config.optimizationGoal === 'OFFSITE_CONVERSIONS' && (
                        <Sel label="Evento de conversión del píxel" value={config.pixelEvent} onChange={v => setConfig(c => ({ ...c, pixelEvent: v as any }))}
                          options={[
                            { value: 'Purchase',          label: '💰 Purchase (compra)' },
                            { value: 'InitiateCheckout',  label: '🛒 Initiate Checkout' },
                            { value: 'AddToCart',         label: '➕ Add to Cart' },
                            { value: 'ViewContent',       label: '👁 View Content' },
                          ]} />
                      )}
                      <Sel label="Estrategia de puja" value={config.bidStrategy} onChange={v => setConfig(c => ({ ...c, bidStrategy: v as any }))}
                        options={[
                          { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Lowest Cost — sin límite (recomendado)' },
                          { value: 'COST_CAP',                label: 'Cost Cap — límite de costo por resultado' },
                          { value: 'BID_CAP',                 label: 'Bid Cap — límite de puja máxima' },
                        ]} />
                      {config.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && (
                        <div style={{ marginBottom: '14px' }}>
                          <label style={S.label}>{config.bidStrategy === 'COST_CAP' ? 'Costo máximo por resultado ($)' : 'Puja máxima ($)'}</label>
                          <input type="number" value={config.bidAmount} onChange={e => setConfig(c => ({ ...c, bidAmount: e.target.value }))} placeholder="Ej: 5000" style={{ ...S.input, width: '140px' }} />
                        </div>
                      )}
                    </div>

                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>PROGRAMACIÓN</div>
                      <div style={{ marginBottom: '14px' }}>
                        <label style={S.label}>Fecha de inicio (opcional)</label>
                        <input type="date" value={config.startDate} onChange={e => setConfig(c => ({ ...c, startDate: e.target.value }))} style={{ ...S.input, colorScheme: 'dark' }} />
                        <div style={{ fontSize: '10px', color: '#3A5270', marginTop: '4px' }}>Sin fecha → borrador, activás manualmente</div>
                      </div>
                      <div>
                        <label style={S.label}>Hora de inicio</label>
                        <input type="time" value={config.startTime} onChange={e => setConfig(c => ({ ...c, startTime: e.target.value }))} style={{ ...S.input, colorScheme: 'dark', width: 'auto' }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>PÚBLICO OBJETIVO</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                        <div>
                          <label style={S.label}>Edad mínima</label>
                          <select value={config.ageMin} onChange={e => setConfig(c => ({ ...c, ageMin: parseInt(e.target.value) }))} style={{ ...S.input, appearance: 'none' as any }}>
                            {Array.from({ length: 48 }, (_, i) => i + 18).map(age => <option key={age} value={age}>{age}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Edad máxima</label>
                          <select value={config.ageMax} onChange={e => setConfig(c => ({ ...c, ageMax: parseInt(e.target.value) }))} style={{ ...S.input, appearance: 'none' as any }}>
                            {Array.from({ length: 47 }, (_, i) => i + 18).map(age => <option key={age} value={age}>{age}</option>)}
                            <option value={65}>65+</option>
                          </select>
                        </div>
                      </div>
                      <Sel label="Género" value={config.gender} onChange={v => setConfig(c => ({ ...c, gender: v as any }))}
                        options={[{ value: 'all', label: 'Todos los géneros' }, { value: 'female', label: 'Solo mujeres' }, { value: 'male', label: 'Solo hombres' }]} />
                      <div style={{ background: '#050C1E', borderRadius: '6px', padding: '8px 12px', fontSize: '11px', color: '#7A90AA' }}>
                        🇦🇷 País: Argentina · {config.ageMin}–{config.ageMax === 65 ? '65+' : config.ageMax} años · {config.gender === 'all' ? 'Todos' : config.gender === 'female' ? 'Mujeres' : 'Hombres'}
                      </div>
                    </div>

                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>PLACEMENTS</div>
                      <div style={{ marginBottom: '8px' }}>
                        <button onClick={() => setConfig(c => ({ ...c, placements: PLACEMENTS_OPTIONS.map(p => p.value) }))} style={{ ...S.btnSm, marginRight: '6px' }}>Todos</button>
                        <button onClick={() => setConfig(c => ({ ...c, placements: [] }))} style={S.btnSm}>Ninguno</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                        {PLACEMENTS_OPTIONS.map(pl => {
                          const active = config.placements.includes(pl.value)
                          return (
                            <button key={pl.value} onClick={() => setConfig(c => ({ ...c, placements: active ? c.placements.filter(p => p !== pl.value) : [...c.placements, pl.value] }))}
                              style={{ padding: '6px 12px', borderRadius: '6px', border: active ? '2px solid #6366F1' : '1px solid #1A4080', background: active ? '#6366F120' : '#050C1E', color: active ? '#6366F1' : '#7A90AA', fontSize: '12px', cursor: 'pointer', fontWeight: active ? 700 : 400 }}>
                              {pl.label}
                            </button>
                          )
                        })}
                      </div>
                      {config.placements.length === 0 && <div style={{ fontSize: '11px', color: '#EF4444' }}>⚠ Seleccioná al menos un placement</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: Anuncio ── */}
              {configTab === 'ad' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={S.card}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>CREATIVOS ({ads.length} ads)</div>
                    {ads.map((ad, i) => (
                      <div key={ad.uid} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', padding: '10px', background: '#050C1E', borderRadius: '8px' }}>
                        <div style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '5px', overflow: 'hidden', background: '#0C1A2E' }}>
                          {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '18px' }}>{ad.isVideo ? '🎬' : '🖼'}</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '11px', color: '#C0CFDF', marginBottom: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                          <input value={ad.headline} onChange={e => updateAd(i, 'headline', e.target.value)} maxLength={40} placeholder="Titular (máx 40)" style={{ ...S.input, fontSize: '11px', marginBottom: '4px' }} />
                          <textarea value={ad.primaryText} onChange={e => updateAd(i, 'primaryText', e.target.value)} rows={2} placeholder="Texto principal..." style={{ ...S.input, fontSize: '11px', resize: 'vertical' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={S.card}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#3A5270', letterSpacing: '0.1em', marginBottom: '14px' }}>CALL TO ACTION</div>
                      <Sel label="CTA para todos los ads" value={config.pixelEvent} onChange={v => setConfig(c => ({ ...c, pixelEvent: v as any }))}
                        options={[
                          { value: 'Purchase',         label: 'Comprar ahora' },
                          { value: 'SHOP_NOW',         label: 'Comprar' },
                          { value: 'LEARN_MORE',       label: 'Más información' },
                          { value: 'SIGN_UP',          label: 'Registrarse' },
                          { value: 'GET_OFFER',        label: 'Obtener oferta' },
                          { value: 'ORDER_NOW',        label: 'Pedir ahora' },
                        ]} />
                    </div>
                    <div style={{ ...S.card, background: '#0C1A2E' }}>
                      <div style={{ fontSize: '11px', color: '#7A90AA', lineHeight: 1.6 }}>
                        <div>📢 <b>Campaña:</b> {config.campaignName || '—'}</div>
                        <div>🎯 <b>Optimización:</b> {config.optimizationGoal}</div>
                        <div>💰 <b>Puja:</b> {config.bidStrategy === 'LOWEST_COST_WITHOUT_CAP' ? 'Lowest Cost' : `${config.bidStrategy} $${config.bidAmount}`}</div>
                        <div>👥 <b>Público:</b> {config.ageMin}–{config.ageMax === 65 ? '65+' : config.ageMax} · {config.gender}</div>
                        <div>📍 <b>Placements:</b> {config.placements.join(', ') || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <button onClick={() => setConfigTab(t => t === 'adset' ? 'campaign' : t === 'ad' ? 'adset' : 'campaign')} disabled={configTab === 'campaign'} style={{ ...S.btnSec, opacity: configTab === 'campaign' ? 0.3 : 1 }}>← Anterior</button>
                <button onClick={() => setConfigTab(t => t === 'campaign' ? 'adset' : t === 'adset' ? 'ad' : 'ad')} disabled={configTab === 'ad'} style={{ ...S.btnPri, opacity: configTab === 'ad' ? 0.3 : 1 }}>Siguiente →</button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Revisar ───────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <div style={{ ...S.card, marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF5', marginBottom: '14px' }}>Resumen</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Campaña',     value: config.campaignName },
                    { label: 'Tipo',        value: config.campaignType },
                    { label: 'Objetivo',    value: config.objective },
                    { label: 'Presupuesto', value: `$${config.budgetAmount}/día` },
                    { label: 'Bid',         value: config.bidStrategy === 'LOWEST_COST_WITHOUT_CAP' ? 'Lowest Cost' : `${config.bidStrategy} $${config.bidAmount}` },
                    { label: 'Optimización',value: config.optimizationGoal },
                    { label: 'Evento',      value: config.pixelEvent },
                    { label: 'Placements',  value: config.placements.join(', ') },
                    { label: 'Público',     value: `${config.ageMin}-${config.ageMax} · ${config.gender}` },
                    { label: 'Conjuntos',   value: String(config.numAdSets) },
                    { label: 'Total ads',   value: String(ads.length) },
                    { label: 'Inicio',      value: config.startDate ? `${config.startDate} ${config.startTime}` : 'Manual' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: '#7A90AA' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#E8EDF5', fontWeight: 600, marginTop: '2px' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {Array.from({ length: config.numAdSets }, (_, setIdx) => {
                const inside = ads.filter(a => a.adSetIndices.includes(setIdx))
                return (
                  <div key={setIdx} style={{ ...S.card, marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366F1', marginBottom: '10px' }}>Conjunto {setIdx + 1} — {adSetName(setIdx)}</div>
                    {inside.length === 0 && <div style={{ fontSize: '11px', color: '#EF4444' }}>⚠ Conjunto vacío — no se va a crear</div>}
                    {inside.map(ad => (
                      <div key={ad.uid} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '7px', padding: '7px', background: '#050C1E', borderRadius: '6px' }}>
                        <div style={{ width: '40px', height: '40px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', background: '#0C1A2E' }}>
                          {ad.thumbnailLink ? <img src={ad.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '16px' }}>🎬</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: '#E8EDF5', fontWeight: 600 }}>{ad.fileName.replace(/\.[^.]+$/, '')}</div>
                          {ad.headline && <div style={{ fontSize: '11px', color: '#C0CFDF', marginTop: '1px' }}>"{ad.headline}"</div>}
                          {!ad.headline && <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '1px' }}>⚠ Sin titular</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── STEP 5: Crear ─────────────────────────────────────────────── */}
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
                    <button onClick={() => { setStep(0); setSelectedFiles(new Set()); setAds([]); loadDrive() }} style={S.btnSec}>Nueva campaña</button>
                  </div>
                )}
                {progress.status === 'error' && <button onClick={() => setStep(4)} style={S.btnSec}>← Volver</button>}
              </div>
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────────────── */}
          {step < 5 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <div>
                {step > 0 && <button onClick={() => setStep(s => s - 1)} style={S.btnSec}>← Anterior</button>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {step === 0 && totalSel === 0 && (
                  <span style={{ fontSize: '13px', color: '#3A5270' }}>Seleccioná al menos un archivo</span>
                )}
                {step === 1 && loadingCount === 0 && (
                  <button onClick={() => setStep(2)} style={S.btnPri}>Organizar →</button>
                )}
                {step === 1 && loadingCount > 0 && (
                  <span style={{ fontSize: '13px', color: '#6366F1' }}>⏳ Esperando análisis...</span>
                )}
                {step === 2 && <button onClick={() => setStep(3)} style={S.btnPri}>Configurar →</button>}
                {step === 3 && (
                  <button onClick={() => {
                    if (!config.campaignName || !config.accountId || !config.pageId || !config.destinationUrl) {
                      alert('Completá campaña, cuenta, fanpage y URL destino')
                      return
                    }
                    if (config.placements.length === 0) { alert('Seleccioná al menos un placement'); return }
                    setStep(4)
                  }} style={S.btnPri}>Revisar →</button>
                )}
                {step === 4 && <button onClick={createCampaign} style={S.btnGreen}>✓ Crear como borrador</button>}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
