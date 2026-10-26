import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users,
  Receipt,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Plus,
  Loader2,
  TrendingUp,
  Tag,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { ClientAvatar } from '@/components/ClientAvatar'
import { clientsService } from '@/services/clients'
import { chargesService } from '@/services/charges'
import { useRealtime } from '@/hooks/use-realtime'
import type { ClientRecord, ChargeRecord } from '@/types'
import { formatCurrencyBRL, formatDateBR, formatDateExtendedBR } from '@/lib/formatters'

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', // Amber
  paid: '#10B981', // Emerald
  overdue: '#EF4444', // Red
  cancelled: '#9CA3AF', // Gray
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}

export default function Dashboard() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [totalClientsCount, setTotalClientsCount] = useState<number>(0)
  const [charges, setCharges] = useState<ChargeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const loadData = useCallback(async () => {
    try {
      const [count, clientsResp, allCharges] = await Promise.all([
        clientsService.count(),
        clientsService.getList({ page: 1, perPage: 100, sort: '-created' }),
        chargesService.getAll(),
      ])
      setTotalClientsCount(count)
      setClients(clientsResp.items)
      setCharges(allCharges)
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Real-time updates
  useRealtime('clients', () => {
    loadData()
  })

  useRealtime('charges', () => {
    loadData()
  })

  // Estatísticas computadas
  const stats = useMemo(() => {
    const totalClients = totalClientsCount || clients.length

    // Cobranças Abertas: pending ou overdue
    const openCharges = charges.filter((c) => c.status === 'pending' || c.status === 'overdue')

    // Vencendo em 7 dias (pending com due_date entre agora e +7 dias)
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const dueIn7Days = charges.filter((c) => {
      if (c.status !== 'pending') return false
      const d = new Date(c.due_date)
      return d >= now && d <= in7Days
    })

    // Inadimplência: status = overdue
    const overdueCharges = charges.filter((c) => c.status === 'overdue')

    return {
      totalClients,
      openChargesCount: openCharges.length,
      dueIn7DaysCount: dueIn7Days.length,
      overdueCount: overdueCharges.length,
    }
  }, [clients, charges])

  // Gráfico de Rosca: Cobranças por Status
  const statusPieData = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    }

    charges.forEach((c) => {
      if (counts[c.status] !== undefined) {
        counts[c.status]++
      }
    })

    return [
      { name: 'Pendente', key: 'pending', value: counts.pending, color: STATUS_COLORS.pending },
      { name: 'Pago', key: 'paid', value: counts.paid, color: STATUS_COLORS.paid },
      { name: 'Vencido', key: 'overdue', value: counts.overdue, color: STATUS_COLORS.overdue },
      {
        name: 'Cancelado',
        key: 'cancelled',
        value: counts.cancelled,
        color: STATUS_COLORS.cancelled,
      },
    ].filter((item) => item.value > 0)
  }, [charges])

  // Gráfico de Barras: Vencimentos dos Próximos 30 Dias
  const next30DaysBarData = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    end.setHours(23, 59, 59, 999)

    // Agrupar por dia
    const map = new Map<
      string,
      { dateLabel: string; pending: number; overdue: number; total: number }
    >()

    charges.forEach((c) => {
      const d = new Date(c.due_date)
      if (d >= now && d <= end) {
        const key = d.toISOString().split('T')[0]
        const dayLabel = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
        if (!map.has(key)) {
          map.set(key, { dateLabel: dayLabel, pending: 0, overdue: 0, total: 0 })
        }
        const entry = map.get(key)!
        if (c.status === 'pending') {
          entry.pending += 1
        } else if (c.status === 'overdue') {
          entry.overdue += 1
        }
        entry.total += 1
      }
    })

    const sortedEntries = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => val)

    return sortedEntries
  }, [charges])

  // Próximos Vencimentos: próximos 14 dias, pending ou overdue, ordenada asc, máx 6
  const upcomingCharges = useMemo(() => {
    const now = new Date()
    // Início de hoje
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const in14Days = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000)

    return charges
      .filter((c) => {
        if (c.status !== 'pending' && c.status !== 'overdue') return false
        const d = new Date(c.due_date)
        return d <= in14Days
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 6)
  }, [charges])

  // Mapeamento de clientes por ID para exibir nome e avatar rapidamente
  const clientMap = useMemo(() => {
    const m = new Map<string, ClientRecord>()
    clients.forEach((cl) => m.set(cl.id, cl))
    return m
  }, [clients])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Carregando indicadores do painel...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs px-2 py-0.5 font-medium inline-flex items-center gap-1 shadow-2xs"
              title="Versão ativa da aplicação"
            >
              <Tag className="w-3 h-3 text-emerald-600" />
              v0.0.21
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Visão geral das suas cobranças •{' '}
            <span className="capitalize">{formatDateExtendedBR()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/charges?new=true')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Cobrança
          </Button>
        </div>
      </div>

      {/* 4 Cards de Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Clientes */}
        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Clientes
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {stats.totalClients}
                </p>
                <p className="text-xs text-slate-400 mt-1">cadastrados</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/50">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Cobranças Abertas */}
        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Cobranças Abertas
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {stats.openChargesCount}
                </p>
                <p className="text-xs text-slate-400 mt-1">aguardando pagamento</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/50">
                <Receipt className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Vencendo em 7 dias */}
        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Vencendo em 7 dias
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {stats.dueIn7DaysCount}
                </p>
                <p className="text-xs text-slate-400 mt-1">próximos vencimentos</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/50">
                <Calendar className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Inadimplência */}
        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Inadimplência
                </p>
                <p className="text-2xl font-bold text-red-600 mt-1 tabular-nums">
                  {stats.overdueCount}
                </p>
                <p className="text-xs text-red-400 mt-1">boletos vencidos</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100/50">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de Rosca: Cobranças por Status */}
        <Card className="lg:col-span-5 rounded-xl border border-slate-200/80 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-900">
              Cobranças por Status
            </CardTitle>
            <CardDescription className="text-xs">
              Distribuição atual de todas as cobranças
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {charges.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <Receipt className="w-8 h-8 mb-2 stroke-1" />
                <p className="text-xs">Sem dados suficientes para o gráfico</p>
              </div>
            ) : (
              <div>
                <div className="h-60 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        animationDuration={600}
                      >
                        {statusPieData.map((entry) => (
                          <Cell key={`cell-${entry.key}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: number) => [`${val} cobrança(s)`, 'Quantidade']}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Total no centro da rosca */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">
                      {charges.length}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Total
                    </span>
                  </div>
                </div>

                {/* Legenda abaixo */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
                  {['pending', 'paid', 'overdue', 'cancelled'].map((stKey) => {
                    const count = charges.filter((c) => c.status === stKey).length
                    return (
                      <div
                        key={stKey}
                        className="flex items-center justify-between text-xs px-2 py-1 rounded-md bg-slate-50/60"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: STATUS_COLORS[stKey] }}
                          />
                          <span className="text-slate-600">{STATUS_LABELS[stKey]}</span>
                        </div>
                        <span className="font-semibold text-slate-900 tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Barras: Vencimentos dos Próximos 30 Dias */}
        <Card className="lg:col-span-7 rounded-xl border border-slate-200/80 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Vencimentos dos Próximos 30 Dias
                </CardTitle>
                <CardDescription className="text-xs">
                  Cobranças programadas por data de vencimento
                </CardDescription>
              </div>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {next30DaysBarData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <Calendar className="w-8 h-8 mb-2 stroke-1" />
                <p className="text-xs">Nenhum vencimento agendado para os próximos 30 dias</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={next30DaysBarData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis
                      dataKey="dateLabel"
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                    />
                    <YAxis
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm text-xs space-y-1">
                              <p className="font-semibold text-slate-800">Data: {data.dateLabel}</p>
                              <p className="text-amber-600">Pendentes: {data.pending}</p>
                              {data.overdue > 0 && (
                                <p className="text-red-600">Vencidas: {data.overdue}</p>
                              )}
                              <p className="text-slate-500 font-medium pt-1 border-t border-slate-100">
                                Total: {data.total} cobrança(s)
                              </p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar
                      dataKey="pending"
                      name="Pendente"
                      fill="#F59E0B"
                      radius={[4, 4, 0, 0]}
                      animationDuration={500}
                    />
                    <Bar
                      dataKey="overdue"
                      name="Vencido"
                      fill="#EF4444"
                      radius={[4, 4, 0, 0]}
                      animationDuration={500}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximos Vencimentos List Card */}
      <Card className="rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Próximos Vencimentos
            </CardTitle>
            <CardDescription className="text-xs">
              Cobranças com vencimento nos próximos 14 dias (até 6 registros)
            </CardDescription>
          </div>
          <Link
            to="/charges"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
          >
            Ver todas
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {upcomingCharges.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                Nenhuma cobrança cadastrada ainda
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Cadastre seus clientes e lance cobranças para acompanhar os vencimentos aqui.
              </p>
              <Button
                onClick={() => navigate('/charges?new=true')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Cadastrar cobrança
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-6">Cliente</th>
                    <th className="py-3 px-6">Descrição</th>
                    <th className="py-3 px-6 text-right">Valor</th>
                    <th className="py-3 px-6">Vencimento</th>
                    <th className="py-3 px-6 text-center">Status</th>
                    <th className="py-3 px-6 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingCharges.map((charge) => {
                    const client = charge.expand?.client || clientMap.get(charge.client)
                    const clientName = client?.name || 'Cliente'
                    const isOverdue = charge.status === 'overdue'

                    return (
                      <tr
                        key={charge.id}
                        className="hover:bg-slate-50/80 transition-colors duration-150"
                      >
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-2.5">
                            <ClientAvatar name={clientName} size="sm" />
                            <span className="font-semibold text-slate-900 truncate max-w-[160px]">
                              {clientName}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-6">
                          <div>
                            <span className="text-slate-800 font-medium line-clamp-1">
                              {charge.description}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {charge.number}
                            </span>
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
                          <StatusBadge status={charge.status} size="sm" />
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/charges?edit=${charge.id}`)}
                            className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 text-xs h-7 px-2.5"
                          >
                            Ver detalhes
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
