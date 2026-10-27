import pb from '@/lib/pocketbase/client'
import type { FlexSmartSyncStatus } from '@/types'

export interface FlexSyncRecord {
  id: string
  owner: string
  status: 'pending' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'error' | 'failed'
  started_at?: string
  finished_at?: string
  count?: number
  imported?: number
  created_count?: number
  updated_count?: number
  current_step?: string
  error?: string
  sync_date?: string
  sync_mode?: string
  is_full_sync?: boolean
  sync_start_date?: string
  total_days?: number
  processed_days?: number
  current_day_date?: string
  created?: string
  updated?: string
}

function mapRecordToSyncStatus(record: FlexSyncRecord): FlexSmartSyncStatus {
  const count = Number(record.count ?? 0)
  const imported = Number(record.imported ?? 0)
  const createdCount = Number(record.created_count ?? 0)
  const updatedCount = Number(record.updated_count ?? 0)
  const totalDays = Number(record.total_days ?? 1)
  const processedDays = Number(record.processed_days ?? 0)

  let percent = 0
  if (record.sync_mode === 'day_by_day' || record.is_full_sync) {
    percent = totalDays > 0 ? Math.min(100, Math.round((processedDays / totalDays) * 100)) : 0
  } else {
    percent = count > 0 ? Math.min(100, Math.round((imported / count) * 100)) : 0
  }
  if (record.status === 'done') percent = 100

  return {
    id: record.id,
    status: record.status,
    currentStep: record.current_step || '',
    count,
    imported,
    createdCount,
    updatedCount,
    percent,
    error: record.error || undefined,
    syncDate: record.sync_date,
    syncStartDate: record.sync_start_date,
    totalDays,
    processedDays,
    currentDayDate: record.current_day_date,
    syncMode: record.sync_mode,
    isFullSync: record.is_full_sync,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    created: record.created,
    updated: record.updated,
  }
}

export const flexSmartService = {
  /**
   * Obtém a última sincronização registrada.
   * Tenta primeiro a rota existente do backend `/backend/v1/flexsmart/last-sync`.
   * Caso o usuário não tenha registros no endpoint ou ocorra algum imprevisto,
   * faz fallback buscando o registro mais recente diretamente da coleção `flex_sync`.
   */
  async getLastSync(): Promise<FlexSmartSyncStatus | null> {
    try {
      const response = await pb.send<{ lastSync?: FlexSmartSyncStatus }>(
        '/backend/v1/flexsmart/last-sync',
        {
          method: 'GET',
          requestKey: null,
        },
      )

      if (response && response.lastSync && response.lastSync.id) {
        return response.lastSync
      }
    } catch (endpointErr) {
      console.warn(
        '[flexSmartService] Endpoint /last-sync falhou, tentando fallback direto na coleção:',
        endpointErr,
      )
    }

    // Fallback: consulta direta à coleção flex_sync ordenada por -created
    try {
      const record = await pb.collection('flex_sync').getFirstListItem<FlexSyncRecord>('', {
        sort: '-created',
        requestKey: null,
      })
      if (record && record.id) {
        return mapRecordToSyncStatus(record)
      }
    } catch (_) {
      // Nenhum registro encontrado ou sem permissão
    }

    return null
  },
}
