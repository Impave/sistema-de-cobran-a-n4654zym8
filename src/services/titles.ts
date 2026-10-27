import pb from '@/lib/pocketbase/client'
import type { TitleRecord, TitlesPaginatedResponse } from '@/types'

export interface GetTitlesParams {
  page?: number
  perPage?: number
  search?: string
  situacao?: string
  sort?: string
}

export const titlesService = {
  async getList(params?: GetTitlesParams): Promise<TitlesPaginatedResponse> {
    const page = params?.page && params.page > 0 ? params.page : 1
    const perPage = params?.perPage && params.perPage > 0 ? params.perPage : 25
    const sort = params?.sort || '-created'

    const conditions: string[] = []

    const q = params?.search?.trim()
    if (q) {
      const safeQ = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const searchOrs: string[] = [
        `numero ~ "${safeQ}"`,
        `cliente_fornecedor ~ "${safeQ}"`,
        `nosso_numero_formatado ~ "${safeQ}"`,
        `situacao ~ "${safeQ}"`,
        `forma_pagamento ~ "${safeQ}"`,
        `portador ~ "${safeQ}"`,
        `vendedor ~ "${safeQ}"`,
      ]

      const cleanDigits = q.replace(/\D/g, '')
      if (cleanDigits) {
        searchOrs.push(`numero = "${cleanDigits}"`)
        searchOrs.push(`nosso_numero = ${cleanDigits}`)
      }

      conditions.push(`(${searchOrs.join(' || ')})`)
    }

    if (params?.situacao && params.situacao !== 'all') {
      const safeSit = params.situacao.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      conditions.push(`situacao ~ "${safeSit}"`)
    }

    const filter = conditions.length > 0 ? conditions.join(' && ') : undefined

    const res = await pb.collection('titles').getList<TitleRecord>(page, perPage, {
      sort,
      filter,
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

  async getById(id: string): Promise<TitleRecord> {
    return await pb.collection('titles').getOne<TitleRecord>(id, {
      requestKey: null,
    })
  },

  async count(): Promise<number> {
    const res = await pb.collection('titles').getList<TitleRecord>(1, 1, {
      fields: 'id',
      requestKey: null,
    })
    return res.totalItems
  },
}
