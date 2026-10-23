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
    return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  if (msgs.length > 0) {
    return msgs.join(' ')
  }
  const resData = error.response?.data
  if (resData && typeof resData === 'object') {
    if (typeof (resData as { error?: unknown }).error === 'string') {
      return (resData as { error: string }).error
    }
    if (typeof (resData as { message?: unknown }).message === 'string') {
      return (resData as { message: string }).message
    }
  }
  if (error.response?.message && typeof error.response.message === 'string') {
    return error.response.message
  }
  if (error.message && error.message !== 'Something went wrong.') {
    return error.message
  }
  return 'Ocorreu um erro no processamento da requisição.'
}
