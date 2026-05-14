export interface AdAccount {
  id: string
  name: string
  currency: string
  timezone: string
}

export interface Campaign {
  id: string
  account_id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  objective: string | null
  daily_budget: number | null
  lifetime_budget: number | null
  created_at: string
  updated_at: string
}

export interface AdSet {
  id: string
  campaign_id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  daily_budget: number | null
  targeting: Record<string, unknown> | null
  updated_at: string
}

export interface Ad {
  id: string
  ad_set_id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  creative_id: string | null
  updated_at: string
}

export interface Metrics {
  id: string
  object_id: string
  object_type: 'campaign' | 'ad_set' | 'ad'
  date: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  purchase_value: number
  cpc: number | null
  cpm: number | null
  roas: number | null
  frequency: number | null
  created_at: string
}

export interface Alert {
  id: string
  type: 'anomaly' | 'recommendation' | 'milestone'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  object_id: string | null
  sent_to_telegram: boolean
  created_at: string
}

export interface CampaignWithMetrics extends Campaign {
  todayMetrics: {
    spend: number
    roas: number | null
    purchases: number
    cpc: number | null
    impressions: number
  }
  trend: 'up' | 'down' | 'neutral'
}

export interface DailyMetric {
  date: string
  spend: number
  roas: number | null
  purchases: number
  impressions: number
  clicks: number
}
