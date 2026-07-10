'use client';

import { useState, lazy, Suspense } from 'react';
import { TabBar } from '@/components/ui-bits';

// Lazy-load tabs so Three.js and Recharts don't block initial render
const ClassicalTab = lazy(() => import('@/components/classical-tab'));
const QuantumTab   = lazy(() => import('@/components/quantum-tab'));
const AudioTab     = lazy(() => import('@/components/audio-tab'));

const TABS = [
  {
    id: 'classical',
    label: 'Classical',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12c2-4 4-8 6 0s4 4 6 0 4-8 6 0" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'quantum',
    label: 'Quantum',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20" />
      </svg>
    ),
  },
  {
    id: 'audio',
    label: 'Audio A/B',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
];

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-32 text-white/20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
        <span className="text-sm">Loading module…</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('classical');
  const [edu, setEdu] = useState(false);

  return (
    <div className="dark min-h-screen bg-[#0a0e17] text-white overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/[0.03] blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-blue-500/[0.02] blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] backdrop-blur-xl bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20" />
                </svg>
              </div>
              <div className="absolute -inset-1 rounded-xl bg-cyan-500/20 blur-md -z-10" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Nyquist–Shannon Lab
              </h1>
              <p className="text-[11px] text-white/30 tracking-wide">
                Sampling · Aliasing · Corrections · Quantum
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Educational mode toggle */}
            <button
              onClick={() => setEdu(!edu)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                edu
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white/50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
              Learn
            </button>

            {/* Tab bar */}
            <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'classical' && <ClassicalTab edu={edu} />}
          {activeTab === 'quantum' && <QuantumTab edu={edu} />}
          {activeTab === 'audio' && <AudioTab edu={edu} />}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-[11px] text-white/20">
          <span>Sampling & Aliasing Analysis Toolkit</span>
          <span>Next.js 16 · React 19 · Three.js · Recharts</span>
        </div>
      </footer>
    </div>
  );
}
