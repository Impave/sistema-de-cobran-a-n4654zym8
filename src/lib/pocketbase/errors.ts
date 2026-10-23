import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    if (error && typeof error === 'object') {
      const errObj = error as Record<string, unknown>
      if (typeof errObj.message === 'string' && errObj.message) return errObj.message
      if (typeof errObj.error === 'string' && errObj.error) return errObj.error
    }
    return error instanceof Error
      ? error.message
      : 'Ocorreu um erro inesperado ao se comunicar com o servidor.'
  }

  // Se o servidor retornou { error: "mensagem" } ou { message: "mensagem" } na resposta
  const resData = error.response?.data
  if (resData && typeof resData === 'object') {
    const dataObj = resData as Record<string, unknown>
    if (typeof dataObj.error === 'string' && dataObj.error) {
      return dataObj.error
    }
    if (typeof dataObj.message === 'string' && dataObj.message) {
      return dataObj.message
    }
  }

  const msgs = Object.values(extractFieldErrors(error))
  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  // Se o próprio erro do PocketBase tem mensagem específica e diferente do padrão genérico
  if (
    error.message &&
    error.message !== 'Failed to authenticate.' &&
    !error.message.includes('Something went wrong')
  ) {
    return error.message
  }

  // Se houver response.message
  if (error.response?.message && typeof error.response.message === 'string') {
    return error.response.message
  }

  return error.message || 'Ocorreu um erro ao processar a requisição no servidor.'
}
