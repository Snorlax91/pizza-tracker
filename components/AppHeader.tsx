'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useState } from 'react';

type AppHeaderProps = {
  displayName?: string | null;
  isLoggedIn?: boolean;
  onLoginClick?: () => void;
};

export function AppHeader({ displayName, isLoggedIn = true, onLoginClick }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  };

  const handleLogin = () => {
    setMenuOpen(false);
    if (onLoginClick) {
      onLoginClick();
    } else {
      router.push('/auth');
    }
  };

  // Filtra i navItems in base allo stato di login
  const allNavItems = [
    { href: '/pizzas', label: 'Le mie pizze', requiresAuth: true },
    { href: '/friends', label: 'Amici', requiresAuth: true },
    { href: '/groups', label: 'Gruppi', requiresAuth: true },
    { href: '/stats', label: 'Statistiche globali', requiresAuth: false },
    { href: '/profile', label: 'Profilo', requiresAuth: true },
  ];

  const navItems = isLoggedIn
    ? allNavItems
    : allNavItems.filter(item => !item.requiresAuth);

  const linkClasses = (href: string) =>
    `text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800 ${
      pathname === href ? 'bg-slate-800 text-amber-300' : 'text-slate-100'
    }`;

  return (
    <header className="w-full border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo / titolo: cliccabile torna alla home */}
        <Link
          href="/"
          className="text-xl font-bold hover:text-amber-300 transition-colors"
        >
          Pizza Tracker 🍕
        </Link>

        {/* NAV DESKTOP */}
        <div className="hidden md:flex items-center gap-3">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClasses(item.href)}
            >
              {item.label}
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              {displayName && (
                <Link
                  href="/profile"
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  {displayName}
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1 rounded-full border border-slate-600 hover:bg-slate-800"
              >
                Esci
              </button>
            </>
          ) : (
            <button
              onClick={handleLogin}
              className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Accedi
            </button>
          )}
        </div>

        {/* NAV MOBILE: solo hamburger + (opzionale) nome */}
        <div className="flex md:hidden items-center gap-2">
          {isLoggedIn && displayName && (
            <Link
              href="/profile"
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {displayName}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            className="p-2 rounded-full border border-slate-700 hover:bg-slate-800"
            aria-label="Apri menu di navigazione"
          >
            {/* icona hamburger semplice */}
            <div className="w-4 space-y-0.5">
              <span className="block h-0.5 bg-slate-100 rounded" />
              <span className="block h-0.5 bg-slate-100 rounded" />
              <span className="block h-0.5 bg-slate-100 rounded" />
            </div>
          </button>
        </div>
      </div>

      {/* MENU MOBILE A TENDINA */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-900">
          <nav className="max-w-5xl mx-auto px-4 py-2 flex flex-col gap-2">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`text-xs px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 ${
                  pathname === item.href
                    ? 'bg-slate-800 text-amber-300'
                    : 'text-slate-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="mt-1 text-xs px-3 py-2 rounded-xl border border-slate-600 text-red-300 hover:bg-red-500/10 text-left"
              >
                Esci
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="mt-1 text-xs px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-left"
              >
                Accedi
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
