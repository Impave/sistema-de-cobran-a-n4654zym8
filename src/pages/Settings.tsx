import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { User, Lock, AlertTriangle, Mail, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { authService } from '@/services/auth'
import { useToast } from '@/hooks/use-toast'
import { ClientAvatar } from '@/components/ClientAvatar'

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Profile Form
  const [name, setName] = useState(user?.name || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  // Password Form
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Danger Zone Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Salvar perfil
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setProfileLoading(true)
    setProfileSuccess(false)
    try {
      await authService.updateProfile(user.id, { name })
      await refresh()
      setProfileSuccess(true)
      toast({
        title: 'Perfil atualizado',
        description: 'Suas informações cadastrais foram salvas com sucesso.',
      })
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar perfil.'
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProfileLoading(false)
    }
  }

  // Reenviar verificação de email
  const handleSendVerification = async () => {
    if (!user?.email) return
    try {
      await authService.requestVerification(user.email)
      setVerificationSent(true)
      toast({
        title: 'Email de verificação enviado!',
        description: `Enviamos um link de confirmação para ${user.email}.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar verificação.'
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      })
    }
  }

  // Atualizar senha
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!user) return

    if (!oldPassword) {
      setPasswordError('Informe sua senha atual.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }

    setPasswordLoading(true)
    try {
      await authService.changePassword(user.id, oldPassword, newPassword, confirmPassword)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({
        title: 'Senha atualizada!',
        description: 'Sua senha de acesso foi modificada com sucesso.',
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao alterar senha. Verifique sua senha atual.'
      setPasswordError(msg)
      toast({
        title: 'Falha na alteração',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setPasswordLoading(false)
    }
  }

  // Excluir conta
  const handleDeleteAccount = async () => {
    if (!user) return
    setDeleteLoading(true)
    try {
      await authService.deleteAccount(user.id)
      logout()
      toast({
        title: 'Conta excluída',
        description: 'Sua conta e todos os dados vinculados foram removidos do sistema.',
      })
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir conta.'
      toast({
        title: 'Erro na exclusão',
        description: msg,
        variant: 'destructive',
      })
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Gerencie seu perfil de acesso, segurança e preferências da conta
        </p>
      </div>

      {/* 1. Meu Perfil */}
      <Card className="rounded-xl border border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Meu Perfil</CardTitle>
              <CardDescription className="text-xs">
                Informações da sua identificação no sistema
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 pb-5 mb-5 border-b border-slate-100">
            <ClientAvatar name={user?.name || user?.email || 'U'} size="lg" />
            <div>
              <p className="text-sm font-bold text-slate-900">{user?.name || 'Usuário'}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
              <div className="mt-1 flex items-center gap-1.5">
                {user?.verified ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Email verificado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Email não confirmado
                  </span>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="profile-name" className="text-xs font-semibold text-slate-700">
                  Nome
                </Label>
                <Input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="mt-1 text-sm"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="profile-email" className="text-xs font-semibold text-slate-700">
                    Email
                  </Label>
                  {!user?.verified && (
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      disabled={verificationSent}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      {verificationSent ? 'Link enviado!' : 'Confirmar email'}
                    </button>
                  )}
                </div>
                <div className="relative mt-1">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <Input
                    id="profile-email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="pl-9 text-sm bg-slate-50 text-slate-500 border-slate-200"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  O endereço de email não pode ser alterado diretamente por questões de segurança.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button
                type="submit"
                disabled={profileLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
              >
                {profileLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : profileSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Salvo com sucesso!
                  </>
                ) : (
                  'Salvar alterações'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Alterar Senha */}
      <Card className="rounded-xl border border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Alterar Senha</CardTitle>
              <CardDescription className="text-xs">
                Atualize sua credencial de acesso ao painel
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {passwordError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label htmlFor="old-pass" className="text-xs font-semibold text-slate-700">
                Senha atual
              </Label>
              <Input
                id="old-pass"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 text-sm max-w-md"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <Label htmlFor="new-pass" className="text-xs font-semibold text-slate-700">
                  Nova senha
                </Label>
                <Input
                  id="new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 text-sm"
                  minLength={8}
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Mínimo 8 caracteres</span>
              </div>

              <div>
                <Label htmlFor="confirm-pass" className="text-xs font-semibold text-slate-700">
                  Confirmar nova senha
                </Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button
                type="submit"
                disabled={passwordLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
              >
                {passwordLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  'Atualizar senha'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 3. Zona de Perigo */}
      <Card className="rounded-xl border border-red-200 bg-red-50/20 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-red-900">Zona de Perigo</CardTitle>
              <CardDescription className="text-xs text-red-600/80">
                Ações irreversíveis relacionadas à sua conta
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-red-200/60">
            <div>
              <p className="text-sm font-semibold text-slate-900">Excluir minha conta</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Exclui permanentemente seus dados de acesso, clientes e todas as cobranças
                registradas.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(true)}
              className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 text-xs shrink-0"
            >
              Excluir minha conta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Confirmação para Excluir Conta */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900">
              Excluir conta definitivamente?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Esta ação é irreversível. Todos os seus clientes, cobranças e dados associados serão
              apagados para sempre.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir conta'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
