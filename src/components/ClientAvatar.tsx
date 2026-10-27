import React from 'react'
import { getInitials } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface ClientAvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const colors = [
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
]

export const ClientAvatar: React.FC<ClientAvatarProps> = ({ name, size = 'md', className }) => {
  const safeName = name && typeof name === 'string' && name.trim().length > 0 ? name : 'Cliente'
  const initials = getInitials(safeName)

  // Seleciona cor baseada no hash do nome
  let hash = 0
  for (let i = 0; i < safeName.length; i++) {
    hash = safeName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colorClass = colors[Math.abs(hash) % colors.length]

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs font-semibold',
    lg: 'w-11 h-11 text-sm font-bold',
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center border select-none shrink-0 font-medium',
        colorClass,
        sizeClasses[size],
        className,
      )}
    >
      {initials}
    </div>
  )
}
