import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFile } from '@/lib/drive'
import { analyzeCreative } from '@/lib/gemini'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — large video upload + Gemini processing

const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 MB — skip larger files

/**
 * POST { fileId, fileName, mimeType, isVideo, thumbnailLink?, productId? }
 *
 * Strategy:
 * - Videos: download thumbnail only (~100 KB JPEG) → much faster, no quota issues
 * - Images: download full file (already small)
 * - Always check Supabase cache first
 */
export async function POST(req: NextRequest) {
  const { fileId, fileName, mimeType, isVideo, thumbnailLink, productId } = await req.json()

  if (!fileId || !mimeType) {
    return NextResponse.json({ error: 'fileId y mimeType requeridos' }, { status: 400 })
  }

  // ── 1. Check cache ─────────────────────────────────────────────────────────
  const { data: cached } = await supabaseAdmin
    .from('video_analysis')
    .select('*')
    .eq('drive_file_id', fileId)
    .single()

  if (cached?.headline) {
    return NextResponse.json({
      cached: true,
      angle:            cached.angle,
      analysis:         cached.analysis,
      primary_text:     cached.primary_text,
      headline:         cached.headline,
      audience_summary: cached.audience_summary,
      targeting:        cached.targeting,
    })
  }

  // ── 2. Load product context ────────────────────────────────────────────────
  let productContext = 'Sin datos de producto específico.'
  if (productId) {
    const { data: product } = await supabaseAdmin
      .from('products').select('*').eq('id', productId).single()
    if (product) {
      const benefits     = Array.isArray(product.benefits)     ? product.benefits.join(', ')                            : ''
      const audiences    = Array.isArray(product.audiences)    ? product.audiences.join(', ')                           : ''
      const testimonials = Array.isArray(product.testimonials) ? product.testimonials.slice(0, 3).join(' | ')           : ''
      productContext = [
        `Producto: ${product.name} — ${product.brand}`,
        product.tagline    && `Tagline: ${product.tagline}`,
        product.price      && `Precio: ${product.price}`,
        product.conditions && `Condiciones: ${product.conditions}`,
        product.url        && `URL destino: ${product.url}`,
        benefits           && `Beneficios: ${benefits}`,
        audiences          && `Audiencias: ${audiences}`,
        product.reviews    && `Reseñas: ${product.reviews}`,
        testimonials       && `Testimonios: ${testimonials}`,
      ].filter(Boolean).join('\n')
    }
  }

  // ── 3. Get image bytes ─────────────────────────────────────────────────────
  // For videos: use thumbnail (~100 KB) instead of the full file (40-100 MB)
  // This avoids Gemini quota issues and is much faster
  let imageBytes: Buffer
  let imageMime = 'image/jpeg'
  let imageLabel = fileName

  if (isVideo && thumbnailLink) {
    // Download thumbnail with Drive auth token
    try {
      const { getDriveToken } = await import('@/lib/drive')
      const token    = await getDriveToken()
      const thumbRes = await fetch(thumbnailLink, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!thumbRes.ok) throw new Error(`Thumbnail fetch ${thumbRes.status}`)
      imageBytes = Buffer.from(await thumbRes.arrayBuffer())
      imageMime  = thumbRes.headers.get('content-type') || 'image/jpeg'
      imageLabel = `thumbnail de ${fileName}`
      console.log(`[Analyze] Using thumbnail (${(imageBytes.length / 1024).toFixed(0)} KB) for ${fileName}`)
    } catch (thumbErr: any) {
      console.warn('[Analyze] Thumbnail failed, falling back to full download:', thumbErr.message)
      // Fallback: download full file
      try {
        const dl = await downloadFile(fileId)
        imageBytes = dl.bytes
        imageMime  = dl.mimeType || mimeType
      } catch (err: any) {
        return NextResponse.json({ error: `Error descargando: ${err.message}` }, { status: 502 })
      }
    }
  } else {
    // Images: download directly (they're small)
    try {
      const dl = await downloadFile(fileId)
      imageBytes = dl.bytes
      imageMime  = dl.mimeType || mimeType
    } catch (err: any) {
      return NextResponse.json({ error: `Error descargando: ${err.message}` }, { status: 502 })
    }
  }

  if (imageBytes!.length > MAX_FILE_BYTES) {
    return NextResponse.json({
      error: `Archivo demasiado grande (${(imageBytes!.length / 1024 / 1024).toFixed(0)} MB). Usá el thumbnail.`,
    }, { status: 413 })
  }

  // ── 4. Call Gemini (always inline — thumbnails are < 1 MB) ────────────────
  let analysis
  try {
    analysis = await analyzeCreative(imageBytes!, imageMime, imageLabel, productContext)
  } catch (err: any) {
    console.error('[Analyze] Gemini error:', err)
    return NextResponse.json({ error: `Error en análisis IA: ${err.message}` }, { status: 502 })
  }

  // ── 5. Cache in Supabase ───────────────────────────────────────────────────
  await supabaseAdmin.from('video_analysis').upsert({
    drive_file_id:    fileId,
    file_name:        fileName,
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
