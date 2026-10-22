import pb from '@/lib/pocketbase/client'
import type { ClientRecord, ClientFormData, FlexSmartSyncResult } from '@/types'

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

  async syncFlexSmart(): Promise<FlexSmartSyncResult> {
    return await pb.send<FlexSmartSyncResult>('/backend/v1/flexsmart/sync', {
      method: 'POST',
      requestKey: null,
    })
  },
}
