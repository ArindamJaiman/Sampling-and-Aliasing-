'use client';

import { useState, type ReactNode } from 'react';

// ─── Panel ──────────────────────────────────────────────────

export function Panel({
  title,
  icon,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-5 ${className}`}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon && (
          <div className="h-5 w-5 rounded-md bg-white/[0.05] flex items-center justify-center">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          {subtitle && <p className="text-[10px] text-white/25 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Metric card ────────────────────────────────────────────

export function Metric({
  label,
  value,
  unit,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
        warn
          ? 'border-red-500/30 bg-red-500/5'
          : accent
          ? 'border-cyan-500/30 bg-cyan-500/5'
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-cyan-500/5 to-transparent" />
      <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">{label}</p>
      <p
        className={`text-lg font-mono font-semibold ${
          warn ? 'text-red-400' : accent ? 'text-cyan-400' : 'text-white/90'
        }`}
      >
        {value}
        {unit && <span className="text-xs text-white/30 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// ─── Status badge ───────────────────────────────────────────

export function StatusBadge({
  status,
  label,
}: {
  status: 'good' | 'warn' | 'bad';
  label: string;
}) {
  const colors = {
    good: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    warn: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    bad: 'bg-red-500/10 text-red-400 ring-red-500/20',
  };
  const dotColors = {
    good: 'bg-emerald-400',
    warn: 'bg-amber-400 animate-pulse',
    bad: 'bg-red-400 animate-pulse',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide ring-1 ${colors[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColors[status]}`} />
      {label}
    </span>
  );
}

// ─── Quality bar ────────────────────────────────────────────

export function QualityBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped > 80
      ? 'from-emerald-500 to-emerald-400'
      : clamped > 50
      ? 'from-amber-500 to-yellow-400'
      : 'from-red-500 to-red-400';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-white/40">{label}</span>
        <span className="font-mono text-white/60">{clamped.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ─── Explain (educational mode) ─────────────────────────────

export function Explain({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="mt-2 rounded-lg border border-cyan-500/10 bg-cyan-500/[0.03] px-3 py-2 text-xs text-cyan-300/70 leading-relaxed">
      💡 {children}
    </div>
  );
}

// ─── Field (slider/input with label) ────────────────────────

export function Field({
  label,
  value,
  onChange,
  type = 'range',
  min,
  max,
  step,
  unit,
  options,
}: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  type?: 'range' | 'number' | 'select' | 'text';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}) {
  if (type === 'select' && options) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
        </div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 outline-none focus:border-cyan-500/30 transition-colors"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#0f1320]">
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div className="space-y-1.5">
        <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-mono text-cyan-300/80 outline-none focus:border-cyan-500/30 transition-colors"
          placeholder="sin(2*pi*40*t) + 0.5*cos(2*pi*90*t)"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
        <span className="text-xs font-mono text-cyan-400">
          {value}
          {unit && <span className="text-white/30 ml-0.5">{unit}</span>}
        </span>
      </div>
      <input
        type={type}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={type === 'range' ? 'slider w-full' : 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-mono text-white/80 outline-none focus:border-cyan-500/30 transition-colors'}
      />
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string; icon: ReactNode }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 backdrop-blur-xl">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
            active === tab.id
              ? 'bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/5'
              : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Button variants ────────────────────────────────────────

export function ActionButton({
  children,
  onClick,
  variant = 'default',
  disabled = false,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    default: 'border-white/[0.08] bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white/90',
    primary: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 shadow-lg shadow-cyan-500/5',
    danger: 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
    ghost: 'border-transparent text-white/40 hover:text-white/60 hover:bg-white/[0.04]',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
