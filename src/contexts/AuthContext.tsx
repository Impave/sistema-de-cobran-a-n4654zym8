import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import type { UserProfile } from '@/types'
import { authService } from '@/services/auth'

interface AuthContextType {
  user: UserProfile | null
  loading: boolean
  login: (email: string, password: string) => Promise<UserProfile>
  register: (
    email: string,
    password: string,
    passwordConfirm: string,
    name?: string,
  ) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => authService.getCurrentUser())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      if (pb.authStore.isValid && pb.authStore.record) {
        // Tenta renovar / obter dados mais recentes
        const authData = await pb
          .collection('users')
          .authRefresh()
          .catch(() => null)
        if (authData?.record) {
          setUser(authService.getCurrentUser())
        } else if (pb.authStore.record) {
          setUser(authService.getCurrentUser())
        } else {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    } catch (_) {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const unsubscribe = pb.authStore.onChange(() => {
      setUser(authService.getCurrentUser())
    })

    return () => {
      unsubscribe()
    }
  }, [refresh])

  const login = async (email: string, password: string) => {
    const loggedUser = await authService.login(email, password)
    setUser(loggedUser)
    return loggedUser
  }

  const register = async (
    email: string,
    password: string,
    passwordConfirm: string,
    name?: string,
  ) => {
    await authService.register(email, password, passwordConfirm, name)
  }

  const logout = () => {
    authService.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
