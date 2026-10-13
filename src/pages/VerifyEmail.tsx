import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authService } from '@/services/auth'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Token de confirmação não encontrado na URL.')
      return
    }

    let isMounted = true
    authService
      .confirmVerification(token)
      .then(() => {
        if (isMounted) setStatus('success')
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setStatus('error')
          setErrorMessage(
            err instanceof Error ? err.message : 'Não foi possível confirmar seu email.',
          )
        }
      })

    return () => {
      isMounted = false
    }
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200 mb-4">
          <CreditCard className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Confirmação de Email</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10 text-center">
          {status === 'loading' && (
            <div className="py-6 space-y-3">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <p className="text-base font-semibold text-slate-900">Confirmando seu email...</p>
              <p className="text-xs text-slate-500">Aguarde alguns instantes.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Email confirmado com sucesso!</h3>
                <p className="text-sm text-slate-500 mt-2">
                  Sua conta agora está totalmente verificada.
                </p>
              </div>
              <div className="pt-3">
                <Link to="/login">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                    Ir para o login
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Falha na confirmação</h3>
                <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
              </div>
              <div className="pt-3">
                <Link to="/login">
                  <Button variant="outline" className="w-full">
                    Voltar para o login
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
