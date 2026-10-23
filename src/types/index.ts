export type ChargeStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'

export interface UserProfile {
  id: string
  email: string
  name?: string
  avatar?: string
  verified?: boolean
  created?: string
  updated?: string
}

export interface ClientRecord {
  id: string
  owner: string
  name: string
  email?: string
  document?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  erp_code?: string
  created: string
  updated: string
  // expand
  expand?: {
    owner?: UserProfile
    'charges(client)'?: ChargeRecord[]
  }
  // client-side computed count
  chargesCount?: number
}

export interface FlexSmartSyncResult {
  totalErp: number
  created: number
  updated: number
  errors: number
  success: boolean
  syncId?: string
}

export interface FlexSmartSyncStatus {
  id: string
  status: 'pending' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'error'
  currentStep: string
  count: number
  imported: number
  createdCount: number
  updatedCount: number
  percent: number
  error?: string
  startedAt?: string
  finishedAt?: string
  created?: string
}

export interface FlexSmartCancelSyncResult {
  success: boolean
  status: string
  message: string
}

export interface ChargeRecord {
  id: string
  owner: string
  client: string
  description: string
  number: string
  amount: number
  due_date: string
  paid_at?: string
  status: ChargeStatus
  created: string
  updated: string
  // expand
  expand?: {
    client?: ClientRecord
    owner?: UserProfile
  }
}

export interface ClientFormData {
  name: string
  email?: string
  document?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  erp_code?: string
}

export interface ChargeFormData {
  client: string
  description: string
  amount: number
  due_date: string
  status: ChargeStatus
}
