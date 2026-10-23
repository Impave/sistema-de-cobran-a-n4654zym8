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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

  // Modais de Criação/Edição e Exclusão
  const [searchParams, setSearchParams] = useSearchParams()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null)

  // Form state
  const [formData, setFormData] = useState<ClientFormData>({
    name: '',
    email: '',
    document: '',
    phone: '',
    address: '',
    city: '',
    state: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [cancellingSync, setCancellingSync] = useState(false)
  const [activeSync, setActiveSync] = useState<FlexSmartSyncStatus | null>(null)

  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [allClients, allCharges] = await Promise.all([
        clientsService.getAll(),
        chargesService.getAll(),
      ])
      setClients(allClients)
      setCharges(allCharges)
    } catch (err) {
      console.error('Erro ao carregar clientes:', err)
    } finally {
      setLoading(false)
    }
  }, [])

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
        name: '',
        email: '',
        document: '',
        phone: '',
        address: '',
        city: '',
        state: '',
      })
      setIsFormOpen(true)
    } else if (editId && clients.length > 0) {
      const found = clients.find((c) => c.id === editId)
      if (found) {
        setEditingClient(found)
        setFormData({
          name: found.name,
          email: found.email || '',
          document: formatDocument(found.document),
          phone: formatPhone(found.phone),
          address: found.address || '',
          city: found.city || '',
          state: found.state || '',
        })
        setIsFormOpen(true)
      }
    }
  }, [searchParams, clients])

  const handleOpenCreate = () => {
    setEditingClient(null)
    setFormData({
      name: '',
      email: '',
      document: '',
      phone: '',
      address: '',
      city: '',
      state: '',
    })
    setFormError(null)
    setIsFormOpen(true)
    setSearchParams({ new: 'true' })
  }

  const handleOpenEdit = (client: ClientRecord) => {
    setEditingClient(client)
    setFormData({
      name: client.name,
      email: client.email || '',
      document: formatDocument(client.document),
      phone: formatPhone(client.phone),
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
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

    if (!formData.name || formData.name.trim().length < 2) {
      setFormError('O nome do cliente é obrigatório e deve ter no mínimo 2 caracteres.')
      return
    }

    setFormLoading(true)
    try {
      if (editingClient) {
        await clientsService.update(editingClient.id, formData)
        toast({
          title: 'Cliente atualizado',
          description: `Os dados de ${formData.name} foram atualizados com sucesso.`,
        })
      } else {
        await clientsService.create(formData)
        toast({
          title: 'Cliente cadastrado',
          description: `${formData.name} foi adicionado à sua base de clientes.`,
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
    try {
      await clientsService.delete(deletingClient.id)
      toast({
        title: 'Cliente excluído',
        description: `O cliente ${deletingClient.name} e suas cobranças vinculadas foram removidos.`,
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
          // Se tiver um job concluído recente ou em andamento, armazena
          setActiveSync(res.lastSync)
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

    const interval = setInterval(async () => {
      try {
        const status = await clientsService.getFlexSmartSyncStatus(activeSync.id)
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
      setActiveSync((prev) =>
        prev
          ? {
              ...prev,
              status: res.status === 'cancelled' ? 'cancelled' : 'cancelling',
              currentStep: 'Interrupção solicitada pelo usuário...',
            }
          : null,
      )
      toast({
        title: 'Interrupção solicitada',
        description:
          res.message || 'Interrompendo importação... Os clientes já salvos serão mantidos.',
      })
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

  // Sincronização com o ERP FlexSmart (início assíncrono com barra de progresso)
  const handleSyncFlexSmart = async () => {
    setSyncLoading(true)
    try {
      const res = await clientsService.startFlexSmartSync()
      if (res.syncId) {
        // Inicializa o activeSync para iniciar o polling imediatamente
        setActiveSync({
          id: res.syncId,
          status: 'pending',
          currentStep: 'Iniciando importação do ERP...',
          count: 0,
          imported: 0,
          createdCount: 0,
          updatedCount: 0,
          percent: 0,
        })
        toast({
          title: 'Sincronização iniciada',
          description: 'A importação do FlexSmart está sendo processada em segundo plano.',
        })
      }
    } catch (err: unknown) {
      setSyncLoading(false)
      const msg = getErrorMessage(err)
      console.error('[ClientsPage] Erro ao iniciar sincronização:', err)
      toast({
        title: 'Falha ao iniciar sincronização',
        description:
          msg && msg !== 'Something went wrong.'
            ? msg
            : 'Não foi possível conectar ao ERP FlexSmart.',
        variant: 'destructive',
      })
    }
  }

  // Filtro de busca por nome, email ou documento
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients

    return clients.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(q)
      const emailMatch = c.email?.toLowerCase().includes(q)
      const docMatch = c.document?.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
      const phoneMatch = c.phone?.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
      return nameMatch || emailMatch || docMatch || phoneMatch
    })
  }, [clients, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie sua carteira de clientes, dados cadastrais e histórico de cobranças
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <Button
            type="button"
            variant="outline"
            onClick={handleSyncFlexSmart}
            disabled={
              syncLoading ||
              loading ||
              cancellingSync ||
              activeSync?.status === 'running' ||
              activeSync?.status === 'pending' ||
              activeSync?.status === 'cancelling'
            }
            className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium shadow-xs"
            title="Sincronizar cadastros de clientes a partir do ERP FlexSmart"
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
                Importar do ERP FlexSmart
              </>
            )}
          </Button>

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
                    {activeSync.count > 0
                      ? `${activeSync.imported} de ${activeSync.count} processados (${activeSync.createdCount} novos, ${activeSync.updatedCount} atualizados)`
                      : 'Carregando lista de clientes do ERP...'}
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
                  Processamento interrompido. Todos os <strong>{activeSync.imported}</strong>{' '}
                  cliente(s) importados até a parada ({activeSync.createdCount} novos,{' '}
                  {activeSync.updatedCount} atualizados) foram preservados com sucesso no banco.
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
        <Search className="w-4 h-4 text-slate-400 ml-1" />
        <Input
          type="text"
          placeholder="Buscar por nome, email, CPF ou CNPJ..."
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
                    <th className="py-3.5 px-6">Cliente</th>
                    <th className="py-3.5 px-6">Documento</th>
                    <th className="py-3.5 px-6">Telefone</th>
                    <th className="py-3.5 px-6">Localização</th>
                    <th className="py-3.5 px-6 text-center">Cobranças</th>
                    <th className="py-3.5 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client, index) => {
                    const count = chargeCountMap.get(client.id) || 0
                    return (
                      <tr
                        key={client.id}
                        className={
                          index % 2 === 1
                            ? 'bg-slate-50/40 hover:bg-slate-100/60 transition-colors'
                            : 'hover:bg-slate-100/60 transition-colors'
                        }
                      >
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <ClientAvatar name={client.name} size="md" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-900 text-sm truncate">
                                  {client.name}
                                </p>
                                {client.erp_code && (
                                  <Badge
                                    variant="outline"
                                    className="bg-indigo-50/70 text-indigo-700 border-indigo-200/80 text-[10px] px-1.5 py-0 h-4 font-semibold tracking-wide shrink-0 inline-flex items-center gap-0.5"
                                    title={`Cliente sincronizado via FlexSmart ERP (Cód: ${client.erp_code})`}
                                  >
                                    <Building2 className="w-2.5 h-2.5 text-indigo-500" />
                                    ERP
                                  </Badge>
                                )}
                              </div>
                              {client.email ? (
                                <p className="text-slate-500 text-xs truncate flex items-center gap-1 mt-0.5">
                                  <Mail className="w-3 h-3 text-slate-400 inline shrink-0" />
                                  {client.email}
                                </p>
                              ) : (
                                <p className="text-slate-400 text-xs italic">Sem email</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="font-mono text-slate-700">
                            {formatDocument(client.document)}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-slate-600">
                          {client.phone ? (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              {formatPhone(client.phone)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-slate-600">
                          {client.city || client.state ? (
                            <span className="flex items-center gap-1 truncate max-w-[150px]">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {[client.city, client.state].filter(Boolean).join(' - ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200">
                            <Receipt className="w-3 h-3 text-slate-500" />
                            {count}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
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
              return (
                <Card key={client.id} className="rounded-xl border border-slate-200/80 shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <ClientAvatar name={client.name} size="md" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-semibold text-slate-900 text-sm">{client.name}</h4>
                            {client.erp_code && (
                              <Badge
                                variant="outline"
                                className="bg-indigo-50/70 text-indigo-700 border-indigo-200/80 text-[10px] px-1.5 py-0 h-4 font-semibold tracking-wide shrink-0 inline-flex items-center gap-0.5"
                                title={`Cliente sincronizado via FlexSmart ERP (Cód: ${client.erp_code})`}
                              >
                                <Building2 className="w-2.5 h-2.5 text-indigo-500" />
                                ERP
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{client.email || 'Sem email'}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200">
                        <Receipt className="w-3 h-3 text-slate-500" />
                        {count}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Documento</span>
                        <span className="font-mono text-slate-700">
                          {formatDocument(client.document)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Telefone</span>
                        <span className="text-slate-700">{formatPhone(client.phone)}</span>
                      </div>
                    </div>

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
            <div>
              <Label htmlFor="c-name" className="text-xs font-semibold text-slate-700">
                Nome completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="c-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Maria Oliveira ou Empresa XYZ"
                className="mt-1 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-email" className="text-xs font-semibold text-slate-700">
                  Email
                </Label>
                <Input
                  id="c-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="cliente@email.com"
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="c-document" className="text-xs font-semibold text-slate-700">
                  Documento (CPF / CNPJ)
                </Label>
                <Input
                  id="c-document"
                  value={formData.document}
                  onChange={(e) =>
                    setFormData({ ...formData, document: formatDocument(e.target.value) })
                  }
                  placeholder="000.000.000-00 ou CNPJ"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-phone" className="text-xs font-semibold text-slate-700">
                  Telefone / WhatsApp
                </Label>
                <Input
                  id="c-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                  placeholder="(11) 98765-4321"
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="c-address" className="text-xs font-semibold text-slate-700">
                  Endereço
                </Label>
                <Input
                  id="c-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Rua, número, complemento"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-city" className="text-xs font-semibold text-slate-700">
                  Cidade
                </Label>
                <Input
                  id="c-city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Ex: São Paulo"
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="c-state" className="text-xs font-semibold text-slate-700">
                  Estado (UF)
                </Label>
                <Input
                  id="c-state"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value.toUpperCase().slice(0, 2) })
                  }
                  placeholder="SP"
                  maxLength={2}
                  className="mt-1 text-sm uppercase"
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
              <p className="font-semibold text-slate-800">{deletingClient.name}</p>
              <p className="text-slate-500">{deletingClient.email || 'Sem email'}</p>
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
    </div>
  )
}
