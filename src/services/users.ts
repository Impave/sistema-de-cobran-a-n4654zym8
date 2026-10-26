import pb from '@/lib/pocketbase/client'
import type { UserProfile, UserFormData, UsersPaginatedResponse } from '@/types'

export const usersService = {
  async getList(params?: {
    page?: number
    perPage?: number
    search?: string
    sort?: string
  }): Promise<UsersPaginatedResponse> {
    const page = params?.page && params.page > 0 ? params.page : 1
    const perPage = params?.perPage && params.perPage > 0 ? params.perPage : 20
    const sort = params?.sort || '-created'

    let filter = ''
    const q = params?.search?.trim()
    if (q) {
      const safeQ = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      filter = `name ~ "${safeQ}" || email ~ "${safeQ}"`
    }

    const res = await pb.collection('users').getList(page, perPage, {
      sort,
      filter: filter || undefined,
      requestKey: null,
    })

    const items: UserProfile[] = res.items.map((r) => ({
      id: r.id,
      email: r.email,
      name: (r.name as string) || (r.email ? r.email.split('@')[0] : 'Usuário'),
      avatar: r.avatar as string | undefined,
      role: (r.role as 'admin' | 'operador') || 'operador',
      active: r.active !== false,
      verified: r.verified as boolean | undefined,
      created: r.created,
      updated: r.updated,
    }))

    return {
      items,
      page: res.page,
      perPage: res.perPage,
      totalItems: res.totalItems,
      totalPages: res.totalPages,
    }
  },

  async create(data: UserFormData): Promise<UserProfile> {
    const res = await pb.send<{
      success: boolean
      message: string
      user: UserProfile
    }>('/backend/v1/users/create', {
      method: 'POST',
      body: {
        name: data.name,
        email: data.email,
        password: data.password,
        passwordConfirm: data.passwordConfirm,
        role: data.role,
      },
    })

    if (!res.success) {
      throw new Error(res.message || 'Erro ao criar usuário.')
    }

    return res.user
  },

  async update(id: string, data: Partial<UserFormData>): Promise<UserProfile> {
    const res = await pb.send<{
      success: boolean
      message: string
      user: UserProfile
    }>(`/backend/v1/users/update/${id}`, {
      method: 'POST',
      body: data,
    })

    if (!res.success) {
      throw new Error(res.message || 'Erro ao atualizar usuário.')
    }

    return res.user
  },

  async resetPassword(id: string, password: string, passwordConfirm: string): Promise<void> {
    const res = await pb.send<{
      success: boolean
      message: string
    }>(`/backend/v1/users/reset-password/${id}`, {
      method: 'POST',
      body: {
        password,
        passwordConfirm,
      },
    })

    if (!res.success) {
      throw new Error(res.message || 'Erro ao redefinir senha.')
    }
  },
}
