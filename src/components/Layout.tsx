import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Users,
  Receipt,
  FileText,
  Settings,
  UserCog,
  LogOut,
  Menu,
  X,
  CreditCard,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/formatters'
import { Button } from '@/components/ui/button'

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Clientes', path: '/clients', icon: Users },
  { name: 'Cobranças', path: '/charges', icon: Receipt },
  { name: 'Títulos', path: '/titles', icon: FileText },
  { name: 'Configurações', path: '/settings', icon: Settings },
  { name: 'Usuários', path: '/users', icon: UserCog, adminOnly: true },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.role === 'admin')

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans antialiased">
      {/* Mobile Top Bar (<768px) */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
            <CreditCard className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-slate-900 tracking-tight">CobrançaPro</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu"
          className="text-slate-600 hover:text-slate-900"
        >
          <Menu className="w-6 h-6" />
        </Button>
      </header>

      {/* Mobile Drawer Backdrop & Drawer (<768px) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Slide-in Drawer */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-2xl z-10 animate-in slide-in-from-left duration-250">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <CreditCard className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-900">CobrançaPro</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                )
              })}
            </nav>

            {/* Mobile User Profile Footer */}
            {user && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 shrink-0">
                    {getInitials(user.name || user.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {user.name || 'Usuário'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  <LogOut className="w-4 h-4" />
                  Sair do sistema
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop / Tablet Sidebar */}
      {/* 260px desktop (lg), 64px rail on tablet (md to lg) */}
      <aside className="hidden md:flex flex-col border-r border-slate-200 bg-white sticky top-0 h-screen transition-all duration-200 w-16 lg:w-[260px] shrink-0 z-30">
        {/* Brand */}
        <div className="h-16 flex items-center px-4 lg:px-6 border-b border-slate-100 gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="hidden lg:flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg text-slate-900 tracking-tight leading-tight">
                CobrançaPro
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold border border-slate-200">
                v0.0.21
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Gestão Financeira</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 p-2 lg:p-3 space-y-1.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs border-l-4 border-indigo-600'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
                title={item.name}
              >
                <Icon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" />
                <span className="hidden lg:inline">{item.name}</span>
                <ChevronRight className="hidden lg:inline ml-auto w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity" />
              </NavLink>
            )
          })}
        </nav>

        {/* User profile footer */}
        {user && (
          <div className="p-2 lg:p-3 border-t border-slate-100 bg-slate-50/50">
            <div className="hidden lg:flex items-center gap-3 p-2 rounded-lg mb-1">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 shrink-0">
                {getInitials(user.name || user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate leading-snug">
                  {user.name || 'Usuário'}
                </p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50/80 transition-colors"
              title="Sair do sistema"
            >
              <LogOut className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-red-600" />
              <span className="hidden lg:inline">Sair do sistema</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 animate-fade-in-up">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
