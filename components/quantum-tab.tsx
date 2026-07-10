'use client';

import { useState, useMemo, Suspense, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { simulateQuantum, type QuantumConfig, type QuantumResult, type BlochPoint } from '@/lib/quantum';
import { downloadJSON } from '@/lib/audio';
import { Panel, Metric, Field, QualityBar, StatusBadge, Explain, ActionButton } from '@/components/ui-bits';
import { SpectrumChart } from '@/components/charts';
import dynamic from 'next/dynamic';

const BlochSphere = dynamic(() => import('@/components/bloch-sphere'), { ssr: false });

const DEFAULT_CONFIG: QuantumConfig = {
  phaseFrequency: 5,
  samplingRate: 50,
  duration: 1,
  shots: 1024,
  theta: Math.PI / 2,
  noise: 0.02,
};

const PRESETS: { label: string; config: Partial<QuantumConfig> }[] = [
  { label: 'No Aliasing', config: { phaseFrequency: 5, samplingRate: 50, noise: 0 } },
  { label: 'Strong Aliasing', config: { phaseFrequency: 40, samplingRate: 30, noise: 0 } },
  { label: 'High Noise', config: { phaseFrequency: 10, samplingRate: 100, noise: 0.4 } },
  { label: 'Low Shots', config: { phaseFrequency: 5, samplingRate: 50, shots: 16, noise: 0 } },
  { label: 'Fast Rotation', config: { phaseFrequency: 80, samplingRate: 200, duration: 0.5 } },
];

export default function QuantumTab({ edu }: { edu: boolean }) {
  const [config, setConfig] = useState<QuantumConfig>(DEFAULT_CONFIG);
  const [animSpeed, setAnimSpeed] = useState(1);

  const result: QuantumResult = useMemo(() => simulateQuantum(config), [config]);
  const update = (patch: Partial<QuantumConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const qftChartData = useMemo(
    () => result.qftSpectrum.slice(0, 100).map((p) => ({ frequency: p.frequency, magnitude: p.magnitude })),
    [result.qftSpectrum],
  );

  // ── Quantum Playground State ──────────────────────────────
  const [interactivePath, setInteractivePath] = useState<BlochPoint[]>([]);

  // Sync interactive path with simulation result when config changes
  useEffect(() => {
    setInteractivePath(result.blochPath);
  }, [result.blochPath]);

  // Apply gate operation and append to path
  const handleGate = useCallback((gate: 'X' | 'Y' | 'Z' | 'H') => {
    setInteractivePath((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const startVec = new THREE.Vector3(last.x, last.y, last.z);
      const axis = new THREE.Vector3();
      let angle = Math.PI; // 180 degrees for Pauli and Hadamard

      if (gate === 'X') axis.set(1, 0, 0);
      else if (gate === 'Y') axis.set(0, 1, 0);
      else if (gate === 'Z') axis.set(0, 0, 1);
      else if (gate === 'H') axis.set(1, 0, 1).normalize();

      const pathExt: BlochPoint[] = [];
      const frames = 30; // 30 interpolation frames for smooth animation
      
      for (let i = 1; i <= frames; i++) {
        const t = i / frames;
        const qInterp = new THREE.Quaternion().setFromAxisAngle(axis, angle * t);
        const interpVec = startVec.clone().applyQuaternion(qInterp);
        pathExt.push({
          x: interpVec.x,
          y: interpVec.y,
          z: interpVec.z,
          t: last.t + t * 0.05, // synthetic time step
          phi: last.phi, // phi doesn't matter for pure state visual
        });
      }
      return [...prev, ...pathExt];
    });
  }, []);

  const handleExport = useCallback(() => {
    downloadJSON({
      config,
      metrics: {
        estimatedFrequency: result.estimatedFrequency,
        trueFrequency: result.trueFrequency,
        aliasDetected: result.aliasDetected,
        aliasedFrequency: result.aliasedFrequency,
        phaseError: result.phaseError,
        fidelity: result.fidelity,
        shotNoise: result.shotNoise,
        confidence: result.confidence,
        p1: result.p1,
      },
      qftSpectrum: result.qftSpectrum.slice(0, 50),
      blochPath: result.blochPath.slice(0, 100),
    }, 'quantum_results.json');
  }, [config, result]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
      {/* Left: Controls */}
      <div className="space-y-5">
        {/* Presets */}
        <Panel title="Quick Presets" icon={<PresetIcon />}>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => update(p.config)}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/40 hover:text-cyan-400 hover:border-cyan-500/20 hover:bg-cyan-500/[0.03] transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
        </Panel>

        {/* Config */}
        <Panel title="Quantum Configuration" icon={<ConfigIcon />}>
          <div className="space-y-3">
            <Field label="Phase Frequency" value={config.phaseFrequency} onChange={(v) => update({ phaseFrequency: +v })} min={1} max={100} step={1} unit="Hz" />
            <Field label="Sampling Rate" value={config.samplingRate} onChange={(v) => update({ samplingRate: +v })} min={5} max={500} step={5} unit="Hz" />
            <Field label="Duration" value={config.duration} onChange={(v) => update({ duration: +v })} min={0.1} max={5} step={0.1} unit="s" />
            <Field label="Measurement Shots" value={config.shots} onChange={(v) => update({ shots: +v })} min={10} max={10000} step={10} />
            <Field label="Bloch Angle θ" value={+(config.theta * (180 / Math.PI)).toFixed(0)} onChange={(v) => update({ theta: +v * (Math.PI / 180) })} min={0} max={180} step={5} unit="°" />
            <Field label="Depolarizing Noise" value={config.noise} onChange={(v) => update({ noise: +v })} min={0} max={0.5} step={0.01} />
            <Field label="Animation Speed" value={animSpeed} onChange={(v) => setAnimSpeed(+v)} min={0.1} max={5} step={0.1} unit="x" />
          </div>
          <Explain show={edu}>
            The qubit state <strong>|ψ⟩ = cos(θ/2)|0⟩ + e^(iφ)sin(θ/2)|1⟩</strong> evolves with phase φ(t) = 2πft. Sampling this phase at rate fs introduces the same Nyquist aliasing as classical signals.
          </Explain>
        </Panel>

        {/* QFT Spectrum */}
        <Panel title="QFT Spectrum" icon={<SpecIcon />} subtitle="Quantum Fourier Transform">
          <SpectrumChart
            data={qftChartData}
            nyquistFreq={config.samplingRate / 2}
            height={160}
            color="#a78bfa"
          />
          <Explain show={edu}>
            The QFT is computed via radix-2 FFT on the complex phase sequence e^(iφ(t)). The dominant peak reveals the estimated phase rotation frequency.
          </Explain>
        </Panel>

        <ActionButton onClick={handleExport} variant="primary" className="w-full justify-center">
          Export Results (JSON)
        </ActionButton>
      </div>

      {/* Right: 3D + Metrics */}
      <div className="space-y-5">
        {/* Bloch Sphere */}
        <div className="rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
                <SphereIcon />
              </div>
              <h2 className="text-sm font-medium tracking-tight">Bloch Sphere</h2>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={result.aliasDetected ? 'bad' : 'good'} label={result.aliasDetected ? 'Aliasing' : 'Clean'} />
              <p className="text-[10px] text-white/25">|ψ⟩ = cos(θ/2)|0⟩ + e<sup>iφ</sup>sin(θ/2)|1⟩</p>
            </div>
          </div>
          <Suspense fallback={
            <div className="flex items-center justify-center aspect-square text-white/20 text-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
                <span>Initializing quantum renderer…</span>
              </div>
            </div>
          }>
            <BlochSphere blochPath={interactivePath} animationSpeed={animSpeed} autoRotate className="aspect-square border-b border-white/[0.06]" />
          </Suspense>

          {/* Playground Controls */}
          <div className="flex items-center justify-between px-5 py-3 bg-white/[0.02]">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Apply Gates</span>
            <div className="flex items-center gap-2">
              <GateButton label="H" onClick={() => handleGate('H')} color="purple" />
              <GateButton label="X" onClick={() => handleGate('X')} color="red" />
              <GateButton label="Y" onClick={() => handleGate('Y')} color="blue" />
              <GateButton label="Z" onClick={() => handleGate('Z')} color="green" />
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button 
                onClick={() => setInteractivePath(result.blochPath)}
                className="rounded-md px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-[10px] text-white/50 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Estimated Freq" value={result.estimatedFrequency.toFixed(2)} unit="Hz" accent />
          <Metric label="True Freq" value={result.trueFrequency.toFixed(2)} unit="Hz" />
          <Metric label="Aliased Freq" value={result.aliasedFrequency.toFixed(2)} unit="Hz" warn={result.aliasDetected} />
          <Metric label="Phase Error" value={result.phaseError.toFixed(3)} unit="rad" />
          <Metric label="Fidelity" value={result.fidelity.toFixed(4)} accent />
          <Metric label="Shot Noise σ" value={result.shotNoise.toFixed(5)} />
          <Metric label="|1⟩ Probability" value={result.p1.toFixed(4)} />
          <Metric label="Nyquist Freq" value={(config.samplingRate / 2).toFixed(1)} unit="Hz" warn={result.aliasDetected} />
        </div>

        {/* Quality bars */}
        <Panel title="Signal Quality" icon={<QualIcon />}>
          <div className="space-y-3">
            <QualityBar value={result.confidence} label="Confidence" />
            <QualityBar value={result.fidelity * 100} label="Quantum Fidelity" />
            <QualityBar value={Math.max(0, Math.min(100, 100 * (1 - result.phaseError / Math.PI)))} label="Phase Accuracy" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────

function PresetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfigIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}

function SpecIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
      <rect x="3" y="12" width="3" height="9" rx="1" /><rect x="8" y="8" width="3" height="13" rx="1" />
      <rect x="13" y="4" width="3" height="17" rx="1" /><rect x="18" y="9" width="3" height="12" rx="1" />
    </svg>
  );
}

function SphereIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
      <circle cx="12" cy="12" r="10" /><path d="M12 2a15 15 0 0 1 0 20" /><path d="M2 12h20" />
    </svg>
  );
}

function QualIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function GateButton({ label, onClick, color }: { label: string, onClick: () => void, color: string }) {
  const colors: Record<string, string> = {
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]',
    red: 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
  };
  return (
    <button 
      onClick={onClick}
      className={`h-7 w-7 rounded border text-[11px] font-bold transition-all ${colors[color]}`}
    >
      {label}
    </button>
  );
}
