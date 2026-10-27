import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Receipt,
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Calendar,
  Filter,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { ClientAvatar } from '@/components/ClientAvatar'
import { chargesService } from '@/services/charges'
import { clientsService } from '@/services/clients'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import type { ChargeRecord, ClientRecord, ChargeFormData, ChargeStatus } from '@/types'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'

export default function ChargesPage() {
  const [charges, setCharges] = useState<ChargeRecord[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [periodFilter, setPeriodFilter] = useState<string>('all')

  // Modais
  const [searchParams, setSearchParams] = useSearchParams()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCharge, setEditingCharge] = useState<ChargeRecord | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingCharge, setDeletingCharge] = useState<ChargeRecord | null>(null)

  // Form State
  const defaultDueDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  }, [])

  const [formData, setFormData] = useState<ChargeFormData>({
    client: '',
    description: '',
    amount: 100,
    due_date: defaultDueDate,
    status: 'pending',
  })
  const [amountRaw, setAmountRaw] = useState('100,00')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [allCharges, clientsResp] = await Promise.all([
        chargesService.getAll(),
        clientsService.getList({ page: 1, perPage: 200, sort: 'name' }),
      ])
      setCharges(allCharges)
      setClients(clientsResp.items)
    } catch (err) {
      console.error('Erro ao carregar cobranças:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Real-time
  useRealtime('charges', () => {
    loadData()
  })
  useRealtime('clients', () => {
    loadData()
  })

  const clientMap = useMemo(() => {
    const m = new Map<string, ClientRecord>()
    clients.forEach((c) => m.set(c.id, c))
    return m
  }, [clients])

  // Sincronização de modal via URL
  useEffect(() => {
    const newParam = searchParams.get('new')
    const editId = searchParams.get('edit')

    if (newParam === 'true') {
      setEditingCharge(null)
      setFormData({
        client: clients[0]?.id || '',
        description: '',
        amount: 100,
        due_date: defaultDueDate,
        status: 'pending',
      })
      setAmountRaw('100,00')
      setIsFormOpen(true)
    } else if (editId && charges.length > 0) {
      const found = charges.find((c) => c.id === editId)
      if (found) {
        setEditingCharge(found)
        setFormData({
          client: found.client,
          description: found.description,
          amount: found.amount,
          due_date: found.due_date.split('T')[0].split(' ')[0],
          status: found.status,
        })
        setAmountRaw(found.amount.toFixed(2).replace('.', ','))
        setIsFormOpen(true)
      }
    }
  }, [searchParams, charges, clients, defaultDueDate])

  const handleOpenCreate = () => {
    setEditingCharge(null)
    setFormData({
      client: clients[0]?.id || '',
      description: '',
      amount: 100,
      due_date: defaultDueDate,
      status: 'pending',
    })
    setAmountRaw('100,00')
    setFormError(null)
    setIsFormOpen(true)
    setSearchParams({ new: 'true' })
  }

  const handleOpenEdit = (charge: ChargeRecord) => {
    setEditingCharge(charge)
    setFormData({
      client: charge.client,
      description: charge.description,
      amount: charge.amount,
      due_date: charge.due_date.split('T')[0].split(' ')[0],
      status: charge.status,
    })
    setAmountRaw(charge.amount.toFixed(2).replace('.', ','))
    setFormError(null)
    setIsFormOpen(true)
    setSearchParams({ edit: charge.id })
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setEditingCharge(null)
    setSearchParams({})
  }

  const handleOpenDelete = (charge: ChargeRecord) => {
    setDeletingCharge(charge)
    setIsDeleteOpen(true)
  }

  const handleCloseDelete = () => {
    setIsDeleteOpen(false)
    setDeletingCharge(null)
  }

  // Ação Rápida: Marcar como Pago
  const handleMarkAsPaid = async (charge: ChargeRecord) => {
    try {
      await chargesService.markAsPaid(charge.id)
      toast({
        title: 'Cobrança marcada como paga!',
        description: `O boleto ${charge.number} de ${formatCurrencyBRL(charge.amount)} foi liquidado.`,
      })
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar pagamento.'
      toast({
        title: 'Erro ao liquidar cobrança',
        description: msg,
        variant: 'destructive',
      })
    }
  }

  // Submeter Criação / Edição
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.client) {
      setFormError('Selecione um cliente para vincular a cobrança.')
      return
    }

    if (!formData.description || formData.description.trim().length < 2) {
      setFormError('A descrição da cobrança deve conter no mínimo 2 caracteres.')
      return
    }

    // Processar valor
    const parsedAmount = parseFloat(amountRaw.replace(/\./g, '').replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Informe um valor válido maior que zero.')
      return
    }

    if (!formData.due_date) {
      setFormError('A data de vencimento é obrigatória.')
      return
    }

    setFormLoading(true)
    try {
      const payload: ChargeFormData = {
        ...formData,
        amount: parsedAmount,
      }

      if (editingCharge) {
        await chargesService.update(editingCharge.id, payload)
        toast({
          title: 'Cobrança atualizada',
          description: `A cobrança ${editingCharge.number} foi salva com sucesso.`,
        })
      } else {
        const created = await chargesService.create(payload)
        toast({
          title: 'Cobrança cadastrada',
          description: `Cobrança ${created.number} gerada no valor de ${formatCurrencyBRL(payload.amount)}.`,
        })
      }
      handleCloseForm()
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar cobrança.'
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

  // Exclusão da cobrança
  const handleConfirmDelete = async () => {
    if (!deletingCharge) return
    setFormLoading(true)
    try {
      await chargesService.delete(deletingCharge.id)
      toast({
        title: 'Cobrança excluída',
        description: `A cobrança ${deletingCharge.number} foi removida com sucesso.`,
      })
      handleCloseDelete()
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir cobrança.'
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setFormLoading(false)
    }
  }

  // Filtragem
  const filteredCharges = useMemo(() => {
    return charges.filter((charge) => {
      const client = charge.expand?.client || clientMap.get(charge.client)
      const clientName = (client?.nome_cliente || client?.razao_social || '').toLowerCase()
      const desc = charge.description?.toLowerCase() || ''
      const num = charge.number?.toLowerCase() || ''
      const q = search.trim().toLowerCase()

      // Busca por cliente, descrição ou número
      const matchesSearch = !q || clientName.includes(q) || desc.includes(q) || num.includes(q)
      if (!matchesSearch) return false

      // Filtro de Status
      if (statusFilter !== 'all' && charge.status !== statusFilter) {
        return false
      }

      // Filtro de Período
      if (periodFilter !== 'all') {
        const now = new Date()
        const due = new Date(charge.due_date)

        if (periodFilter === '7days') {
          const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          if (due < now || due > in7) return false
        } else if (periodFilter === '30days') {
          const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          if (due < now || due > in30) return false
        } else if (periodFilter === 'overdue') {
          if (due >= now && charge.status !== 'overdue') return false
        }
      }

      return true
    })
  }, [charges, search, statusFilter, periodFilter, clientMap])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cobranças</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Boletos, prazos de pagamento e acompanhamento de recebíveis
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Nova Cobrança
        </Button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Input de Busca */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <Input
            type="text"
            placeholder="Buscar por cliente, descrição ou COB-..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        {/* Filtros Dropdown */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
          <div className="w-full sm:w-44">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs h-9">
                <div className="flex items-center gap-1.5 truncate">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Status:</span>
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-52">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="text-xs h-9">
                <div className="flex items-center gap-1.5 truncate">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Período:</span>
                  <SelectValue placeholder="Período" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="7days">Vencendo em 7 dias</SelectItem>
                <SelectItem value="30days">Vencendo em 30 dias</SelectItem>
                <SelectItem value="overdue">Já vencidos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(search || statusFilter !== 'all' || periodFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setPeriodFilter('all')
              }}
              className="text-xs text-slate-500 hover:text-slate-800 h-9 px-2"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo da Tabela / Lista */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500">Carregando cobranças...</p>
        </div>
      ) : filteredCharges.length === 0 ? (
        /* Empty State */
        <Card className="rounded-xl border border-slate-200/80 shadow-xs">
          <CardContent className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-100">
              <Receipt className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Nenhuma cobrança encontrada</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search || statusFilter !== 'all' || periodFilter !== 'all'
                ? 'Nenhuma cobrança corresponde aos filtros selecionados. Tente ajustar a busca.'
                : 'Cadastre sua primeira cobrança vinculada a um cliente para acompanhar recebíveis.'}
            </p>
            <div className="mt-5">
              {search || statusFilter !== 'all' || periodFilter !== 'all' ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('all')
                    setPeriodFilter('all')
                  }}
                  size="sm"
                >
                  Limpar filtros
                </Button>
              ) : (
                <Button
                  onClick={handleOpenCreate}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Nova Cobrança
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
                    <th className="py-3.5 px-6">Descrição / Número</th>
                    <th className="py-3.5 px-6 text-right">Valor</th>
                    <th className="py-3.5 px-6">Vencimento</th>
                    <th className="py-3.5 px-6 text-center">Status</th>
                    <th className="py-3.5 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCharges.map((charge, index) => {
                    const client = charge.expand?.client || clientMap.get(charge.client)
                    const clientName = client?.nome_cliente || client?.razao_social || 'Cliente'
                    const isOverdue = charge.status === 'overdue'

                    return (
                      <tr
                        key={charge.id}
                        className={
                          index % 2 === 1
                            ? 'bg-slate-50/40 hover:bg-slate-100/60 transition-colors'
                            : 'hover:bg-slate-100/60 transition-colors'
                        }
                      >
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <ClientAvatar name={clientName} size="sm" />
                            <span className="font-semibold text-slate-900 truncate max-w-[170px]">
                              {clientName}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-6">
                          <div>
                            <p className="text-slate-800 font-medium line-clamp-1">
                              {charge.description}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {charge.number}
                            </p>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right font-semibold text-slate-900 tabular-nums">
                          {formatCurrencyBRL(charge.amount)}
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={
                              isOverdue
                                ? 'text-red-600 font-bold tabular-nums'
                                : 'text-slate-600 font-medium tabular-nums'
                            }
                          >
                            {formatDateBR(charge.due_date)}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <StatusBadge status={charge.status} />
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {charge.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkAsPaid(charge)}
                                className="h-7 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 px-2"
                                title="Marcar como pago"
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Marcar como pago
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(charge)}
                              className="w-7 h-7 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                              title="Editar cobrança"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDelete(charge)}
                              className="w-7 h-7 text-slate-500 hover:text-red-600 hover:bg-red-50"
                              title="Excluir cobrança"
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
            {filteredCharges.map((charge) => {
              const client = charge.expand?.client || clientMap.get(charge.client)
              const clientName = client?.nome_cliente || client?.razao_social || 'Cliente'
              const isOverdue = charge.status === 'overdue'

              return (
                <Card key={charge.id} className="rounded-xl border border-slate-200/80 shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <ClientAvatar name={clientName} size="sm" />
                        <div>
                          <h4 className="font-semibold text-slate-900 text-xs">{clientName}</h4>
                          <span className="text-[10px] font-mono text-slate-400">
                            {charge.number}
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={charge.status} size="sm" />
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-800 line-clamp-2">
                        {charge.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Valor</span>
                        <span className="font-bold text-slate-900 tabular-nums">
                          {formatCurrencyBRL(charge.amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Vencimento</span>
                        <span
                          className={
                            isOverdue
                              ? 'text-red-600 font-bold tabular-nums'
                              : 'text-slate-700 font-medium tabular-nums'
                          }
                        >
                          {formatDateBR(charge.due_date)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-1.5">
                      {charge.status === 'pending' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsPaid(charge)}
                          className="text-[11px] h-7 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 px-2"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Marcar como pago
                        </Button>
                      ) : (
                        <div />
                      )}

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(charge)}
                          className="text-xs h-7 px-2.5"
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDelete(charge)}
                          className="text-xs h-7 px-2 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Modal de Criação / Edição de Cobrança */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && handleCloseForm()}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              {editingCharge ? 'Editar Cobrança' : 'Nova Cobrança'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editingCharge
                ? `Altere os dados da cobrança ${editingCharge.number}.`
                : 'Emita um novo boleto ou registro financeiro para seu cliente.'}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitForm} className="space-y-4 pt-1">
            {/* Cliente */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="charge-client" className="text-xs font-semibold text-slate-700">
                  Cliente <span className="text-red-500">*</span>
                </Label>
                {clients.length === 0 && (
                  <Link
                    to="/clients?new=true"
                    className="text-[11px] text-indigo-600 hover:underline"
                  >
                    + Criar cliente
                  </Link>
                )}
              </div>
              {clients.length === 0 ? (
                <div className="mt-1 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs">
                  Você precisa cadastrar ao menos um cliente antes de lançar cobranças.
                </div>
              ) : (
                <Select
                  value={formData.client}
                  onValueChange={(val) => setFormData({ ...formData, client: val })}
                >
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome_cliente || c.razao_social} {c.cod_cliente ? `[#${c.cod_cliente}]` : ''} {c.email1 ? `(${c.email1})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Descrição */}
            <div>
              <Label htmlFor="charge-desc" className="text-xs font-semibold text-slate-700">
                Descrição <span className="text-red-500">*</span>
              </Label>
              <Input
                id="charge-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Mensalidade de março, Nota Fiscal 1234"
                className="mt-1 text-sm"
                required
              />
            </div>

            {/* Valor com prefixo R$ */}
            <div>
              <Label htmlFor="charge-amount" className="text-xs font-semibold text-slate-700">
                Valor <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">
                  R$
                </span>
                <Input
                  id="charge-amount"
                  type="text"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  placeholder="0,00"
                  className="pl-9 text-sm font-semibold tabular-nums"
                  required
                />
              </div>
            </div>

            {/* Vencimento e Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="charge-due" className="text-xs font-semibold text-slate-700">
                  Vencimento <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="charge-due"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="mt-1 text-sm"
                  required
                />
              </div>

              <div>
                <Label htmlFor="charge-status" className="text-xs font-semibold text-slate-700">
                  Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val as ChargeStatus })}
                >
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
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
                disabled={formLoading || clients.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                {formLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : editingCharge ? (
                  'Salvar alterações'
                ) : (
                  'Salvar cobrança'
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
              Excluir cobrança?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Tem certeza que deseja excluir esta cobrança? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          {deletingCharge && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <p className="font-semibold text-slate-800">{deletingCharge.description}</p>
              <p className="font-mono text-slate-500">{deletingCharge.number}</p>
              <p className="font-bold text-slate-900 pt-1">
                Valor: {formatCurrencyBRL(deletingCharge.amount)}
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
