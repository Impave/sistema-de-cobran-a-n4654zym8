import pb from '@/lib/pocketbase/client'
import type {
  ClientRecord,
  ClientFormData,
  FlexSmartSyncResult,
  FlexSmartSyncStatus,
  FlexSmartCancelSyncResult,
} from '@/types'

export const clientsService = {
  async getAll(): Promise<ClientRecord[]> {
    const records = await pb.collection('clients').getFullList<ClientRecord>({
      sort: '-created',
      requestKey: null,
    })
    return records
  },

  async getById(id: string): Promise<ClientRecord> {
    return await pb.collection('clients').getOne<ClientRecord>(id, {
      requestKey: null,
    })
  },

  async create(data: ClientFormData): Promise<ClientRecord> {
    const user = pb.authStore.record
    if (!user) throw new Error('Usuário não autenticado')

    // Remove formatação do documento
    const cleanDoc = data.document ? data.document.replace(/\D/g, '') : ''
    const cleanPhone = data.phone ? data.phone.replace(/\D/g, '') : ''

    return await pb.collection('clients').create<ClientRecord>({
      ...data,
      owner: user.id,
      document: cleanDoc,
      phone: cleanPhone,
    })
  },

  async update(id: string, data: Partial<ClientFormData>): Promise<ClientRecord> {
    const payload = { ...data }
    if (payload.document !== undefined) {
      payload.document = payload.document.replace(/\D/g, '')
    }
    if (payload.phone !== undefined) {
      payload.phone = payload.phone.replace(/\D/g, '')
    }
    return await pb.collection('clients').update<ClientRecord>(id, payload)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('clients').delete(id)
  },

  async startFlexSmartSync(options?: {
    date?: string
    startDate?: string
    fullSync?: boolean
    mode?: 'single_date' | 'day_by_day'
  }): Promise<{
    success: boolean
    syncId: string
    status: string
    targetDate?: string
    syncStartDate?: string
    totalDays?: number
    syncMode?: string
    isFullSync?: boolean
    message: string
  }> {
    const res = await pb.send<{
      success: boolean
      syncId: string
      status: string
      targetDate?: string
      syncStartDate?: string
      totalDays?: number
      syncMode?: string
      isFullSync?: boolean
      message: string
    }>('/backend/v1/flexsmart/start-sync', {
      method: 'POST',
      body: options || {},
    })
    return res
  },

  async stepFlexSmartSync(syncId: string): Promise<{
    success: boolean
    status: string
    processedDays?: number
    totalDays?: number
    currentDayDate?: string
    done?: boolean
    error?: string
  }> {
    const res = await pb.send<{
      success: boolean
      status: string
      processedDays?: number
      totalDays?: number
      currentDayDate?: string
      done?: boolean
      error?: string
    }>(`/backend/v1/flexsmart/step-sync/${syncId}`, {
      method: 'POST',
    })
    return res
  },

  async cancelFlexSmartSync(syncId: string): Promise<FlexSmartCancelSyncResult> {
    const res = await pb.send<FlexSmartCancelSyncResult>(
      `/backend/v1/flexsmart/cancel-sync/${syncId}`,
      {
        method: 'POST',
      },
    )
    return res
  },

  async getFlexSmartSyncStatus(syncId: string): Promise<FlexSmartSyncStatus> {
    const res = await pb.send<FlexSmartSyncStatus>(`/backend/v1/flexsmart/sync-status/${syncId}`, {
      method: 'GET',
    })
    return res
  },

  async getLastFlexSmartSync(): Promise<{ lastSync: FlexSmartSyncStatus | null }> {
    const res = await pb.send<{ lastSync: FlexSmartSyncStatus | null }>(
      '/backend/v1/flexsmart/last-sync',
      {
        method: 'GET',
      },
    )
    return res
  },

  async testFlexSmartByDate(data?: string): Promise<Record<string, unknown>> {
    const query = data ? `?data=${encodeURIComponent(data)}` : ''
    const res = await pb.send<Record<string, unknown>>(
      `/backend/v1/flexsmart/test-by-date${query}`,
      {
        method: 'GET',
      },
    )
    return res
  },

  async syncFlexSmart(): Promise<FlexSmartSyncResult> {
    const res = await pb.send<FlexSmartSyncResult>('/backend/v1/flexsmart/sync', {
      method: 'POST',
    })
    return res
  },
}
