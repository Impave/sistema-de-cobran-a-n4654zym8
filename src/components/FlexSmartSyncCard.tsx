import React from 'react'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Clock,
  Layers,
  UserPlus,
  UserCheck,
  AlertCircle,
  CalendarClock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTimeBR } from '@/lib/formatters'
import type { FlexSmartSyncStatus } from '@/types'

interface FlexSmartSyncCardProps {
  lastSync: FlexSmartSyncStatus | null
  loading?: boolean
  errorMessage?: string | null
  onRefresh?: () => void
}

export const FlexSmartSyncCard: React.FC<FlexSmartSyncCardProps> = ({
  lastSync,
  loading = false,
  errorMessage = null,
  onRefresh,
}) => {
  // Estado de erro de consulta (rede/servidor): não foi possível consultar o status atual
  if (errorMessage && !loading) {
    return (
      <Card className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-xs">
        <CardContent className="p-4 sm:p-4.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Última sincronização</h3>
                  <Badge
                    variant="outline"
                    className="bg-amber-100/80 text-amber-800 border-amber-300 text-[11px] font-medium px-2 py-0.5"
                  >
                    Falha na consulta
                  </Badge>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Não foi possível verificar o status atual da rotina FlexSmart no servidor. Tente
                  atualizar novamente.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-500">
              <CalendarClock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span>Sincronização automática: 9h às 19h (seg a sex)</span>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  title="Tentar consultar novamente"
                  className="ml-1 p-1 rounded hover:bg-amber-100 text-amber-800 hover:text-amber-950 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Estado neutro: nenhuma sincronização registrada
  if (!loading && (!lastSync || !lastSync.id)) {
    return (
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <CardContent className="p-4 sm:p-4.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 shrink-0">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Última sincronização</h3>
                  <Badge
                    variant="outline"
                    className="bg-slate-50 text-slate-600 border-slate-200 text-[11px] font-medium px-2 py-0.5"
                  >
                    Nenhuma execução registrada
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nenhuma sincronização registrada ainda com o ERP FlexSmart.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-400">
              <CalendarClock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span>Sincronização automática: 9h às 19h (seg a sex)</span>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  title="Atualizar status"
                  className="ml-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Se estiver carregando pela primeira vez sem dados
  if (loading && !lastSync) {
    return (
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <CardContent className="p-4 sm:p-4.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Última sincronização</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verificando status da rotina FlexSmart...
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
              <span>Sincronização automática: 9h às 19h (seg a sex)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const status = lastSync?.status || 'done'

  const isRunning = status === 'running' || status === 'pending'
  const isCancelled = status === 'cancelled' || status === 'cancelling'
  const isFailed = status === 'failed' || status === 'error'
  const isDone = status === 'done'

  // Configuração visual por status
  let statusBadge = {
    label: 'Concluída',
    variantClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    bgIcon: 'bg-emerald-50 border-emerald-100 text-emerald-600',
  }

  if (isRunning) {
    statusBadge = {
      label: 'Em andamento',
      variantClass: 'bg-blue-50 text-blue-700 border-blue-200',
      dotClass: 'bg-blue-500',
      icon: RefreshCw,
      iconClass: 'text-blue-600 animate-spin',
      bgIcon: 'bg-blue-50 border-blue-100 text-blue-600',
    }
  } else if (isFailed) {
    statusBadge = {
      label: 'Falhou',
      variantClass: 'bg-rose-50 text-rose-700 border-rose-200',
      dotClass: 'bg-rose-500',
      icon: XCircle,
      iconClass: 'text-rose-600',
      bgIcon: 'bg-rose-50 border-rose-100 text-rose-600',
    }
  } else if (isCancelled) {
    statusBadge = {
      label: 'Interrompida',
      variantClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500',
      icon: AlertOctagon,
      iconClass: 'text-amber-600',
      bgIcon: 'bg-amber-50 border-amber-100 text-amber-600',
    }
  }

  const StatusIcon = statusBadge.icon

  // Datas de início e término formatadas
  const startedAtFormatted = lastSync?.startedAt
    ? formatDateTimeBR(lastSync.startedAt)
    : lastSync?.created
      ? formatDateTimeBR(lastSync.created)
      : null

  const finishedAtFormatted = lastSync?.finishedAt ? formatDateTimeBR(lastSync.finishedAt) : null

  const hasCount = typeof lastSync?.count === 'number'
  const hasCreated = typeof lastSync?.createdCount === 'number'
  const hasUpdated = typeof lastSync?.updatedCount === 'number'
  const showCounters = (isDone || isFailed || isCancelled) && (hasCount || hasCreated || hasUpdated)

  return (
    <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
      <CardContent className="p-4 sm:p-4.5 space-y-3">
        {/* Linha superior: título + status + horário de sincronização automática */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${statusBadge.bgIcon}`}
            >
              <StatusIcon className={`w-4 h-4 ${statusBadge.iconClass}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Última sincronização</h3>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-medium px-2 py-0.5 inline-flex items-center gap-1.5 ${statusBadge.variantClass}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${statusBadge.dotClass} ${
                      isRunning ? 'animate-pulse' : ''
                    }`}
                  />
                  {statusBadge.label}
                </Badge>
              </div>

              {/* Data e hora de início e término */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5">
                {startedAtFormatted && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Início:</span>
                    <strong className="font-medium text-slate-700">{startedAtFormatted}</strong>
                  </span>
                )}
                {finishedAtFormatted && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-slate-300">•</span>
                    <span>Término:</span>
                    <strong className="font-medium text-slate-700">{finishedAtFormatted}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Contexto discreto do cron horário */}
          <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-400 sm:text-right">
            <CalendarClock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span>Sincronização automática: 9h às 19h (seg a sex)</span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                title="Atualizar status agora"
                className="ml-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Linha intermediária quando em andamento: mostrar fase atual e progresso */}
        {isRunning && (
          <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 sm:p-3 text-xs text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
              <span>
                <strong className="font-semibold text-blue-950">Fase atual: </strong>
                {lastSync?.currentStep || 'Sincronizando clientes do ERP FlexSmart...'}
              </span>
            </div>
            {lastSync && typeof lastSync.percent === 'number' && lastSync.percent > 0 && (
              <span className="font-semibold text-blue-800 tabular-nums self-end sm:self-auto">
                {lastSync.percent}%
              </span>
            )}
          </div>
        )}

        {/* Linha de erro quando falhou: mostrar mensagem real do registro */}
        {isFailed && (
          <div className="bg-rose-50/80 border border-rose-200/80 rounded-lg p-2.5 sm:p-3 text-xs text-rose-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-rose-950">Mensagem de erro: </span>
              <span className="break-words">
                {lastSync?.error ||
                  lastSync?.currentStep ||
                  'Falha ao sincronizar dados com o ERP.'}
              </span>
            </div>
          </div>
        )}

        {/* Contadores da execução (quando concluída, falhada ou cancelada) */}
        {showCounters && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            {hasCount && (
              <div className="inline-flex items-center gap-1.5 text-slate-600">
                <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Registros lidos do ERP:</span>
                <strong className="font-semibold text-slate-800 tabular-nums">
                  {lastSync?.count ?? 0}
                </strong>
              </div>
            )}
            {hasCreated && (
              <div className="inline-flex items-center gap-1.5 text-slate-600">
                <UserPlus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Clientes criados:</span>
                <strong className="font-semibold text-emerald-700 tabular-nums">
                  {lastSync?.createdCount ?? 0}
                </strong>
              </div>
            )}
            {hasUpdated && (
              <div className="inline-flex items-center gap-1.5 text-slate-600">
                <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Clientes atualizados:</span>
                <strong className="font-semibold text-indigo-700 tabular-nums">
                  {lastSync?.updatedCount ?? 0}
                </strong>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
export default FlexSmartSyncCard
