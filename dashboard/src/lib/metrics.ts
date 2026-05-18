import { supabaseAdmin } from './supabase'

export const CPA_BREAKEVEN = 15
export const CPA_TARGET = 7

export async function getLatestDate(): Promise<string> {
  const res = await supabaseAdmin
    .from('metrics').select('date').eq('object_type', 'campaign')
    .order('date', { ascending: false }).limit(1)
  return res.data?.[0]?.date ?? new Date().toISOString().split('T')[0]
}

export function calcDerived(m: any) {
  const lc = m.link_clicks || m.clicks || 0
  return {
    ...m,
    cpa_calc: m.purchases > 0 ? m.spend / m.purchases : null,
    ctr_calc: m.impressions > 0 && lc > 0 ? lc / m.impressions * 100 : null,
    cpc_calc: m.cpc || (lc > 0 ? m.spend / lc : null),
    cost_atc: m.add_to_cart > 0 ? m.spend / m.add_to_cart : null,
  }
}

export function sortByPerformance(rows: any[]) {
  // Active with spend first, then by spend desc
  return [...rows].sort((a, b) => {
    const aSpend = a.todayMetrics?.spend ?? a.m?.spend ?? 0
    const bSpend = b.todayMetrics?.spend ?? b.m?.spend ?? 0
    const aActive = a.status === 'ACTIVE' ? 1 : 0
    const bActive = b.status === 'ACTIVE' ? 1 : 0
    if (aActive !== bActive) return bActive - aActive
    return bSpend - aSpend
  })
}

export function cpaColor(v: number | null) {
  if (!v) return '#64748B'
  if (v <= CPA_TARGET) return '#22C55E'
  if (v <= CPA_BREAKEVEN) return '#F59E0B'
  return '#EF4444'
}

export function roasColor(v: number | null) {
  if (!v) return '#64748B'
  if (v >= 3.5) return '#22C55E'
  if (v >= 1.5) return '#F59E0B'
  return '#EF4444'
}

export function ctrColor(v: number | null) {
  if (!v) return '#64748B'
  if (v >= 2.5) return '#22C55E'
  if (v >= 0.8) return '#F1F5F9'
  return '#EF4444'
}
