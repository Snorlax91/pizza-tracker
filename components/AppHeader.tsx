'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type AppHeaderProps = {
    displayName?: string | null;
};

export function AppHeader({ displayName }: AppHeaderProps) {
    const router = useRouter();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/auth');
        router.refresh();
    };

    return (
        <header className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <Link href="/" className="text-xl font-bold hover:text-amber-300 transition-colors">
                Pizza Tracker 🍕
            </Link>
            <div className="flex items-center gap-3">
                <Link
                    href="/pizzas"
                    className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                >
                    Le mie pizze
                </Link>
                <Link
                    href="/friends"
                    className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                >
                    Amici
                </Link>
                <Link
                    href="/groups"
                    className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                >
                    Gruppi
                </Link>
                <Link
                    href="/stats"
                    className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                >
                    Statistiche globali
                </Link>
                <Link
                    href="/profile"
                    className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                >
                    Profilo
                </Link>
                {displayName && (
                    <Link
                        href="/profile"
                        className="text-xs text-slate-400 hidden sm:inline hover:text-slate-200"
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
            </div>
        </header>
    );
}
