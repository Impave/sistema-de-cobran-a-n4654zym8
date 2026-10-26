import pb from '@/lib/pocketbase/client'
import type { UserProfile } from '@/types'

export const authService = {
  getCurrentUser(): UserProfile | null {
    if (!pb.authStore.isValid || !pb.authStore.record) return null
    const r = pb.authStore.record
    return {
      id: r.id,
      email: r.email,
      name: (r.name as string) || (r.email ? r.email.split('@')[0] : 'Usuário'),
      avatar: r.avatar as string | undefined,
      role: (r.role as 'admin' | 'operador') || 'operador',
      active: r.active !== false,
      verified: r.verified as boolean | undefined,
      created: r.created,
      updated: r.updated,
    }
  },

  async login(email: string, password: string): Promise<UserProfile> {
    const authData = await pb.collection('users').authWithPassword(email, password)
    const r = authData.record
    return {
      id: r.id,
      email: r.email,
      name: (r.name as string) || (r.email ? r.email.split('@')[0] : 'Usuário'),
      avatar: r.avatar as string | undefined,
      role: (r.role as 'admin' | 'operador') || 'operador',
      active: r.active !== false,
      verified: r.verified as boolean | undefined,
      created: r.created,
      updated: r.updated,
    }
  },

  async register(
    email: string,
    password: string,
    passwordConfirm: string,
    name?: string,
  ): Promise<void> {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm,
      name: name || '',
    })
    // Solicita verificação de email
    try {
      await pb.collection('users').requestVerification(email)
    } catch {
      /* intentionally ignored */
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    await pb.collection('users').requestPasswordReset(email)
  },

  async confirmPasswordReset(
    token: string,
    password: string,
    passwordConfirm: string,
  ): Promise<void> {
    await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
  },

  async requestVerification(email: string): Promise<void> {
    await pb.collection('users').requestVerification(email)
  },

  async confirmVerification(token: string): Promise<void> {
    await pb.collection('users').confirmVerification(token)
  },

  async updateProfile(id: string, data: { name?: string; email?: string }): Promise<UserProfile> {
    const r = await pb.collection('users').update(id, data)
    return {
      id: r.id,
      email: r.email,
      name: (r.name as string) || (r.email ? r.email.split('@')[0] : 'Usuário'),
      avatar: r.avatar as string | undefined,
      role: (r.role as 'admin' | 'operador') || 'operador',
      active: r.active !== false,
      verified: r.verified as boolean | undefined,
      created: r.created,
      updated: r.updated,
    }
  },

  async requestEmailChange(newEmail: string): Promise<void> {
    await pb.collection('users').requestEmailChange(newEmail)
  },

  async confirmEmailChange(token: string, password: string): Promise<void> {
    await pb.collection('users').confirmEmailChange(token, password)
  },

  async changePassword(
    id: string,
    oldPassword: string,
    password: string,
    passwordConfirm: string,
  ): Promise<void> {
    await pb.collection('users').update(id, {
      oldPassword,
      password,
      passwordConfirm,
    })
  },

  async deleteAccount(id: string): Promise<void> {
    await pb.collection('users').delete(id)
    pb.authStore.clear()
  },

  logout(): void {
    pb.authStore.clear()
  },
}
