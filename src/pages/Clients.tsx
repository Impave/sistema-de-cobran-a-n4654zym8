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
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { FlexSmartSyncCard } from '@/components/FlexSmartSyncCard'
import { clientsService } from '@/services/clients'
import { chargesService } from '@/services/charges'
import { flexSmartService } from '@/services/flexsmart'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import type { ClientRecord, ClientFormData, ChargeRecord, FlexSmartSyncStatus } from '@/types'
import { formatDocument, formatPhone } from '@/lib/formatters'

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

  // Estado da última sincronização FlexSmart
  const [lastSync, setLastSync] = useState<FlexSmartSyncStatus | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)

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

  // Carrega status da última sincronização do FlexSmart
  const loadLastSync = useCallback(async () => {
    try {
      setSyncLoading(true)
      const status = await flexSmartService.getLastSync()
      setLastSync(status)
    } catch (err) {
      console.warn('Erro ao carregar última sincronização FlexSmart:', err)
    } finally {
      setSyncLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    loadLastSync()
  }, [loadData, loadLastSync])

  // Polling leve a cada 15 segundos para atualizar a sincronização horária e status em andamento
  useEffect(() => {
    const interval = setInterval(() => {
      loadLastSync()
    }, 15000)
    return () => clearInterval(interval)
  }, [loadLastSync])

  // Real-time para clientes, cobranças e sincronizações do FlexSmart
  useRealtime('clients', () => {
    loadData()
  })
  useRealtime('charges', () => {
    loadData()
  })
  useRealtime('flex_sync', () => {
    loadLastSync()
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

  // A lista já é filtrada e paginada pelo servidor
  const filteredClients = clients

  return (
    <div className="space-y-6">
      {/* Card da Última Sincronização FlexSmart (no topo da tela, antes de tudo) */}
      <FlexSmartSyncCard lastSync={lastSync} loading={syncLoading} onRefresh={loadLastSync} />
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
        <div className="flex items-center gap-2">
          <Button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Cliente
          </Button>
        </div>
      </div>
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
    </div>
  )
}
