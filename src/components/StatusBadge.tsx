import React from 'react'
import { ChargeStatus } from '@/types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: ChargeStatus
  className?: string
  size?: 'sm' | 'md'
}

const statusConfig: Record<ChargeStatus, { label: string; bg: string; text: string; dot: string }> =
  {
    pending: {
      label: 'Pendente',
      bg: 'bg-amber-50 border-amber-200/60',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
    },
    paid: {
      label: 'Pago',
      bg: 'bg-emerald-50 border-emerald-200/60',
      text: 'text-emerald-700',
      dot: 'bg-emerald-600',
    },
    overdue: {
      label: 'Vencido',
      bg: 'bg-red-50 border-red-200/60',
      text: 'text-red-700',
      dot: 'bg-red-600',
    },
    cancelled: {
      label: 'Cancelado',
      bg: 'bg-slate-100 border-slate-200',
      text: 'text-slate-600',
      dot: 'bg-slate-400',
    },
  }

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className, size = 'md' }) => {
  const config = statusConfig[status] || statusConfig.pending

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border transition-all duration-200',
        config.bg,
        config.text,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        status === 'overdue' && 'animate-pulse font-semibold',
        className,
      )}
    >
      <span
        className={cn(
          'rounded-full shrink-0',
          config.dot,
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
        )}
      />
      {config.label}
    </span>
  )
}
