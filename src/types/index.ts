export type ChargeStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'

export type UserRole = 'admin' | 'operador'

export interface UserProfile {
  id: string
  email: string
  name?: string
  avatar?: string
  role?: UserRole
  active?: boolean
  verified?: boolean
  created?: string
  updated?: string
}

export interface UserFormData {
  name: string
  email: string
  password?: string
  passwordConfirm?: string
  role: UserRole
  active?: boolean
}

export interface UsersPaginatedResponse {
  items: UserProfile[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export interface ClientRecord {
  id: string
  owner: string
  cod_cliente?: string
  nome_cliente?: string
  razao_social?: string
  cnpj_cpf: string
  contato1?: string
  contato2?: string
  email1?: string
  email2?: string
  email3?: string
  estado?: string
  cidade?: string
  bairro?: string
  created: string
  updated: string
  // aliases de retrocompatibilidade para componentes legados (opcionais)
  erp_code?: string
  name?: string
  email?: string
  document?: string
  phone?: string
  address?: string
  city?: string
  state?: string
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
  status: 'pending' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'error' | 'failed'
  currentStep: string
  count: number
  imported: number
  createdCount: number
  updatedCount: number
  percent: number
  error?: string
  syncDate?: string
  syncStartDate?: string
  totalDays?: number
  processedDays?: number
  currentDayDate?: string
  syncMode?: 'single_date' | 'day_by_day' | string
  isFullSync?: boolean
  nextIncrementalDate?: string
  yesterdayDate?: string
  todayDate?: string
  startedAt?: string
  finishedAt?: string
  created?: string
  updated?: string
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
  cod_cliente?: string
  nome_cliente?: string
  razao_social?: string
  cnpj_cpf: string
  contato1?: string
  contato2?: string
  email1?: string
  email2?: string
  email3?: string
  estado?: string
  cidade?: string
  bairro?: string
  // aliases opcionais
  erp_code?: string
}

export interface ChargeFormData {
  client: string
  description: string
  amount: number
  due_date: string
  status: ChargeStatus
}
