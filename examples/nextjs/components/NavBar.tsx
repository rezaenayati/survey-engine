'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getDemoUser, setDemoUser } from '@/lib/api';

const PRESET_USERS = ['admin', 'alice', 'bob', 'charlie'];

export function NavBar() {
    const pathname = usePathname();
    const [user, setUser] = useState('admin');
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setUser(getDemoUser());
    }, []);

    function selectUser(u: string) {
        setDemoUser(u);
        setUser(u);
        setOpen(false);
    }

    const isAdmin = pathname.startsWith('/admin');

    return (
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <Link
                        href="/"
                        className="font-semibold text-indigo-600 text-sm tracking-wide"
                    >
                        SurveyEngine
                    </Link>
                    <div className="flex gap-1">
                        <NavLink href="/" active={!isAdmin}>
                            Surveys
                        </NavLink>
                        <NavLink href="/admin" active={isAdmin}>
                            Admin
                        </NavLink>
                    </div>
                </div>

                {/* User switcher — simulates auth for demo purposes */}
                <div className="relative">
                    <button
                        onClick={() => setOpen((o) => !o)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold uppercase">
                            {user[0]}
                        </span>
                        <span>{user}</span>
                        <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                    </button>

                    {open && (
                        <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                            <p className="px-3 py-1.5 text-xs text-gray-400 font-medium uppercase tracking-wide">
                                Switch user
                            </p>
                            {PRESET_USERS.map((u) => (
                                <button
                                    key={u}
                                    onClick={() => selectUser(u)}
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${u === user ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                                >
                                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold uppercase">
                                        {u[0]}
                                    </span>
                                    {u}
                                    {u === user && (
                                        <span className="ml-auto text-indigo-400">
                                            ✓
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}

function NavLink({
    href,
    active,
    children,
}: {
    href: string;
    active: boolean;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
        >
            {children}
        </Link>
    );
}
