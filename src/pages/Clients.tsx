import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  Receipt,
  Mail,
  Phone,
  MapPin,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Building2,
  CheckCircle2,
  XCircle,
  Square,
  StopCircle,
  Ban,
  ChevronDown,
  Calendar,
  Database,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { ClientAvatar } from '@/components/ClientAvatar'
import { clientsService } from '@/services/clients'
import { chargesService } from '@/services/charges'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import type { ClientRecord, ClientFormData, ChargeRecord, FlexSmartSyncStatus } from '@/types'
import { formatDocument, formatPhone } from '@/lib/formatters'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [charges, setCharges] = useState<ChargeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Paginação server-side
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Modais de Criação/Edição e Exclusão
  const [searchParams, setSearchParams] = useSearchParams()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null)

  // Form state com os campos novos da coleção reconstruída
  const [formData, setFormData] = useState<ClientFormData>({
    cod_cliente: '',
    nome_cliente: '',
    razao_social: '',
    cnpj_cpf: '',
    contato1: '',
    contato2: '',
    email1: '',
    email2: '',
    email3: '',
    estado: '',
    cidade: '',
    bairro: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [cancellingSync, setCancellingSync] = useState(false)
  const [activeSync, setActiveSync] = useState<FlexSmartSyncStatus | null>(null)

  // Estado para o diálogo de seleção de data inicial para carga dia a dia
  const [isDatePickerDialogOpen, setIsDatePickerDialogOpen] = useState(false)
  const [selectedStartDate, setSelectedStartDate] = useState('2026-09-01')

  const { user } = useAuth()
  const { toast } = useToast()

  // Debounce da busca digitada para não sobrecarregar requisições
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadData = useCallback(async () => {
    try {
      const [clientsResp, allCharges] = await Promise.all([
        clientsService.getList({
          page: currentPage,
          perPage: pageSize,
          search: debouncedSearch,
          sort: '-created',
        }),
        chargesService.getAll(),
      ])
      setClients(clientsResp.items)
      setTotalItems(clientsResp.totalItems)
      setTotalPages(clientsResp.totalPages || 1)
      setCharges(allCharges)
    } catch (err) {
      console.error('Erro ao carregar clientes:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Real-time
  useRealtime('clients', () => {
    loadData()
  })
  useRealtime('charges', () => {
    loadData()
  })

  // Mapa de contagem de cobranças por cliente
  const chargeCountMap = useMemo(() => {
    const map = new Map<string, number>()
    charges.forEach((c) => {
      map.set(c.client, (map.get(c.client) || 0) + 1)
    })
    return map
  }, [charges])

  // Handle URL query parameters para sincronizar modal
  useEffect(() => {
    const newParam = searchParams.get('new')
    const editId = searchParams.get('edit')

    if (newParam === 'true') {
      setEditingClient(null)
      setFormData({
        cod_cliente: '',
        nome_cliente: '',
        razao_social: '',
        cnpj_cpf: '',
        contato1: '',
        contato2: '',
        email1: '',
        email2: '',
        email3: '',
        estado: '',
        cidade: '',
        bairro: '',
      })
      setIsFormOpen(true)
    } else if (editId && clients.length > 0) {
      const found = clients.find((c) => c.id === editId)
      if (found) {
        setEditingClient(found)
        setFormData({
          cod_cliente: found.cod_cliente || found.erp_code || '',
          nome_cliente: found.nome_cliente || found.name || '',
          razao_social: found.razao_social || '',
          cnpj_cpf: formatDocument(found.cnpj_cpf || found.document),
          contato1: formatPhone(found.contato1 || found.phone),
          contato2: formatPhone(found.contato2),
          email1: found.email1 || found.email || '',
          email2: found.email2 || '',
          email3: found.email3 || '',
          estado: found.estado || found.state || '',
          cidade: found.cidade || found.city || '',
          bairro: found.bairro || '',
        })
        setIsFormOpen(true)
      }
    }
  }, [searchParams, clients])

  const handleOpenCreate = () => {
    setEditingClient(null)
    setFormData({
      cod_cliente: '',
      nome_cliente: '',
      razao_social: '',
      cnpj_cpf: '',
      contato1: '',
      contato2: '',
      email1: '',
      email2: '',
      email3: '',
      estado: '',
      cidade: '',
      bairro: '',
    })
    setFormError(null)
    setIsFormOpen(true)
    setSearchParams({ new: 'true' })
  }

  const handleOpenEdit = (client: ClientRecord) => {
    setEditingClient(client)
    setFormData({
      cod_cliente: client.cod_cliente || client.erp_code || '',
      nome_cliente: client.nome_cliente || client.name || '',
      razao_social: client.razao_social || '',
      cnpj_cpf: formatDocument(client.cnpj_cpf || client.document),
      contato1: formatPhone(client.contato1 || client.phone),
      contato2: formatPhone(client.contato2),
      email1: client.email1 || client.email || '',
      email2: client.email2 || '',
      email3: client.email3 || '',
      estado: client.estado || client.state || '',
      cidade: client.cidade || client.city || '',
      bairro: client.bairro || '',
    })
    setFormError(null)
    setIsFormOpen(true)
    setSearchParams({ edit: client.id })
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setEditingClient(null)
    setSearchParams({})
  }

  const handleOpenDelete = (client: ClientRecord) => {
    setDeletingClient(client)
    setIsDeleteOpen(true)
  }

  const handleCloseDelete = () => {
    setIsDeleteOpen(false)
    setDeletingClient(null)
  }

  // Submissão do formulário
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const cleanDoc = (formData.cnpj_cpf || '').replace(/\D/g, '')
    if (!cleanDoc) {
      setFormError('Informe o CPF/CNPJ.')
      return
    }

    const finalName = (formData.nome_cliente || '').trim()
    const displayName =
      finalName || (formData.razao_social || '').trim() || formData.cnpj_cpf || 'Cliente'

    setFormLoading(true)
    try {
      const payload: ClientFormData = {
        ...formData,
        nome_cliente: finalName,
        cnpj_cpf: formData.cnpj_cpf,
      }
      if (editingClient) {
        await clientsService.update(editingClient.id, payload)
        toast({
          title: 'Cliente atualizado',
          description: `Os dados de ${displayName} foram atualizados com sucesso.`,
        })
      } else {
        await clientsService.create(payload)
        toast({
          title: 'Cliente cadastrado',
          description: `${displayName} foi adicionado à sua base de clientes.`,
        })
      }
      handleCloseForm()
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar dados do cliente.'
      setFormError(msg)
      toast({
        title: 'Erro ao salvar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setFormLoading(false)
    }
  }

  // Exclusão do cliente
  const handleConfirmDelete = async () => {
    if (!deletingClient) return
    setFormLoading(true)
    const displayName =
      deletingClient.nome_cliente || deletingClient.razao_social || deletingClient.name || 'Cliente'
    try {
      await clientsService.delete(deletingClient.id)
      toast({
        title: 'Cliente excluído',
        description: `O cliente ${displayName} e suas cobranças vinculadas foram removidos.`,
      })
      handleCloseDelete()
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir cliente.'
      toast({
        title: 'Falha na exclusão',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setFormLoading(false)
    }
  }

  // Carrega o último status de sincronização ao montar
  useEffect(() => {
    let isMounted = true
    clientsService
      .getLastFlexSmartSync()
      .then((res) => {
        if (isMounted && res.lastSync) {
          const sync = res.lastSync
          if (sync.status === 'cancelling') {
            const syncTime = sync.updated ? new Date(sync.updated).getTime() : 0
            if (!syncTime || Date.now() - syncTime > 10000) {
              sync.status = 'cancelled'
              sync.currentStep = sync.currentStep || 'Importação interrompida pelo usuário.'
            }
          }
          setActiveSync(sync)
        }
      })
      .catch((_) => {})
    return () => {
      isMounted = false
    }
  }, [])

  // Polling quando activeSync estiver 'pending', 'running' ou 'cancelling'
  useEffect(() => {
    if (
      !activeSync ||
      (activeSync.status !== 'pending' &&
        activeSync.status !== 'running' &&
        activeSync.status !== 'cancelling')
    ) {
      return
    }

    const startTime = Date.now()

    const interval = setInterval(async () => {
      try {
        // Timeout de segurança no frontend: se estiver em cancelling por mais de 20s,
        // força o estado visual para 'cancelled' para liberar o botão e a interface.
        if (activeSync.status === 'cancelling' && Date.now() - startTime > 20000) {
          clearInterval(interval)
          setSyncLoading(false)
          setCancellingSync(false)
          setActiveSync((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'cancelled',
                  currentStep: 'Importação interrompida.',
                }
              : null,
          )
          toast({
            title: 'Importação interrompida',
            description: 'A importação foi finalizada. O botão foi liberado para nova tentativa.',
          })
          loadData()
          return
        }

        // Timeout de segurança no frontend: no modo day_by_day cada dia pode levar até 60s,
        // então não interrompemos por timeout estático de 90s global; em vez disso,
        // respeitamos o status real do backend ou 2 horas total no modo diário (180s no modo data única)
        const isDayByDayPolling = activeSync.syncMode === 'day_by_day' || activeSync.isFullSync
        const runningMaxDurationMs = isDayByDayPolling ? 7200000 : 180000

        if (activeSync.status === 'running' && Date.now() - startTime > runningMaxDurationMs) {
          clearInterval(interval)
          setSyncLoading(false)
          setCancellingSync(false)
          setActiveSync((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'error',
                  currentStep: 'Tempo limite de sincronização excedido.',
                  error: 'O tempo limite da sincronização foi atingido. Tente novamente.',
                }
              : null,
          )
          toast({
            title: 'Tempo limite excedido',
            description: 'A resposta do ERP demorou além do limite tolerado. Tente novamente.',
            variant: 'destructive',
          })
          return
        }

        // No modo day_by_day, cada iteração avança 1 dia com stepFlexSmartSync.
        // No modo single_date, o backend também executa via stepFlexSmartSync se estiver pending/running.
        let status: FlexSmartSyncStatus
        if (activeSync.status === 'pending' || activeSync.status === 'running') {
          try {
            await clientsService.stepFlexSmartSync(activeSync.id)
          } catch (stepErr) {
            console.warn('[ClientsPage] Aviso ao acionar passo da importação:', stepErr)
          }
          status = await clientsService.getFlexSmartSyncStatus(activeSync.id)
          // Atualiza a lista na tabela durante a sincronização se houve avanço
          if (
            status.status === 'done' ||
            (status.imported && status.imported > (activeSync.imported || 0)) ||
            (status.processedDays && status.processedDays > (activeSync.processedDays || 0))
          ) {
            loadData()
          }
        } else {
          status = await clientsService.getFlexSmartSyncStatus(activeSync.id)
        }

        setActiveSync(status)

        if (status.status === 'cancelled') {
          clearInterval(interval)
          setSyncLoading(false)
          setCancellingSync(false)
          toast({
            title: 'Importação interrompida',
            description: `A importação foi cancelada. Clientes salvos até o momento: ${status.imported} processados (${status.createdCount} criados, ${status.updatedCount} atualizados).`,
          })
          loadData()
        } else if (status.status === 'done') {
          clearInterval(interval)
          setSyncLoading(false)
          setCancellingSync(false)
          toast({
            title: 'Sincronização concluída',
            description: `${status.createdCount} novos clientes importados, ${status.updatedCount} atualizados (${status.count} no ERP FlexSmart).`,
          })
          loadData()
        } else if (status.status === 'error') {
          clearInterval(interval)
          setSyncLoading(false)
          setCancellingSync(false)
          toast({
            title: 'Falha na sincronização com FlexSmart',
            description: status.error || 'Erro durante o processamento do ERP FlexSmart.',
            variant: 'destructive',
          })
        }
      } catch (err) {
        console.error('Erro no polling do FlexSmart:', err)
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [activeSync?.id, activeSync?.status, loadData, toast])
  // Interrupção / Cancelamento da importação
  const handleCancelSync = async () => {
    if (!activeSync) return
    setCancellingSync(true)
    try {
      const res = await clientsService.cancelFlexSmartSync(activeSync.id)
      const finalStatus = res.status === 'cancelled' ? 'cancelled' : 'cancelling'

      if (finalStatus === 'cancelled') {
        setCancellingSync(false)
        setSyncLoading(false)
      }

      setActiveSync((prev) =>
        prev
          ? {
              ...prev,
              status: finalStatus,
              currentStep:
                finalStatus === 'cancelled'
                  ? 'Importação interrompida.'
                  : 'Interrupção solicitada pelo usuário...',
            }
          : null,
      )

      toast({
        title: finalStatus === 'cancelled' ? 'Importação interrompida' : 'Interrupção solicitada',
        description:
          res.message ||
          (finalStatus === 'cancelled'
            ? 'Importação finalizada. Clientes já salvos foram mantidos.'
            : 'Interrompendo importação... Os clientes já salvos serão mantidos.'),
      })

      if (finalStatus === 'cancelled') {
        loadData()
      }
    } catch (err: unknown) {
      setCancellingSync(false)
      const msg = getErrorMessage(err)
      toast({
        title: 'Erro ao solicitar interrupção',
        description: msg || 'Não foi possível cancelar o processo.',
        variant: 'destructive',
      })
    }
  }

  // Converte YYYY-MM-DD para DD/MM/AAAA para exibição amigável
  const formatISOToBR = (iso: string) => {
    if (!iso) return ''
    const parts = iso.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return iso
  }

  // Sincronização manual com o ERP FlexSmart
  const handleSyncFlexSmart = async (options?: {
    date?: string
    startDate?: string
    mode?: 'single_date' | 'day_by_day'
  }) => {
    setSyncLoading(true)
    try {
      const isDayByDay = options?.mode === 'day_by_day'
      const formattedStartDate = options?.startDate
        ? options.startDate.includes('-')
          ? formatISOToBR(options.startDate)
          : options.startDate
        : undefined
      const formattedDate = options?.date
        ? options.date.includes('-')
          ? formatISOToBR(options.date)
          : options.date
        : undefined

      const payload = {
        date: formattedDate,
        startDate: formattedStartDate,
        mode: options?.mode || 'single_date',
      }

      const res = await clientsService.startFlexSmartSync(payload)
      if (res.syncId) {
        const targetDate = res.targetDate || 'ontem'
        const isDayByDayMode = res.syncMode === 'day_by_day' || isDayByDay
        const totalDays = res.totalDays || 1
        const initialDateStr = res.syncStartDate || formattedStartDate || '01/09/2026'
        setActiveSync({
          id: res.syncId,
          status: 'pending',
          currentStep: isDayByDayMode
            ? `Iniciando carga dia a dia (${initialDateStr} → hoje, ${totalDays} dias)...`
            : `Buscando clientes alterados desde ${targetDate} no ERP...`,
          count: 0,
          imported: 0,
          createdCount: 0,
          updatedCount: 0,
          percent: 0,
          syncDate: targetDate,
          syncStartDate: initialDateStr,
          totalDays: totalDays,
          processedDays: 0,
          currentDayDate: isDayByDayMode ? initialDateStr : targetDate,
          syncMode: isDayByDayMode ? 'day_by_day' : 'single_date',
          isFullSync: isDayByDayMode,
        })
        toast({
          title: isDayByDayMode ? 'Carga dia a dia iniciada' : 'Importação do ERP iniciada',
          description: isDayByDayMode
            ? `Carga dia a dia iniciada (${initialDateStr} → hoje). ${totalDays} dias serão verificados sequencialmente.`
            : `Buscando clientes alterados desde ${targetDate} em segundo plano. Clientes existentes serão atualizados.`,
        })
        // Atualiza a primeira página para refletir novos clientes imediatamente
        setCurrentPage(1)
      }
    } catch (err: unknown) {
      setSyncLoading(false)
      let msg = getErrorMessage(err)
      if (!msg || msg === 'An unexpected error occurred.' || msg.includes('Something went wrong')) {
        msg = 'Ocorreu um erro ao comunicar com o servidor.'
      }
      console.error('[ClientsPage] Erro ao iniciar sincronização:', err)
      toast({
        title: 'Falha ao iniciar sincronização',
        description: msg,
        variant: 'destructive',
      })
      try {
        const last = await clientsService.getLastFlexSmartSync()
        if (last?.lastSync) {
          setActiveSync(last.lastSync)
        }
      } catch {
        /* intentionally ignored */
      }
    }
  }

  // A lista já é filtrada e paginada pelo servidor
  const filteredClients = clients

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clientes</h1>
            <Badge
              variant="outline"
              className="bg-slate-100 text-slate-700 border-slate-300 text-xs px-2 py-0.5 font-medium tabular-nums"
              title="Total de clientes cadastrados na sua base"
            >
              {totalItems} {totalItems === 1 ? 'cliente' : 'clientes'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie sua carteira de clientes, dados cadastrais e histórico de cobranças
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Botão de importação manual do ERP FlexSmart (visível para administradores) */}
          {user?.role === 'admin' && (
            <div className="inline-flex rounded-lg shadow-xs">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSyncFlexSmart()}
                disabled={
                  syncLoading ||
                  loading ||
                  cancellingSync ||
                  activeSync?.status === 'running' ||
                  activeSync?.status === 'pending' ||
                  activeSync?.status === 'cancelling'
                }
                className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-r-none"
                title={
                  activeSync?.yesterdayDate
                    ? `Buscar clientes alterados desde ${activeSync.yesterdayDate} no ERP FlexSmart`
                    : 'Buscar clientes alterados a partir da data de ontem no ERP FlexSmart'
                }
              >
                {cancellingSync || activeSync?.status === 'cancelling' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-amber-600" />
                    Interrompendo...
                  </>
                ) : syncLoading ||
                  activeSync?.status === 'running' ||
                  activeSync?.status === 'pending' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-indigo-600" />
                    Importando do ERP...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1.5 text-indigo-600" />
                    <span>Importar do ERP FlexSmart</span>
                    {activeSync?.yesterdayDate && (
                      <span className="hidden md:inline ml-1 text-xs text-slate-400 font-normal">
                        (desde {activeSync.yesterdayDate})
                      </span>
                    )}
                  </>
                )}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={
                      syncLoading ||
                      loading ||
                      cancellingSync ||
                      activeSync?.status === 'running' ||
                      activeSync?.status === 'pending' ||
                      activeSync?.status === 'cancelling'
                    }
                    className="border-l-0 border-slate-300 text-slate-700 hover:bg-slate-50 rounded-l-none px-2"
                    title="Opções de busca no ERP"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="text-xs text-slate-500 font-medium">
                    Filtro de busca por data
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleSyncFlexSmart()}
                    className="cursor-pointer text-xs py-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-slate-800 flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                        Buscar desde ontem (Padrão)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {activeSync?.yesterdayDate
                          ? `Clientes alterados a partir de ${activeSync.yesterdayDate}`
                          : 'Busca clientes alterados a partir do dia anterior'}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleSyncFlexSmart({ date: activeSync?.todayDate })}
                    className="cursor-pointer text-xs py-2 text-indigo-950"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-indigo-600 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Buscar pela data de hoje
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {activeSync?.todayDate
                          ? `Clientes alterados a partir de hoje (${activeSync.todayDate})`
                          : 'Busca apenas clientes alterados no dia corrente'}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsDatePickerDialogOpen(true)}
                    className="cursor-pointer text-xs py-2 bg-indigo-50/50 hover:bg-indigo-50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-indigo-700 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-600" />
                        Carga dia a dia (selecionar data inicial...)
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Escolha a data inicial e execute a carga dia a dia até hoje.
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSyncFlexSmart({ mode: 'day_by_day', startDate: '01/09/2026' })
                    }
                    className="cursor-pointer text-xs py-1.5 text-slate-600 hover:text-slate-900"
                  >
                    <span className="text-[11px] text-slate-500 pl-5">
                      Ou iniciar direto desde 01/09/2026 → hoje
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <Button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Cliente
          </Button>
        </div>
      </div>
      {/* Card de Progresso / Status do FlexSmart */}
      {activeSync && (
        <Card
          className={
            activeSync.status === 'error'
              ? 'border-red-200 bg-red-50/50 shadow-xs'
              : activeSync.status === 'cancelled'
                ? 'border-amber-200 bg-amber-50/40 shadow-xs'
                : activeSync.status === 'cancelling'
                  ? 'border-amber-300 bg-amber-50/50 shadow-xs'
                  : activeSync.status === 'done'
                    ? 'border-emerald-200 bg-emerald-50/40 shadow-xs'
                    : 'border-indigo-200 bg-indigo-50/40 shadow-xs'
          }
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                {activeSync.status === 'cancelling' ? (
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                ) : activeSync.status === 'running' || activeSync.status === 'pending' ? (
                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
                ) : activeSync.status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : activeSync.status === 'cancelled' ? (
                  <Ban className="w-5 h-5 text-amber-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">
                      Integração FlexSmart ERP
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        activeSync.status === 'done'
                          ? 'bg-emerald-100/70 text-emerald-800 border-emerald-300 text-[11px]'
                          : activeSync.status === 'error'
                            ? 'bg-red-100/70 text-red-800 border-red-300 text-[11px]'
                            : activeSync.status === 'cancelled'
                              ? 'bg-amber-100/80 text-amber-800 border-amber-300 text-[11px]'
                              : activeSync.status === 'cancelling'
                                ? 'bg-amber-100 text-amber-900 border-amber-300 text-[11px]'
                                : 'bg-indigo-100/70 text-indigo-800 border-indigo-300 text-[11px]'
                      }
                    >
                      {activeSync.status === 'pending' && 'Aguardando'}
                      {activeSync.status === 'running' && 'Em andamento'}
                      {activeSync.status === 'cancelling' && 'Interrompendo...'}
                      {activeSync.status === 'cancelled' && 'Interrompido'}
                      {activeSync.status === 'done' && 'Concluído'}
                      {activeSync.status === 'error' && 'Falha'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {activeSync.currentStep ||
                      (activeSync.status === 'done'
                        ? 'Sincronização concluída com sucesso!'
                        : activeSync.status === 'cancelled'
                          ? 'Importação interrompida pelo usuário.'
                          : activeSync.status === 'cancelling'
                            ? 'Interrompendo importação...'
                            : activeSync.status === 'error'
                              ? activeSync.error || 'Ocorreu um erro no ERP'
                              : 'Processando...')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Botão para interromper importação enquanto estiver em execução */}
                {(activeSync.status === 'running' || activeSync.status === 'pending') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelSync}
                    disabled={cancellingSync}
                    className="text-xs font-medium text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 h-8 gap-1.5 shadow-2xs"
                    title="Interromper importação de clientes do ERP FlexSmart"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Interromper importação
                  </Button>
                )}

                {activeSync.status === 'cancelling' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="text-xs font-medium text-amber-700 border-amber-300 bg-amber-50/60 h-8 gap-1.5"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Interrompendo...
                  </Button>
                )}

                {(activeSync.status === 'done' ||
                  activeSync.status === 'cancelled' ||
                  activeSync.status === 'error') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveSync(null)}
                    className="text-xs text-slate-500 hover:text-slate-800 h-7 px-2"
                  >
                    Fechar
                  </Button>
                )}
              </div>
            </div>

            {/* Barra de Progresso quando em execução, interrompendo, cancelado ou concluído */}
            {(activeSync.status === 'running' ||
              activeSync.status === 'pending' ||
              activeSync.status === 'cancelling' ||
              activeSync.status === 'cancelled' ||
              activeSync.status === 'done') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>
                    {activeSync.syncMode === 'day_by_day' || activeSync.isFullSync ? (
                      <>
                        {activeSync.status === 'done'
                          ? `Todos os ${activeSync.totalDays ?? activeSync.processedDays ?? 0} dias concluídos (${activeSync.syncStartDate || 'início'} → hoje)`
                          : activeSync.currentDayDate
                            ? `Dia ${activeSync.currentDayDate} — ${
                                activeSync.status === 'running'
                                  ? Math.min(
                                      (activeSync.processedDays ?? 0) + 1,
                                      activeSync.totalDays ?? 1,
                                    )
                                  : (activeSync.processedDays ?? 0)
                              } de ${activeSync.totalDays ?? '?'} dias`
                            : activeSync.totalDays
                              ? `${activeSync.processedDays ?? 0} de ${activeSync.totalDays} dias`
                              : 'Processando dias'}{' '}
                        ({activeSync.createdCount} novos, {activeSync.updatedCount} atualizados
                        acumulados)
                      </>
                    ) : activeSync.count > 0 ? (
                      `${activeSync.imported} de ${activeSync.count} processados (${activeSync.createdCount} novos, ${activeSync.updatedCount} atualizados)`
                    ) : (
                      'Carregando dados do ERP...'
                    )}
                  </span>
                  <span className="font-semibold">{activeSync.percent}%</span>
                </div>
                <Progress
                  value={activeSync.percent}
                  className={`h-2 ${
                    activeSync.status === 'cancelled'
                      ? 'bg-amber-100 [&>div]:bg-amber-500'
                      : activeSync.status === 'cancelling'
                        ? 'bg-amber-100 [&>div]:bg-amber-500'
                        : 'bg-slate-200'
                  }`}
                />
              </div>
            )}

            {/* Resumo quando interrompido */}
            {activeSync.status === 'cancelled' && (
              <div className="text-xs text-amber-800 bg-amber-100/60 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
                <span>
                  Processamento interrompido.{' '}
                  {activeSync.syncMode === 'day_by_day' || activeSync.isFullSync ? (
                    <>
                      Parado no fim do dia{' '}
                      <strong>{activeSync.currentDayDate || 'em curso'}</strong> (
                      {activeSync.processedDays ?? 0} de {activeSync.totalDays ?? '?'} dias
                      verificados). Todos os <strong>{activeSync.imported}</strong> cliente(s)
                      processados ({activeSync.createdCount} novos, {activeSync.updatedCount}{' '}
                      atualizados) foram preservados com sucesso no banco.
                    </>
                  ) : (
                    <>
                      Todos os <strong>{activeSync.imported}</strong> cliente(s) importados até a
                      parada ({activeSync.createdCount} novos, {activeSync.updatedCount}{' '}
                      atualizados) foram preservados com sucesso no banco.
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Mensagem detalhada de erro real se houver */}
            {activeSync.status === 'error' && activeSync.error && (
              <div className="text-xs text-red-700 bg-red-100/70 border border-red-200 rounded-lg p-2.5 break-words font-mono">
                {activeSync.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Barra de Busca */}{' '}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
        <Input
          type="text"
          placeholder="Buscar por nome, razão social, código ERP, CPF/CNPJ, contatos, e-mails ou cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-auto placeholder:text-slate-400"
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch('')}
            className="text-xs text-slate-400 hover:text-slate-600 h-7 px-2"
          >
            Limpar
          </Button>
        )}
      </div>
      {/* Conteúdo Principal */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500">Carregando lista de clientes...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        /* Empty State */
        <Card className="rounded-xl border border-slate-200/80 shadow-xs">
          <CardContent className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-100">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search
                ? `Nenhum resultado corresponde à busca "${search}". Tente outro termo.`
                : 'Cadastre seu primeiro cliente para começar a emitir e acompanhar cobranças.'}
            </p>
            <div className="mt-5">
              {search ? (
                <Button variant="outline" onClick={() => setSearch('')} size="sm">
                  Limpar busca
                </Button>
              ) : (
                <Button
                  onClick={handleOpenCreate}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Cadastrar cliente
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tabela Desktop / Tablet (>640px) */}
          <div className="hidden sm:block bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">Código</th>
                    <th className="py-3.5 px-5">Cliente / Razão Social</th>
                    <th className="py-3.5 px-5">CPF / CNPJ</th>
                    <th className="py-3.5 px-5">Contatos</th>
                    <th className="py-3.5 px-5">E-mails</th>
                    <th className="py-3.5 px-5">Cidade / Estado</th>
                    <th className="py-3.5 px-4 text-center">Cobranças</th>
                    <th className="py-3.5 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client, index) => {
                    const count = chargeCountMap.get(client.id) || 0
                    const cod = client.cod_cliente || client.erp_code
                    const nome = client.nome_cliente || client.name || 'Cliente'
                    const razao = client.razao_social
                    const doc = client.cnpj_cpf || client.document
                    const c1 = client.contato1 || client.phone
                    const c2 = client.contato2
                    const em1 = client.email1 || client.email
                    const em2 = client.email2
                    const em3 = client.email3
                    const cid = client.cidade || client.city
                    const est = client.estado || client.state
                    const bai = client.bairro

                    return (
                      <tr
                        key={client.id}
                        className={
                          index % 2 === 1
                            ? 'bg-slate-50/40 hover:bg-slate-100/60 transition-colors'
                            : 'hover:bg-slate-100/60 transition-colors'
                        }
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {cod ? (
                            <span
                              className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50/80 text-indigo-700 border border-indigo-200/70"
                              title={`Código ERP (cd_cliente): ${cod}`}
                            >
                              <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
                              {cod}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <ClientAvatar name={nome} size="md" />
                            <div className="min-w-0 max-w-[240px]">
                              <p
                                className="font-semibold text-slate-900 text-sm truncate"
                                title={nome}
                              >
                                {nome}
                              </p>
                              {razao && razao !== nome ? (
                                <p
                                  className="text-slate-500 text-xs truncate"
                                  title={`Razão Social: ${razao}`}
                                >
                                  {razao}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          {doc ? (
                            <span className="font-mono text-slate-700">{formatDocument(doc)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-slate-600 whitespace-nowrap">
                          {c1 || c2 ? (
                            <div className="space-y-0.5">
                              {c1 && (
                                <span className="flex items-center gap-1.5 text-xs">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  {formatPhone(c1)}
                                </span>
                              )}
                              {c2 && (
                                <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  {formatPhone(c2)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-slate-600">
                          {em1 || em2 || em3 ? (
                            <div className="space-y-0.5 max-w-[200px]">
                              {em1 && (
                                <p
                                  className="text-xs text-slate-700 truncate flex items-center gap-1"
                                  title={em1}
                                >
                                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                  {em1}
                                </p>
                              )}
                              {em2 && (
                                <p className="text-[11px] text-slate-500 truncate" title={em2}>
                                  {em2}
                                </p>
                              )}
                              {em3 && (
                                <p className="text-[11px] text-slate-400 truncate" title={em3}>
                                  {em3}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Sem email</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-slate-600 whitespace-nowrap">
                          {cid || est ? (
                            <div className="space-y-0.5">
                              <span className="flex items-center gap-1 font-medium text-slate-800">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {[cid, est].filter(Boolean).join(' - ')}
                              </span>
                              {bai && (
                                <span
                                  className="text-[11px] text-slate-500 pl-4.5 block truncate max-w-[140px]"
                                  title={bai}
                                >
                                  {bai}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200">
                            <Receipt className="w-3 h-3 text-slate-500" />
                            {count}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(client)}
                              className="w-8 h-8 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                              title="Editar cliente"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDelete(client)}
                              className="w-8 h-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                              title="Excluir cliente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Versão Mobile (Cards Empilhados <=640px) */}
          <div className="sm:hidden space-y-3">
            {filteredClients.map((client) => {
              const count = chargeCountMap.get(client.id) || 0
              const cod = client.cod_cliente || client.erp_code
              const nome = client.nome_cliente || client.name || 'Cliente'
              const razao = client.razao_social
              const doc = client.cnpj_cpf || client.document
              const c1 = client.contato1 || client.phone
              const c2 = client.contato2
              const em1 = client.email1 || client.email
              const cid = client.cidade || client.city
              const est = client.estado || client.state
              const bai = client.bairro

              return (
                <Card key={client.id} className="rounded-xl border border-slate-200/80 shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <ClientAvatar name={nome} size="md" />
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-900 text-sm truncate">{nome}</h4>
                          {razao && razao !== nome ? (
                            <p className="text-xs text-slate-500 truncate">{razao}</p>
                          ) : null}
                          <p className="text-xs text-slate-500 truncate">{em1 || 'Sem email'}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 shrink-0">
                        <Receipt className="w-3 h-3 text-slate-500" />
                        {count}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Código</span>
                        {cod ? (
                          <span className="font-mono font-semibold text-indigo-700">#{cod}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Documento</span>
                        <span className="font-mono text-slate-700 truncate block">
                          {doc ? formatDocument(doc) : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Contato</span>
                        <span className="text-slate-700 truncate block">
                          {c1 ? formatPhone(c1) : c2 ? formatPhone(c2) : '-'}
                        </span>
                      </div>
                    </div>

                    {(cid || est || bai) && (
                      <div className="text-xs text-slate-600 flex items-center gap-1 pt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {[cid, est].filter(Boolean).join(' - ')}
                          {bai ? ` (${bai})` : ''}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(client)}
                        className="text-xs h-8 gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDelete(client)}
                        className="text-xs h-8 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Paginação Desktop e Mobile */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Mostrando{' '}
                <strong className="text-slate-900">
                  {totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </strong>{' '}
                a{' '}
                <strong className="text-slate-900">
                  {Math.min(currentPage * pageSize, totalItems)}
                </strong>{' '}
                de <strong className="text-slate-900">{totalItems}</strong> clientes
              </span>

              <span className="text-slate-300">|</span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="mr-2 text-slate-500">
                Página <strong className="text-slate-900">{currentPage}</strong> de{' '}
                <strong className="text-slate-900">{totalPages}</strong>
              </span>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1 || loading}
                className="w-8 h-8 text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                title="Primeira página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loading}
                className="w-8 h-8 text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="w-8 h-8 text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                title="Próxima página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages || loading}
                className="w-8 h-8 text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                title="Última página"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
      {/* Modal de Criação / Edição */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && handleCloseForm()}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editingClient
                ? 'Atualize as informações cadastrais do cliente.'
                : 'Preencha os dados abaixo para cadastrar um novo cliente.'}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitForm} className="space-y-4 pt-2">
            {/* Bloco 1: Identificação principal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="c-cod-cliente" className="text-xs font-semibold text-slate-700">
                  Código ERP (cod_cliente)
                </Label>
                <Input
                  id="c-cod-cliente"
                  value={formData.cod_cliente || ''}
                  onChange={(e) => setFormData({ ...formData, cod_cliente: e.target.value })}
                  placeholder="Ex: 20445"
                  className="mt-1 text-sm font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="c-nome-cliente" className="text-xs font-semibold text-slate-700">
                  Nome do cliente
                </Label>
                <Input
                  id="c-nome-cliente"
                  value={formData.nome_cliente || ''}
                  onChange={(e) => setFormData({ ...formData, nome_cliente: e.target.value })}
                  placeholder="Ex: Auto Peças Modelo Ltda"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-razao-social" className="text-xs font-semibold text-slate-700">
                  Razão social
                </Label>
                <Input
                  id="c-razao-social"
                  value={formData.razao_social || ''}
                  onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                  placeholder="Ex: Auto Peças Modelo Comércio Ltda"
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="c-cnpj-cpf" className="text-xs font-semibold text-slate-700">
                  CPF / CNPJ <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="c-cnpj-cpf"
                  value={formData.cnpj_cpf || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, cnpj_cpf: formatDocument(e.target.value) })
                  }
                  placeholder="00.000.000/0000-00 ou CPF"
                  className="mt-1 text-sm"
                  required
                />
              </div>
            </div>

            {/* Bloco 2: Contatos telefônicos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <Label htmlFor="c-contato1" className="text-xs font-semibold text-slate-700">
                  Contato 1 (Celular / Whats / Fone)
                </Label>
                <Input
                  id="c-contato1"
                  value={formData.contato1 || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, contato1: formatPhone(e.target.value) })
                  }
                  placeholder="(11) 98765-4321"
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="c-contato2" className="text-xs font-semibold text-slate-700">
                  Contato 2 (Secundário / Comercial)
                </Label>
                <Input
                  id="c-contato2"
                  value={formData.contato2 || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, contato2: formatPhone(e.target.value) })
                  }
                  placeholder="(11) 3333-4444"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            {/* Bloco 3: Três e-mails do CSV */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                E-mails para cobrança / contato
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <Label htmlFor="c-email1" className="text-xs font-semibold text-slate-700">
                    E-mail 1 (Principal)
                  </Label>
                  <Input
                    id="c-email1"
                    type="email"
                    value={formData.email1 || ''}
                    onChange={(e) => setFormData({ ...formData, email1: e.target.value })}
                    placeholder="financeiro@empresa.com"
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="c-email2" className="text-xs font-semibold text-slate-700">
                    E-mail 2
                  </Label>
                  <Input
                    id="c-email2"
                    type="email"
                    value={formData.email2 || ''}
                    onChange={(e) => setFormData({ ...formData, email2: e.target.value })}
                    placeholder="compras@empresa.com"
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="c-email3" className="text-xs font-semibold text-slate-700">
                    E-mail 3
                  </Label>
                  <Input
                    id="c-email3"
                    type="email"
                    value={formData.email3 || ''}
                    onChange={(e) => setFormData({ ...formData, email3: e.target.value })}
                    placeholder="diretoria@empresa.com"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Bloco 4: Localização (Estado, Cidade, Bairro) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
              <div>
                <Label htmlFor="c-estado" className="text-xs font-semibold text-slate-700">
                  Estado (UF)
                </Label>
                <Input
                  id="c-estado"
                  value={formData.estado || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, estado: e.target.value.toUpperCase().slice(0, 2) })
                  }
                  placeholder="SP"
                  maxLength={2}
                  className="mt-1 text-sm uppercase"
                />
              </div>

              <div>
                <Label htmlFor="c-cidade" className="text-xs font-semibold text-slate-700">
                  Cidade
                </Label>
                <Input
                  id="c-cidade"
                  value={formData.cidade || ''}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  placeholder="Ex: São Paulo"
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="c-bairro" className="text-xs font-semibold text-slate-700">
                  Bairro
                </Label>
                <Input
                  id="c-bairro"
                  value={formData.bairro || ''}
                  onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  placeholder="Ex: Centro"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseForm}
                disabled={formLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                {formLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : editingClient ? (
                  'Salvar alterações'
                ) : (
                  'Salvar'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={isDeleteOpen} onOpenChange={(open) => !open && handleCloseDelete()}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900">
              Excluir cliente?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Tem certeza? Esta ação também excluirá as cobranças deste cliente.
            </DialogDescription>
          </DialogHeader>

          {deletingClient && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <p className="font-semibold text-slate-800">
                {deletingClient.nome_cliente || deletingClient.razao_social || deletingClient.name}
              </p>
              {deletingClient.razao_social && (
                <p className="text-slate-500">Razão Social: {deletingClient.razao_social}</p>
              )}
              <p className="text-slate-500">
                {deletingClient.email1 || deletingClient.email || 'Sem email'}
              </p>
              <p className="text-red-600 font-medium pt-1">
                {chargeCountMap.get(deletingClient.id) || 0} cobrança(s) vinculada(s)
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={handleCloseDelete} disabled={formLoading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={formLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {formLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Modal para Selecionar Data Inicial da Carga Dia a Dia */}
      <Dialog open={isDatePickerDialogOpen} onOpenChange={setIsDatePickerDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 border border-indigo-100">
              <Calendar className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900">
              Carga dia a dia — Selecionar data inicial
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha a data de início da carga. O sistema buscará os clientes alterados dia a dia,
              em ordem cronológica sequencial, desde esta data até hoje.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="start-date-input" className="text-xs font-semibold text-slate-700">
                Data inicial
              </Label>
              <Input
                id="start-date-input"
                type="date"
                value={selectedStartDate}
                max={
                  activeSync?.todayDate
                    ? activeSync.todayDate.split('/').reverse().join('-')
                    : new Date().toISOString().split('T')[0]
                }
                onChange={(e) => setSelectedStartDate(e.target.value)}
                className="mt-1 text-sm"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Data selecionada:{' '}
                <strong className="text-slate-700">{formatISOToBR(selectedStartDate)}</strong> → até{' '}
                <strong className="text-slate-700">{activeSync?.todayDate || 'hoje'}</strong>
              </p>
            </div>

            {/* Atalhos rápidos de data */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-600 block">
                Atalhos rápidos:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStartDate('2026-09-01')}
                  className="text-xs h-7 px-2.5 bg-slate-50 hover:bg-slate-100"
                >
                  01/09/2026 (Início de Setembro)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStartDate('2026-10-01')}
                  className="text-xs h-7 px-2.5 bg-slate-50 hover:bg-slate-100"
                >
                  01/10/2026 (Início de Outubro)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const d = new Date()
                    d.setDate(d.getDate() - 7)
                    setSelectedStartDate(d.toISOString().split('T')[0])
                  }}
                  className="text-xs h-7 px-2.5 bg-slate-50 hover:bg-slate-100"
                >
                  Últimos 7 dias
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const d = new Date()
                    d.setDate(d.getDate() - 30)
                    setSelectedStartDate(d.toISOString().split('T')[0])
                  }}
                  className="text-xs h-7 px-2.5 bg-slate-50 hover:bg-slate-100"
                >
                  Últimos 30 dias
                </Button>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Como funciona a carga dia a dia:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-900/90">
                <li>Faz uma requisição ao ERP para cada dia do período selecionado.</li>
                <li>Clientes existentes são atualizados; novos são cadastrados.</li>
                <li>
                  Você pode acompanhar a barra de progresso e interromper a qualquer momento sem
                  perder dados.
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDatePickerDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                const brDate = formatISOToBR(selectedStartDate)
                setIsDatePickerDialogOpen(false)
                handleSyncFlexSmart({
                  mode: 'day_by_day',
                  startDate: brDate,
                })
              }}
              disabled={!selectedStartDate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              <Database className="w-4 h-4 mr-1.5" />
              Iniciar Carga Dia a Dia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
