import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Search,
  Eye,
  Calendar,
  AlertCircle,
  Building2,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Receipt,
  CreditCard,
  User,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { titlesService } from '@/services/titles'
import { useRealtime } from '@/hooks/use-realtime'
import type { TitleRecord } from '@/types'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'

/**
 * Função auxiliar para saber se o título está vencido
 */
function isTitleOverdue(item: TitleRecord): boolean {
  if (item.pagamento) return false
  const sit = (item.situacao || '').toLowerCase()
  if (sit.includes('pago') || sit.includes('liquidado') || sit.includes('cancelado')) {
    return false
  }
  if (item.atraso !== undefined && item.atraso !== null && item.atraso > 0) {
    return true
  }
  if (!item.vencimento) return false
  const due = new Date(item.vencimento)
  const now = new Date()
  return due.getTime() < now.getTime()
}

/**
 * Badge de situação com estilo/cor apropriada
 */
function SituacaoBadge({ situacao, overdue }: { situacao?: string; overdue?: boolean }) {
  const sit = (situacao || 'Pendente').trim()
  const lower = sit.toLowerCase()

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
        {sit || 'Vencido'}
      </span>
    )
  }

  if (lower.includes('pago') || lower.includes('liquidado')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        {sit}
      </span>
    )
  }

  if (lower.includes('cancel')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <XCircle className="w-3 h-3 text-slate-500 shrink-0" />
        {sit}
      </span>
    )
  }

  // Padrão: Pendente (âmbar)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3 text-amber-500 shrink-0" />
      {sit}
    </span>
  )
}

export default function TitlesPage() {
  const [titles, setTitles] = useState<TitleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Paginação server-side
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Modal de Detalhes
  const [selectedTitle, setSelectedTitle] = useState<TitleRecord | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  // Debounce na busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true)
      else setLoading(true)

      try {
        const resp = await titlesService.getList({
          page: currentPage,
          perPage: pageSize,
          search: debouncedSearch,
          sort: '-created',
        })
        setTitles(resp.items)
        setTotalItems(resp.totalItems)
        setTotalPages(resp.totalPages || 1)
      } catch (err) {
        console.error('Erro ao carregar títulos:', err)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [currentPage, pageSize, debouncedSearch],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  // Inscrição em tempo real na coleção titles
  useRealtime('titles', () => {
    loadData()
  })

  const handleOpenDetails = (title: TitleRecord) => {
    setSelectedTitle(title)
    setIsDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
    setSelectedTitle(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Títulos</h1>
            <Badge
              variant="outline"
              className="bg-slate-100 text-slate-700 border-slate-300 text-xs px-2 py-0.5 font-medium tabular-nums"
              title="Total de títulos no contas a receber"
            >
              {totalItems} {totalItems === 1 ? 'título' : 'títulos'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Consulta financeira de títulos a receber do ERP, vencimentos e histórico de pagamentos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Barra de Busca */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
        <Input
          type="text"
          placeholder="Buscar por número, cliente/fornecedor, nosso número formatado, forma de pagamento, portador ou situação..."
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
          <p className="text-sm text-slate-500">Carregando lista de títulos...</p>
        </div>
      ) : titles.length === 0 ? (
        /* Empty State */
        <Card className="rounded-xl border border-slate-200/80 shadow-xs">
          <CardContent className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-100">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {search ? 'Nenhum título encontrado' : 'Nenhum título cadastrado'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search
                ? `Nenhum título corresponde à busca "${search}". Tente outro termo.`
                : 'Os títulos a receber serão importados e sincronizados com a base da Skip Cloud.'}
            </p>
            {search && (
              <div className="mt-5">
                <Button variant="outline" onClick={() => setSearch('')} size="sm">
                  Limpar busca
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tabela Desktop / Tablet (>768px) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">Número</th>
                    <th className="py-3.5 px-3 text-center">Parcela</th>
                    <th className="py-3.5 px-5">Cliente / Fornecedor</th>
                    <th className="py-3.5 px-4">Emissão</th>
                    <th className="py-3.5 px-4">Vencimento</th>
                    <th className="py-3.5 px-3 text-center">Atraso</th>
                    <th className="py-3.5 px-4 text-right">Valor Nominal</th>
                    <th className="py-3.5 px-4 text-right">Saldo Atual</th>
                    <th className="py-3.5 px-4">Forma Pgto</th>
                    <th className="py-3.5 px-4 text-center">Situação</th>
                    <th className="py-3.5 px-4 text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {titles.map((item, index) => {
                    const overdue = isTitleOverdue(item)
                    const atraso = item.atraso ?? 0

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenDetails(item)}
                        className={`cursor-pointer transition-colors ${
                          overdue
                            ? 'bg-red-50/30 hover:bg-red-50/60'
                            : index % 2 === 1
                              ? 'bg-slate-50/40 hover:bg-slate-100/60'
                              : 'hover:bg-slate-100/60'
                        }`}
                      >
                        {/* Número */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono font-semibold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200/70">
                            {item.numero || '—'}
                          </span>
                        </td>

                        {/* Parcela */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap font-mono text-slate-600">
                          {item.parcela || '—'}
                        </td>

                        {/* Cliente/Fornecedor */}
                        <td className="py-3.5 px-5">
                          <div className="max-w-[280px]">
                            <p
                              className="font-semibold text-slate-900 text-xs truncate"
                              title={item.cliente_fornecedor || '—'}
                            >
                              {item.cliente_fornecedor || '—'}
                            </p>
                            {item.nosso_numero_formatado && (
                              <p className="text-[11px] text-slate-500 font-mono truncate">
                                Nosso nº: {item.nosso_numero_formatado}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Emissão */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {item.emissao ? formatDateBR(item.emissao) : '—'}
                        </td>

                        {/* Vencimento */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-800">
                          {item.vencimento ? formatDateBR(item.vencimento) : '—'}
                        </td>

                        {/* Atraso */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          {atraso > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-red-100 text-red-700 border border-red-200">
                              +{atraso}d
                            </span>
                          ) : atraso < 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[11px] text-slate-500 bg-slate-100">
                              {atraso}d
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">0d</span>
                          )}
                        </td>

                        {/* Valor Nominal */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono text-slate-700">
                          {item.valor_nominal !== undefined && item.valor_nominal !== null
                            ? formatCurrencyBRL(item.valor_nominal)
                            : '—'}
                        </td>

                        {/* Saldo Atual */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono font-semibold text-slate-900">
                          {item.saldo_atual !== undefined && item.saldo_atual !== null
                            ? formatCurrencyBRL(item.saldo_atual)
                            : '—'}
                        </td>

                        {/* Forma Pgto */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className="text-xs text-slate-700 truncate max-w-[140px] block"
                            title={item.forma_pagamento || '—'}
                          >
                            {item.forma_pagamento || '—'}
                          </span>
                        </td>

                        {/* Situação */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <SituacaoBadge situacao={item.situacao} overdue={overdue} />
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenDetails(item)
                            }}
                            className="w-7 h-7 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                            title="Ver detalhes completos"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards Mobile (<=768px) */}
          <div className="md:hidden space-y-3">
            {titles.map((item) => {
              const overdue = isTitleOverdue(item)
              const atraso = item.atraso ?? 0

              return (
                <Card
                  key={item.id}
                  onClick={() => handleOpenDetails(item)}
                  className={`rounded-xl border shadow-xs cursor-pointer active:scale-[0.99] transition-transform ${
                    overdue ? 'border-red-200 bg-red-50/20' : 'border-slate-200/80 bg-white'
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Top: Número, Parcela e Situação */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/70">
                          #{item.numero || '—'}
                        </span>
                        {item.parcela && (
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            Parc: {item.parcela}
                          </span>
                        )}
                      </div>
                      <SituacaoBadge situacao={item.situacao} overdue={overdue} />
                    </div>

                    {/* Cliente / Fornecedor */}
                    <div>
                      <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                        {item.cliente_fornecedor || '—'}
                      </p>
                      {item.forma_pagamento && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-slate-400 shrink-0" />
                          {item.forma_pagamento}
                        </p>
                      )}
                    </div>

                    {/* Grade de valores e datas */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Vencimento</span>
                        <span className="font-medium text-slate-800">
                          {item.vencimento ? formatDateBR(item.vencimento) : '—'}
                        </span>
                        {atraso > 0 && (
                          <span className="text-red-600 font-semibold text-[11px] ml-1">
                            (+{atraso}d)
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[11px]">Saldo Atual</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {item.saldo_atual !== undefined && item.saldo_atual !== null
                            ? formatCurrencyBRL(item.saldo_atual)
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Footer com botão Ver Detalhes */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                      <span className="text-[11px]">
                        Emissão: {item.emissao ? formatDateBR(item.emissao) : '—'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-indigo-600 hover:text-indigo-700 p-0 font-medium gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenDetails(item)
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver detalhes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Paginação Server-side */}
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
                de <strong className="text-slate-900">{totalItems}</strong> títulos
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

      {/* Modal de Detalhes Completos do Título */}
      <Dialog open={isDetailsOpen} onOpenChange={(open) => !open && handleCloseDetails()}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200">
                  Título #{selectedTitle?.numero || '—'}
                </span>
                {selectedTitle?.parcela && (
                  <Badge variant="outline" className="font-mono text-xs">
                    Parcela: {selectedTitle.parcela}
                  </Badge>
                )}
              </div>
              {selectedTitle && (
                <SituacaoBadge
                  situacao={selectedTitle.situacao}
                  overdue={isTitleOverdue(selectedTitle)}
                />
              )}
            </div>
            <DialogTitle className="text-base font-bold text-slate-900 mt-2">
              {selectedTitle?.cliente_fornecedor || 'Detalhes do Título'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Visualização de todos os campos importados da consulta financeira do ERP.
            </DialogDescription>
          </DialogHeader>

          {selectedTitle && (
            <div className="space-y-4 pt-2 text-xs">
              {/* Seção 1: Dados Financeiros Principais */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                  Valores e Saldos
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Valor Nominal</span>
                    <span className="font-mono font-semibold text-slate-800 text-sm">
                      {selectedTitle.valor_nominal !== undefined &&
                      selectedTitle.valor_nominal !== null
                        ? formatCurrencyBRL(selectedTitle.valor_nominal)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Saldo Atual</span>
                    <span className="font-mono font-bold text-indigo-700 text-sm">
                      {selectedTitle.saldo_atual !== undefined && selectedTitle.saldo_atual !== null
                        ? formatCurrencyBRL(selectedTitle.saldo_atual)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Saldo + Juros</span>
                    <span className="font-mono font-medium text-slate-800">
                      {selectedTitle.saldo_juros !== undefined && selectedTitle.saldo_juros !== null
                        ? formatCurrencyBRL(selectedTitle.saldo_juros)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Saldo + Juros + Multa</span>
                    <span className="font-mono font-medium text-slate-800">
                      {selectedTitle.saldo_juros_multa !== undefined &&
                      selectedTitle.saldo_juros_multa !== null
                        ? formatCurrencyBRL(selectedTitle.saldo_juros_multa)
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Juros Previsto</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.juros_previsto !== undefined &&
                      selectedTitle.juros_previsto !== null
                        ? formatCurrencyBRL(selectedTitle.juros_previsto)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Juros Pago</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.juros_pago !== undefined && selectedTitle.juros_pago !== null
                        ? formatCurrencyBRL(selectedTitle.juros_pago)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Multa</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.multa !== undefined && selectedTitle.multa !== null
                        ? formatCurrencyBRL(selectedTitle.multa)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Desconto</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.desconto !== undefined && selectedTitle.desconto !== null
                        ? formatCurrencyBRL(selectedTitle.desconto)
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Outras Despesas</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.outras_despesas !== undefined &&
                      selectedTitle.outras_despesas !== null
                        ? formatCurrencyBRL(selectedTitle.outras_despesas)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Atraso</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.atraso !== undefined && selectedTitle.atraso !== null
                        ? `${selectedTitle.atraso} dia(s)`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seção 2: Datas */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  Datas e Prazos
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Emissão</span>
                    <span className="font-medium text-slate-800">
                      {selectedTitle.emissao ? formatDateBR(selectedTitle.emissao) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Vencimento</span>
                    <span className="font-bold text-slate-900">
                      {selectedTitle.vencimento ? formatDateBR(selectedTitle.vencimento) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Pagamento</span>
                    <span className="font-medium text-emerald-700">
                      {selectedTitle.pagamento ? formatDateBR(selectedTitle.pagamento) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Dt. Reparcelamento</span>
                    <span className="text-slate-700">
                      {selectedTitle.dt_reparcelamento
                        ? formatDateBR(selectedTitle.dt_reparcelamento)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Dt. Acerto</span>
                    <span className="text-slate-700">
                      {selectedTitle.dt_acerto ? formatDateBR(selectedTitle.dt_acerto) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seção 3: Informações Bancárias / Cobrança */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                  Cobrança e Boleto
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Forma de Pagamento</span>
                    <span className="font-medium text-slate-800">
                      {selectedTitle.forma_pagamento || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Condição de Pgto</span>
                    <span className="text-slate-700">{selectedTitle.condicao_pgto || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Portador</span>
                    <span className="text-slate-700">{selectedTitle.portador || '—'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nosso Número Formatado</span>
                    <span className="font-mono font-medium text-slate-800">
                      {selectedTitle.nosso_numero_formatado || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nosso Número</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.nosso_numero || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Borderô</span>
                    <span className="font-mono text-slate-700">{selectedTitle.bordero || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Modelo Documento</span>
                    <span className="text-slate-700">{selectedTitle.modelo_dcto || '—'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Série</span>
                    <span className="text-slate-700">{selectedTitle.serie || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Impresso</span>
                    <span className="text-slate-700">{selectedTitle.impresso || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Hora Impressão Boleto</span>
                    <span className="font-mono text-slate-700">
                      {selectedTitle.hora_impressao_boleto || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Menu</span>
                    <span className="text-slate-700">
                      {selectedTitle.menu === true
                        ? 'Verdadeiro'
                        : selectedTitle.menu === false
                          ? 'Falso'
                          : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seção 4: Cadastro / ERP / Observações */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  ERP e Comercial
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Filial</span>
                    <span className="text-slate-700">{selectedTitle.filial || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Conta Contábil</span>
                    <span className="text-slate-700">{selectedTitle.conta || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Vendedor</span>
                    <span className="text-slate-700 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                      {selectedTitle.vendedor || '—'}
                    </span>
                  </div>
                </div>

                {selectedTitle.observacao && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-400 block text-[11px]">Observação</span>
                    <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                      {selectedTitle.observacao}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
