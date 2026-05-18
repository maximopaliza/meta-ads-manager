import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n)
}

export function formatPercent(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

export function formatROAS(roas: number): string {
  return `${roas.toFixed(2)}x`
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export function statusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'text-green-400'
    case 'PAUSED': return 'text-yellow-400'
    default: return 'text-red-400'
  }
}

export function statusEmoji(status: string): string {
  switch (status) {
    case 'ACTIVE': return '🟢'
    case 'PAUSED': return '🟡'
    default: return '🔴'
  }
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'info': return 'border-indigo-500/30 bg-indigo-500/10'
    case 'warning': return 'border-yellow-500/30 bg-yellow-500/10'
    case 'critical': return 'border-red-500/30 bg-red-500/10'
    default: return 'border-border bg-surface'
  }
}

export function severityIcon(severity: string): string {
  switch (severity) {
    case 'info': return '💡'
    case 'warning': return '⚠️'
    case 'critical': return '🔴'
    default: return '📢'
  }
}
