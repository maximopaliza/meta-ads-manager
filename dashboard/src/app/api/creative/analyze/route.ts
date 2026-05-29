import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFile } from '@/lib/drive'
import { analyzeCreative } from '@/lib/gemini'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — large video upload + Gemini processing

const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 MB — skip larger files

// POST { fileId, fileName, mimeType, productId? }
export async function POST(req: NextRequest) {
  const { fileId, fileName, mimeType, productId } = await req.json()

  if (!fileId || !mimeType) {
    return NextResponse.json({ error: 'fileId y mimeType requeridos' }, { status: 400 })
  }

  // ── 1. Check cache ─────────────────────────────────────────────────────────
  const { data: cached } = await supabaseAdmin
    .from('video_analysis')
    .select('*')
    .eq('drive_file_id', fileId)
    .single()

  if (cached) {
    return NextResponse.json({
      cached: true,
      angle: cached.angle,
      analysis: cached.analysis,
      primary_text: cached.primary_text,
      headline: cached.headline,
      audience_summary: cached.audience_summary,
      targeting: cached.targeting,
    })
  }

  // ── 2. Load product context ────────────────────────────────────────────────
  let productContext = 'Sin datos de producto específico.'
  if (productId) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (product) {
      const benefits   = Array.isArray(product.benefits) ? product.benefits.join(', ') : ''
      const audiences  = Array.isArray(product.audiences) ? product.audiences.join(', ') : ''
      const testimonials = Array.isArray(product.testimonials) ? product.testimonials.slice(0, 3).join(' | ') : ''
      productContext = `
Producto: ${product.name} — ${product.brand}
Tagline: ${product.tagline || ''}
Precio: ${product.price || ''}
Condiciones: ${product.conditions || ''}
URL destino: ${product.url || ''}
Beneficios: ${benefits}
Audiencias: ${audiences}
Reseñas: ${product.reviews || ''}
Testimonios: ${testimonials}
`.trim()
    }
  }

  // ── 3. Download from Drive ─────────────────────────────────────────────────
  let dlResult: { bytes: Buffer; mimeType: string; name: string }
  try {
    dlResult = await downloadFile(fileId)
  } catch (err: any) {
    console.error('[Analyze] Drive download error:', err)
    return NextResponse.json({ error: `Error descargando de Drive: ${err.message}` }, { status: 502 })
  }

  if (dlResult.bytes.length > MAX_FILE_BYTES) {
    return NextResponse.json({
      error: `Archivo demasiado grande (${(dlResult.bytes.length / 1024 / 1024).toFixed(0)} MB). Máximo 200 MB. Ingresá el copy manualmente.`,
    }, { status: 413 })
  }

  // ── 4. Call Gemini ─────────────────────────────────────────────────────────
  let analysis
  try {
    analysis = await analyzeCreative(
      dlResult.bytes,
      dlResult.mimeType || mimeType,
      fileName || dlResult.name,
      productContext,
    )
  } catch (err: any) {
    console.error('[Analyze] Gemini error:', err)
    return NextResponse.json({ error: `Error en análisis IA: ${err.message}` }, { status: 502 })
  }

  // ── 5. Cache result in Supabase ────────────────────────────────────────────
  await supabaseAdmin.from('video_analysis').upsert({
    drive_file_id:    fileId,
    file_name:        fileName || dlResult.name,
    angle:            analysis.angle,
    analysis:         analysis.angle_description,
    primary_text:     analysis.primary_text,
    headline:         analysis.headline,
    audience_summary: analysis.audience_summary,
    targeting:        analysis.targeting,
    full_response:    analysis,
  }, { onConflict: 'drive_file_id' })

  return NextResponse.json({
    cached: false,
    angle:            analysis.angle,
    analysis:         analysis.angle_description,
    primary_text:     analysis.primary_text,
    headline:         analysis.headline,
    audience_summary: analysis.audience_summary,
    targeting:        analysis.targeting,
  })
}
