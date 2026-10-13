/**
 * Utilitários de formatação para moeda (BRL), datas e documentos brasileiros (CPF/CNPJ).
 */

export function formatCurrencyBRL(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  if (isNaN(num)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num)
}

export function formatDateBR(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-'
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatDateTimeBR(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-'
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatDateExtendedBR(dateInput: string | Date = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/**
 * Formata CPF (11 dígitos: 000.000.000-00) ou CNPJ (14 dígitos: 00.000.000/0000-00)
 */
export function formatDocument(raw: string | null | undefined): string {
  if (!raw) return '-'
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 11) {
    // CPF
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Formata telefone brasileiro (10 ou 11 dígitos)
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '-'
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  }
  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  }
  return raw
}

/**
 * Gera iniciais a partir do nome
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Gera um número de cobrança no formato COB-XXXXXX
 */
export function generateChargeNumber(): string {
  const random = Math.floor(100000 + Math.random() * 900000)
  return `COB-${random}`
}

/**
 * Retorna se uma data já venceu (comparada ao início do dia de hoje)
 */
export function isDateOverdue(dueDateStr: string): boolean {
  if (!dueDateStr) return false
  const due = new Date(dueDateStr)
  const now = new Date()
  // Comparar no mesmo instante
  return due.getTime() < now.getTime()
}
