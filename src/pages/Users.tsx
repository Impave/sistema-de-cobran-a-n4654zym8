import React, { useState, useEffect, useCallback } from 'react'
import {
  UserCog,
  Search,
  Plus,
  Pencil,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  UserCheck,
  UserX,
  Lock,
  Mail,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import { usersService } from '@/services/users'
import type { UserProfile, UserRole } from '@/types'
import { formatDateBR, getInitials } from '@/lib/formatters'

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Paginação server-side
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Modal Novo Usuário
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('')
  const [createRole, setCreateRole] = useState<UserRole>('operador')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Modal Editar Usuário
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('operador')
  const [editActive, setEditActive] = useState<boolean>(true)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Modal Redefinir Senha
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [resettingUser, setResettingUser] = useState<UserProfile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadUsers = useCallback(async () => {
    try {
      const resp = await usersService.getList({
        page: currentPage,
        perPage: pageSize,
        search: debouncedSearch,
        sort: '-created',
      })
      setUsers(resp.items)
      setTotalItems(resp.totalItems)
      setTotalPages(resp.totalPages || 1)
    } catch (err) {
      console.error('Erro ao carregar usuários:', err)
      toast({
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar a lista de usuários.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, debouncedSearch, toast])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // Inscrição em tempo real na coleção users
  useRealtime('users', () => {
    loadUsers()
  })

  // Handlers para criação de usuário
  const handleOpenCreate = () => {
    setCreateName('')
    setCreateEmail('')
    setCreatePassword('')
    setCreatePasswordConfirm('')
    setCreateRole('operador')
    setCreateError(null)
    setIsCreateOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!createName.trim() || createName.trim().length < 2) {
      setCreateError('O nome completo deve conter no mínimo 2 caracteres.')
      return
    }

    if (!createEmail.trim() || !createEmail.includes('@')) {
      setCreateError('Informe um e-mail válido.')
      return
    }

    if (!createPassword || createPassword.length < 8) {
      setCreateError('A senha deve conter no mínimo 8 caracteres.')
      return
    }

    if (createPassword !== createPasswordConfirm) {
      setCreateError('As senhas informadas não coincidem.')
      return
    }

    setCreateLoading(true)
    try {
      await usersService.create({
        name: createName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        passwordConfirm: createPasswordConfirm,
        role: createRole,
      })

      toast({
        title: 'Usuário cadastrado com sucesso',
        description: `${createName} agora pode acessar o sistema com o perfil ${createRole === 'admin' ? 'Administrador' : 'Operador'}.`,
      })

      setIsCreateOpen(false)
      loadUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar usuário.'
      setCreateError(msg)
      toast({
        title: 'Erro ao criar usuário',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCreateLoading(false)
    }
  }

  // Handlers para edição de usuário
  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user)
    setEditName(user.name || '')
    setEditRole(user.role || 'operador')
    setEditActive(user.active !== false)
    setEditError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditError(null)

    if (!editName.trim() || editName.trim().length < 2) {
      setEditError('O nome deve conter no mínimo 2 caracteres.')
      return
    }

    // Regras de proteção no frontend
    const isSelf = editingUser.id === currentUser?.id
    const isService = editingUser.email === 'garantias-service@impave.com.br'

    if (isService && (!editActive || editRole !== 'admin')) {
      setEditError('O usuário de serviço não pode ser desativado nem rebaixado.')
      return
    }

    if (isSelf && !editActive) {
      setEditError('Você não pode desativar seu próprio usuário.')
      return
    }

    if (isSelf && editRole !== 'admin') {
      setEditError('Você não pode remover seu próprio acesso de administrador.')
      return
    }

    setEditLoading(true)
    try {
      await usersService.update(editingUser.id, {
        name: editName.trim(),
        role: editRole,
        active: editActive,
      })

      toast({
        title: 'Usuário atualizado',
        description: `Os dados de ${editName} foram atualizados com sucesso.`,
      })

      setIsEditOpen(false)
      loadUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar usuário.'
      setEditError(msg)
      toast({
        title: 'Erro ao atualizar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setEditLoading(false)
    }
  }

  // Handlers para reset de senha
  const handleOpenReset = (user: UserProfile) => {
    setResettingUser(user)
    setNewPassword('')
    setNewPasswordConfirm('')
    setResetError(null)
    setIsResetOpen(true)
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resettingUser) return
    setResetError(null)

    if (!newPassword || newPassword.length < 8) {
      setResetError('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (newPassword !== newPasswordConfirm) {
      setResetError('As senhas informadas não coincidem.')
      return
    }

    setResetLoading(true)
    try {
      await usersService.resetPassword(resettingUser.id, newPassword, newPasswordConfirm)

      toast({
        title: 'Senha redefinida',
        description: `A nova senha de ${resettingUser.name || resettingUser.email} foi salva com sucesso.`,
      })

      setIsResetOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao redefinir senha.'
      setResetError(msg)
      toast({
        title: 'Erro ao alterar senha',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuários</h1>
            <Badge
              variant="outline"
              className="bg-slate-100 text-slate-700 border-slate-300 text-xs px-2 py-0.5 font-medium tabular-nums"
            >
              {totalItems} {totalItems === 1 ? 'usuário' : 'usuários'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie o acesso de administradores e operadores ao sistema de cobrança
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Novo Usuário
        </Button>
      </div>

      {/* Barra de Busca */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400 ml-1" />
        <Input
          type="text"
          placeholder="Buscar por nome ou e-mail do usuário..."
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
          <p className="text-sm text-slate-500">Carregando usuários do sistema...</p>
        </div>
      ) : users.length === 0 ? (
        <Card className="rounded-xl border border-slate-200/80 shadow-xs">
          <CardContent className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-100">
              <UserCog className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {search ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search
                ? `Nenhum resultado corresponde à busca "${search}". Tente outro termo.`
                : 'Cadastre o primeiro operador ou administrador para conceder acesso ao sistema.'}
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
        <div className="space-y-4">
          {/* Tabela Desktop */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Usuário</th>
                    <th className="py-3 px-4">Função</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Cadastro</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((item) => {
                    const isSelf = item.id === currentUser?.id
                    const isService = item.email === 'garantias-service@impave.com.br'
                    const isAdmin = item.role === 'admin'
                    const isActive = item.active !== false

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 shrink-0">
                              {getInitials(item.name || item.email)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 truncate">
                                  {item.name || 'Sem nome'}
                                </span>
                                {isSelf && (
                                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] py-0 px-1.5 font-medium">
                                    Você
                                  </Badge>
                                )}
                                {isService && (
                                  <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-[10px] py-0 px-1.5 font-medium">
                                    Serviço
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {item.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {isAdmin ? (
                            <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-medium gap-1 text-xs">
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                              Administrador
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-slate-600 border-slate-300 font-medium text-xs"
                            >
                              Operador
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {isActive ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium gap-1 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-red-50 text-red-700 border-red-200 font-medium gap-1 text-xs"
                            >
                              <XCircle className="w-3.5 h-3.5 text-red-600" />
                              Inativo
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {item.created ? formatDateBR(item.created) : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenReset(item)}
                              disabled={isService}
                              className="h-8 text-xs text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                              title={
                                isService
                                  ? 'A senha deste usuário de serviço é protegida'
                                  : 'Redefinir senha de acesso'
                              }
                            >
                              <KeyRound className="w-3.5 h-3.5 mr-1" />
                              Senha
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(item)}
                              className="h-8 text-xs text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                              title="Editar função e status do usuário"
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Editar
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

          {/* Cards Mobile (<768px) */}
          <div className="md:hidden space-y-3">
            {users.map((item) => {
              const isSelf = item.id === currentUser?.id
              const isService = item.email === 'garantias-service@impave.com.br'
              const isAdmin = item.role === 'admin'
              const isActive = item.active !== false

              return (
                <Card key={item.id} className="rounded-xl border border-slate-200/80 shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 shrink-0">
                          {getInitials(item.name || item.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-semibold text-slate-900 text-sm truncate">
                              {item.name || 'Sem nome'}
                            </h4>
                            {isSelf && (
                              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] py-0 px-1.5 font-medium">
                                Você
                              </Badge>
                            )}
                            {isService && (
                              <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-[10px] py-0 px-1.5 font-medium">
                                Serviço
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{item.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        {isAdmin ? (
                          <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-medium text-[11px]">
                            Admin
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-slate-600 border-slate-300 text-[11px]"
                          >
                            Operador
                          </Badge>
                        )}

                        {isActive ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium text-[11px]">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-700 border-red-200 font-medium text-[11px]"
                          >
                            Inativo
                          </Badge>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400">
                        {item.created ? formatDateBR(item.created) : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReset(item)}
                        disabled={isService}
                        className="text-xs h-8 text-slate-700 justify-center"
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        Senha
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(item)}
                        className="text-xs h-8 text-indigo-600 border-indigo-200 hover:bg-indigo-50 justify-center"
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3">
              <p className="text-xs text-slate-500">
                Página <span className="font-semibold text-slate-700">{currentPage}</span> de{' '}
                <span className="font-semibold text-slate-700">{totalPages}</span> ({totalItems}{' '}
                usuários no total)
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  title="Primeira página"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Última página"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Novo Usuário */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserCog className="w-5 h-5 text-indigo-600" />
              Cadastrar Novo Usuário
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Crie uma conta para permitir que novos membros da equipe acessem o CobrançaPro.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            {createError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-name" className="text-xs font-semibold text-slate-700">
                Nome completo *
              </Label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  id="create-name"
                  type="text"
                  placeholder="Ex: Carlos Eduardo Silva"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-email" className="text-xs font-semibold text-slate-700">
                E-mail de acesso *
              </Label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  id="create-email"
                  type="email"
                  placeholder="exemplo@impave.com.br"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-pass" className="text-xs font-semibold text-slate-700">
                  Senha (mín. 8 caracteres) *
                </Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <Input
                    id="create-pass"
                    type="password"
                    placeholder="••••••••"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="create-pass-confirm"
                  className="text-xs font-semibold text-slate-700"
                >
                  Confirmar senha *
                </Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <Input
                    id="create-pass-confirm"
                    type="password"
                    placeholder="••••••••"
                    value={createPasswordConfirm}
                    onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-role" className="text-xs font-semibold text-slate-700">
                Função de acesso *
              </Label>
              <Select value={createRole} onValueChange={(val: UserRole) => setCreateRole(val)}>
                <SelectTrigger id="create-role" className="text-sm">
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operador">
                    <div className="flex flex-col py-0.5">
                      <span className="font-semibold text-slate-900">Operador</span>
                      <span className="text-[11px] text-slate-500">
                        Acesso ao dashboard, carteira de clientes e cobranças
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex flex-col py-0.5">
                      <span className="font-semibold text-slate-900">Administrador</span>
                      <span className="text-[11px] text-slate-500">
                        Acesso total: gestão de usuários, clientes, cobranças e ERP
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={createLoading}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs"
              >
                {createLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  'Cadastrar Usuário'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Usuário */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-600" />
              Editar Usuário
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Altere o nome, a função e o status de acesso de{' '}
              {editingUser?.name || editingUser?.email}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
            {editError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">E-mail</Label>
              <Input
                type="text"
                value={editingUser?.email || ''}
                disabled
                className="bg-slate-100 text-slate-500 text-sm cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-semibold text-slate-700">
                Nome completo *
              </Label>
              <Input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-role" className="text-xs font-semibold text-slate-700">
                Função de acesso *
              </Label>
              <Select
                value={editRole}
                onValueChange={(val: UserRole) => setEditRole(val)}
                disabled={
                  editingUser?.id === currentUser?.id ||
                  editingUser?.email === 'garantias-service@impave.com.br'
                }
              >
                <SelectTrigger id="edit-role" className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
              {editingUser?.id === currentUser?.id && (
                <p className="text-[11px] text-slate-400">
                  Você não pode alterar a sua própria função de administrador.
                </p>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="edit-status" className="text-xs font-semibold text-slate-700">
                Status de acesso *
              </Label>
              <Select
                value={editActive ? 'active' : 'inactive'}
                onValueChange={(val) => setEditActive(val === 'active')}
                disabled={
                  editingUser?.id === currentUser?.id ||
                  editingUser?.email === 'garantias-service@impave.com.br'
                }
              >
                <SelectTrigger id="edit-status" className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span>Ativo (pode fazer login)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="inactive">
                    <div className="flex items-center gap-2 text-red-600">
                      <UserX className="w-4 h-4 text-red-600" />
                      <span>Inativo (acesso bloqueado)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {editingUser?.id === currentUser?.id && (
                <p className="text-[11px] text-slate-400">
                  Você não pode desativar seu próprio usuário.
                </p>
              )}
              {editingUser?.email === 'garantias-service@impave.com.br' && (
                <p className="text-[11px] text-slate-400">
                  O usuário de serviço é protegido e não pode ser desativado.
                </p>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={editLoading}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={editLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs"
              >
                {editLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Redefinir Senha */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              Redefinir Senha do Usuário
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Defina uma nova senha de acesso para {resettingUser?.name || resettingUser?.email}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetSubmit} className="space-y-4 py-2">
            {resetError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{resetError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reset-pass" className="text-xs font-semibold text-slate-700">
                Nova senha (mín. 8 caracteres) *
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  id="reset-pass"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reset-pass-confirm" className="text-xs font-semibold text-slate-700">
                Confirmar nova senha *
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  id="reset-pass-confirm"
                  type="password"
                  placeholder="••••••••"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResetOpen(false)}
                disabled={resetLoading}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={resetLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs"
              >
                {resetLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Nova Senha'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
