import pb from '@/lib/pocketbase/client'
import type { ChargeRecord, ChargeFormData } from '@/types'
import { generateChargeNumber } from '@/lib/formatters'

export const chargesService = {
  async getAll(): Promise<ChargeRecord[]> {
    const records = await pb.collection('charges').getFullList<ChargeRecord>({
      sort: '-due_date',
      expand: 'client',
      requestKey: null,
    })
    return records
  },

  async getById(id: string): Promise<ChargeRecord> {
    return await pb.collection('charges').getOne<ChargeRecord>(id, {
      expand: 'client',
      requestKey: null,
    })
  },

  async create(data: ChargeFormData): Promise<ChargeRecord> {
    const user = pb.authStore.record
    if (!user) throw new Error('Usuário não autenticado')

    const number = generateChargeNumber()

    return await pb.collection('charges').create<ChargeRecord>(
      {
        ...data,
        number,
        owner: user.id,
      },
      {
        expand: 'client',
      },
    )
  },

  async update(
    id: string,
    data: Partial<ChargeFormData> & { paid_at?: string | null },
  ): Promise<ChargeRecord> {
    return await pb.collection('charges').update<ChargeRecord>(id, data, {
      expand: 'client',
    })
  },

  async markAsPaid(id: string): Promise<ChargeRecord> {
    const nowIso = new Date().toISOString()
    return await pb.collection('charges').update<ChargeRecord>(
      id,
      {
        status: 'paid',
        paid_at: nowIso,
      },
      {
        expand: 'client',
      },
    )
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('charges').delete(id)
  },
}
