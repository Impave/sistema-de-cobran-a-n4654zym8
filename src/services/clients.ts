import pb from '@/lib/pocketbase/client'
import type {
  ClientRecord,
  ClientFormData,
  FlexSmartSyncResult,
  FlexSmartSyncStatus,
  FlexSmartCancelSyncResult,
} from '@/types'

export interface ClientsPaginatedResponse {
  items: ClientRecord[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export const clientsService = {
  async getAll(): Promise<ClientRecord[]> {
    const records = await pb.collection('clients').getFullList<ClientRecord>({
      sort: '-created',
      requestKey: null,
    })
    return records
  },

  async getList(params?: {
    page?: number
    perPage?: number
    search?: string
    sort?: string
  }): Promise<ClientsPaginatedResponse> {
    const page = params?.page && params.page > 0 ? params.page : 1
    const perPage = params?.perPage && params.perPage > 0 ? params.perPage : 20
    const sort = params?.sort || '-created'

    let filter = ''
    const q = params?.search?.trim()
    if (q) {
      const cleanDigits = q.replace(/\D/g, '')
      // Escapa aspas para segurança no PocketBase filter
      const safeQ = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const conditions: string[] = [
        `nome_cliente ~ "${safeQ}"`,
        `razao_social ~ "${safeQ}"`,
        `cod_cliente ~ "${safeQ}"`,
        `cidade ~ "${safeQ}"`,
        `bairro ~ "${safeQ}"`,
        `estado ~ "${safeQ}"`,
        `email1 ~ "${safeQ}"`,
        `email2 ~ "${safeQ}"`,
        `email3 ~ "${safeQ}"`,
      ]
      if (cleanDigits) {
        conditions.push(`cnpj_cpf ~ "${cleanDigits}"`)
        conditions.push(`cod_cliente = "${cleanDigits}"`)
        conditions.push(`contato1 ~ "${cleanDigits}"`)
        conditions.push(`contato2 ~ "${cleanDigits}"`)
      }
      filter = conditions.join(' || ')
    }

    const res = await pb.collection('clients').getList<ClientRecord>(page, perPage, {
      sort,
      filter: filter || undefined,
      requestKey: null,
    })

    return {
      items: res.items,
      page: res.page,
      perPage: res.perPage,
      totalItems: res.totalItems,
      totalPages: res.totalPages,
    }
  },

  async count(): Promise<number> {
    const res = await pb.collection('clients').getList<ClientRecord>(1, 1, {
      fields: 'id',
      requestKey: null,
    })
    return res.totalItems
  },

  async getById(id: string): Promise<ClientRecord> {
    return await pb.collection('clients').getOne<ClientRecord>(id, {
      requestKey: null,
    })
  },

  async create(data: ClientFormData): Promise<ClientRecord> {
    const user = pb.authStore.record
    if (!user) throw new Error('Usuário não autenticado')

    const cleanCnpjCpf = data.cnpj_cpf ? data.cnpj_cpf.replace(/\D/g, '') : ''
    const cleanContato1 = data.contato1 ? data.contato1.replace(/\D/g, '') : ''
    const cleanContato2 = data.contato2 ? data.contato2.replace(/\D/g, '') : ''
    const cleanCodCliente = (data.cod_cliente || data.erp_code || '').trim()

    return await pb.collection('clients').create<ClientRecord>({
      owner: user.id,
      cod_cliente: cleanCodCliente || '',
      nome_cliente: data.nome_cliente ? data.nome_cliente.trim() : '',
      razao_social: data.razao_social ? data.razao_social.trim() : '',
      cnpj_cpf: cleanCnpjCpf || '',
      contato1: cleanContato1 || '',
      contato2: cleanContato2 || '',
      email1: data.email1 ? data.email1.trim() : '',
      email2: data.email2 ? data.email2.trim() : '',
      email3: data.email3 ? data.email3.trim() : '',
      estado: data.estado ? data.estado.trim().toUpperCase() : '',
      cidade: data.cidade ? data.cidade.trim() : '',
      bairro: data.bairro ? data.bairro.trim() : '',
    })
  },

  async update(id: string, data: Partial<ClientFormData>): Promise<ClientRecord> {
    const payload = { ...data }
    if (payload.cnpj_cpf !== undefined) {
      payload.cnpj_cpf = payload.cnpj_cpf ? payload.cnpj_cpf.replace(/\D/g, '') : ''
    }
    if (payload.contato1 !== undefined) {
      payload.contato1 = payload.contato1 ? payload.contato1.replace(/\D/g, '') : ''
    }
    if (payload.contato2 !== undefined) {
      payload.contato2 = payload.contato2 ? payload.contato2.replace(/\D/g, '') : ''
    }
    if (payload.erp_code !== undefined && payload.cod_cliente === undefined) {
      payload.cod_cliente = payload.erp_code ? payload.erp_code.trim() : ''
    }
    if (payload.cod_cliente !== undefined) {
      payload.cod_cliente = payload.cod_cliente ? payload.cod_cliente.trim() : ''
    }
    delete payload.erp_code
    if (payload.nome_cliente !== undefined) {
      payload.nome_cliente = payload.nome_cliente ? payload.nome_cliente.trim() : ''
    }
    if (payload.razao_social !== undefined) {
      payload.razao_social = payload.razao_social ? payload.razao_social.trim() : ''
    }
    if (payload.email1 !== undefined) {
      payload.email1 = payload.email1 ? payload.email1.trim() : ''
    }
    if (payload.email2 !== undefined) {
      payload.email2 = payload.email2 ? payload.email2.trim() : ''
    }
    if (payload.email3 !== undefined) {
      payload.email3 = payload.email3 ? payload.email3.trim() : ''
    }
    if (payload.estado !== undefined) {
      payload.estado = payload.estado ? payload.estado.trim().toUpperCase() : ''
    }
    if (payload.cidade !== undefined) {
      payload.cidade = payload.cidade ? payload.cidade.trim() : ''
    }
    if (payload.bairro !== undefined) {
      payload.bairro = payload.bairro ? payload.bairro.trim() : ''
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
