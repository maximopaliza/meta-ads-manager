import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { id: _id, ...fields } = body

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({ ...fields, active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('products')
    .update({ active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
