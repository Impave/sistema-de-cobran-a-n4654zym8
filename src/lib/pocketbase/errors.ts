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
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const responseData = error.response as Record<string, unknown> | undefined
  if (responseData) {
    if (typeof responseData.error === 'string' && responseData.error) {
      return responseData.error
    }
    if (
      typeof responseData.message === 'string' &&
      responseData.message &&
      responseData.message !== 'Something went wrong.'
    ) {
      return responseData.message
    }
  }
  const msgs = Object.values(extractFieldErrors(error))
  if (msgs.length > 0) {
    return msgs.join(' ')
  }
  if (error.message && error.message !== 'Something went wrong.') {
    return error.message
  }
  return 'Ocorreu um erro inesperado ao se comunicar com o servidor.'
}
