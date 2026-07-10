'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import {
  generateWave, evalExpression, parseCSV,
  timeMetrics, freqMetrics, analyzeAliasing,
  applyCorrection, compareSignals, downsample, computeSTFT,
  type WaveformType, type CorrectionMethod, type Signal,
} from '@/lib/dsp';
import { downloadText } from '@/lib/audio';
import { Panel, Metric, Field, QualityBar, StatusBadge, Explain, ActionButton } from '@/components/ui-bits';
import { SignalChart, SpectrumChart } from '@/components/charts';

const WaterfallPlot = lazy(() => import('@/components/waterfall-plot'));

type InputMode = 'generator' | 'expression' | 'csv';

const WAVEFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'cosine', label: 'Cosine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'chirp', label: 'Chirp (sweep)' },
  { value: 'gaussian-pulse', label: 'Gaussian Pulse' },
  { value: 'exponential-decay', label: 'Exponential Decay' },
  { value: 'noisy', label: 'Noisy Sine' },
  { value: 'multi-frequency', label: 'Multi-Frequency' },
];

const CORRECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'fir', label: 'FIR Low-Pass' },
  { value: 'butterworth', label: 'Butterworth IIR' },
  { value: 'savgol', label: 'Savitzky-Golay' },
  { value: 'sinc-resample', label: 'Sinc Resampling' },
  { value: 'spline-resample', label: 'Spline Resampling' },
  { value: 'increase-fs', label: 'Increase Sample Rate' },
];

export default function ClassicalTab({ edu }: { edu: boolean }) {
  // Input config
  const [mode, setMode] = useState<InputMode>('generator');
  const [waveType, setWaveType] = useState<WaveformType>('sine');
  const [frequency, setFrequency] = useState(40);
  const [sourceRate, setSourceRate] = useState(1000);
  const [samplingRate, setSamplingRate] = useState(100);
  const [duration, setDuration] = useState(0.5);
  const [expression, setExpression] = useState('sin(2*pi*40*t) + 0.5*sin(2*pi*90*t)');
  const [csvData, setCsvData] = useState('');
  const [csvFs, setCsvFs] = useState(100);

  // Correction
  const [corrMethod, setCorrMethod] = useState<CorrectionMethod>('fir');
  const [cutoffRatio, setCutoffRatio] = useState(0.9);
  const [showCorrection, setShowCorrection] = useState(false);

  // ── Compute ───────────────────────────────────────────────

  const sourceSignal = useMemo<Signal>(() => {
    switch (mode) {
      case 'generator':
        return generateWave(waveType, frequency, sourceRate, duration);
      case 'expression':
        return evalExpression(expression, sourceRate, duration);
      case 'csv': {
        const vals = parseCSV(csvData);
        if (vals.length < 2) return { samples: new Float64Array([0, 0]), fs: csvFs, duration: 2 / csvFs };
        return {
          samples: new Float64Array(vals),
          fs: csvFs,
          duration: vals.length / csvFs,
        };
      }
    }
  }, [mode, waveType, frequency, sourceRate, duration, expression, csvData, csvFs]);

  // Downsample to sampling rate
  const sampledSignal = useMemo<Signal>(() => {
    const ds = downsample(sourceSignal.samples, sourceRate, samplingRate);
    return {
      samples: ds,
      fs: samplingRate,
      duration: ds.length / samplingRate,
      trueFrequencies: sourceSignal.trueFrequencies,
      label: 'sampled',
    };
  }, [sourceSignal, sourceRate, samplingRate]);

  // Metrics
  const srcTime = useMemo(() => timeMetrics(sourceSignal), [sourceSignal]);
  const sampTime = useMemo(() => timeMetrics(sampledSignal), [sampledSignal]);
  const srcFreq = useMemo(() => freqMetrics(sourceSignal), [sourceSignal]);
  const sampFreq = useMemo(() => freqMetrics(sampledSignal), [sampledSignal]);
  const aliasReport = useMemo(() => analyzeAliasing(sampledSignal, sampFreq), [sampledSignal, sampFreq]);

  // Correction
  const cutoff = cutoffRatio * (samplingRate / 2);
  const corrected = useMemo(
    () => showCorrection ? applyCorrection(sampledSignal, corrMethod, cutoff) : null,
    [showCorrection, sampledSignal, corrMethod, cutoff],
  );
  const corrFreq = useMemo(() => corrected ? freqMetrics(corrected) : null, [corrected]);
  const comparison = useMemo(
    () => (corrected && corrFreq) ? compareSignals(sampledSignal, corrected, sampFreq, corrFreq) : null,
    [corrected, corrFreq, sampledSignal, sampFreq],
  );

  // STFT for Waterfall
  const stftResult = useMemo(() => {
    const target = corrected ?? sampledSignal;
    const n = target.samples.length;
    // Scale window size to get a decent number of time slices regardless of signal length
    const winSize = Math.min(256, Math.max(16, Math.floor(n / 4))); 
    const hopSize = Math.max(1, Math.floor(winSize / 8));
    return computeSTFT(target.samples, target.fs, winSize, hopSize);
  }, [sampledSignal, corrected]);

  // Chart data
  const sourceChartData = useMemo(
    () => Array.from(sourceSignal.samples).map((v, i) => ({ t: i / sourceSignal.fs, value: v })),
    [sourceSignal],
  );
  const sampledChartData = useMemo(
    () => Array.from(sampledSignal.samples).map((v, i) => ({ t: i / sampledSignal.fs, value: v })),
    [sampledSignal],
  );
  const correctedChartData = useMemo(
    () => corrected ? Array.from(corrected.samples).map((v, i) => ({ t: i / corrected.fs, value: v })) : undefined,
    [corrected],
  );

  // ── Export ────────────────────────────────────────────────

  const handleExport = () => {
    const target = corrected ?? sampledSignal;
    const csv = Array.from(target.samples).join(',');
    downloadText(csv, `signal_${corrMethod}_fs${target.fs}.csv`);
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
      {/* Left: Controls */}
      <div className="space-y-5">
        {/* Input Mode */}
        <Panel title="Signal Input" icon={<WaveIcon />}>
          <div className="flex gap-1 mb-4 rounded-lg bg-white/[0.03] p-1">
            {(['generator', 'expression', 'csv'] as InputMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  mode === m
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                {m === 'generator' ? 'Generator' : m === 'expression' ? 'Expression' : 'CSV'}
              </button>
            ))}
          </div>

          {mode === 'generator' && (
            <div className="space-y-3">
              <Field label="Waveform" value={waveType} onChange={(v) => setWaveType(v as WaveformType)} type="select" options={WAVEFORM_OPTIONS} />
              <Field label="Frequency" value={frequency} onChange={(v) => setFrequency(+v)} min={1} max={500} step={1} unit="Hz" />
            </div>
          )}
          {mode === 'expression' && (
            <Field label="f(t) =" value={expression} onChange={setExpression} type="text" />
          )}
          {mode === 'csv' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-white/40">Paste data</label>
                <textarea
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white/60 outline-none focus:border-cyan-500/30 resize-none"
                  placeholder="0.1, 0.5, 0.8, 1.0, 0.8, ..."
                />
              </div>
              <Field label="Sample Rate" value={csvFs} onChange={(v) => setCsvFs(+v)} min={1} max={100000} step={1} unit="Hz" type="number" />
            </div>
          )}

          <Explain show={edu}>
            <strong>Generator</strong> creates ideal waveforms. <strong>Expression</strong> evaluates any math formula as f(t). <strong>CSV</strong> lets you paste real-world data.
          </Explain>
        </Panel>

        {/* Sampling config */}
        <Panel title="Sampling" icon={<SampleIcon />} subtitle="Source vs sampling rate">
          <div className="space-y-3">
            <Field label="Source Rate" value={sourceRate} onChange={(v) => setSourceRate(+v)} min={100} max={10000} step={100} unit="Hz" />
            <Field label="Sampling Rate" value={samplingRate} onChange={(v) => setSamplingRate(+v)} min={5} max={2000} step={5} unit="Hz" />
            <Field label="Duration" value={duration} onChange={(v) => setDuration(+v)} min={0.05} max={5} step={0.05} unit="s" />
          </div>
          <Explain show={edu}>
            Set the <strong>source rate</strong> high for a "ground truth" signal, then lower the <strong>sampling rate</strong> to observe aliasing when it drops below 2× the signal frequency (Nyquist limit).
          </Explain>
        </Panel>

        {/* Correction */}
        <Panel title="Anti-Alias Correction" icon={<FilterIcon />}>
          <div className="space-y-3">
            <Field label="Method" value={corrMethod} onChange={(v) => setCorrMethod(v as CorrectionMethod)} type="select" options={CORRECTION_OPTIONS} />
            <Field label="Cutoff" value={(cutoffRatio * 100).toFixed(0)} onChange={(v) => setCutoffRatio(+v / 100)} min={10} max={100} step={5} unit="% Nyquist" />
            <div className="flex gap-2">
              <ActionButton onClick={() => setShowCorrection(true)} variant="primary">
                Apply
              </ActionButton>
              <ActionButton onClick={() => setShowCorrection(false)} variant="ghost">
                Reset
              </ActionButton>
              <ActionButton onClick={handleExport} variant="default">
                Export CSV
              </ActionButton>
            </div>
          </div>
          <Explain show={edu}>
            <strong>FIR</strong>: windowed-sinc filter. <strong>Butterworth</strong>: smooth IIR roll-off. <strong>Savitzky-Golay</strong>: polynomial smoothing. <strong>Sinc/Spline</strong>: band-limited interpolation resampling.
          </Explain>
        </Panel>
      </div>

      {/* Right: Charts + Metrics */}
      <div className="space-y-5">
        {/* Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge
            status={aliasReport.isAliased ? 'bad' : 'good'}
            label={aliasReport.isAliased ? 'Aliasing Detected' : 'No Aliasing'}
          />
          {aliasReport.foldedComponents.length > 0 && (
            <span className="text-xs text-white/30">
              {aliasReport.foldedComponents.length} folded component(s)
            </span>
          )}
          {comparison && (
            <StatusBadge
              status={comparison.snrImprovement > 0 ? 'good' : 'warn'}
              label={`SNR ${comparison.snrImprovement > 0 ? '+' : ''}${comparison.snrImprovement.toFixed(1)} dB`}
            />
          )}
        </div>

        {/* Time domain charts */}
        <Panel title="Time Domain" icon={<ChartIcon />}>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1">Source signal ({sourceRate} Hz)</p>
              <SignalChart data={sourceChartData} height={160} label="Source" color="#60a5fa" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1">
                Sampled ({samplingRate} Hz)
                {corrected && ' + Corrected'}
              </p>
              <SignalChart
                data={sampledChartData}
                overlayData={correctedChartData}
                height={160}
                label="Sampled"
                overlayLabel="Corrected"
              />
            </div>
          </div>
        </Panel>

        {/* Frequency domain */}
        <Panel title="Frequency Domain" icon={<SpectrumIcon />}>
          <SpectrumChart
            data={sampFreq.spectrum.slice(0, 200)}
            overlayData={corrFreq?.spectrum.slice(0, 200)}
            nyquistFreq={samplingRate / 2}
            height={200}
          />
          <Explain show={edu}>
            The <strong>cyan area</strong> shows the sampled spectrum. The dashed <strong>Nyquist line</strong> marks the maximum representable frequency. Peaks beyond it are aliased (folded) into lower frequencies.
          </Explain>
        </Panel>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Peak" value={sampTime.peak.toFixed(3)} />
          <Metric label="RMS" value={sampTime.rms.toFixed(4)} />
          <Metric label="DC Offset" value={sampTime.dcOffset.toFixed(4)} />
          <Metric label="Samples" value={sampTime.sampleCount} />
          <Metric label="Dominant Freq" value={sampFreq.dominantPeaks[0]?.frequency.toFixed(1) ?? '—'} unit="Hz" accent />
          <Metric label="Bandwidth" value={sampFreq.bandwidth.toFixed(1)} unit="Hz" />
          <Metric label="SNR" value={sampFreq.snr.toFixed(1)} unit="dB" />
          <Metric label="Spectral Centroid" value={sampFreq.spectralCentroid.toFixed(1)} unit="Hz" />
        </div>

        {/* Quality */}
        <Panel title="Signal Quality" icon={<QualityIcon />}>
          <div className="space-y-3">
            <QualityBar value={aliasReport.qualityScore} label="Aliasing Quality" />
            <QualityBar value={aliasReport.confidence} label="Confidence" />
            {comparison && (
              <>
                <QualityBar value={comparison.qualityAfter} label="Corrected Quality" />
                <QualityBar value={comparison.spectralOverlap} label="Spectral Overlap" />
              </>
            )}
          </div>
        </Panel>

        {/* Folded components table */}
        {aliasReport.foldedComponents.length > 0 && (
          <Panel title="Folded Components" icon={<WarnIcon />}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
                    <th className="text-left py-2 pr-4">Original Freq</th>
                    <th className="text-left py-2 pr-4">Folded Freq</th>
                    <th className="text-left py-2">Magnitude</th>
                  </tr>
                </thead>
                <tbody>
                  {aliasReport.foldedComponents.map((fc, i) => (
                    <tr key={i} className="border-b border-white/[0.03] text-white/60">
                      <td className="py-2 pr-4 font-mono">{fc.original.toFixed(1)} Hz</td>
                      <td className="py-2 pr-4 font-mono text-red-400">{fc.folded.toFixed(1)} Hz</td>
                      <td className="py-2 font-mono">{fc.magnitude.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Explain show={edu}>
              When a frequency <strong>f</strong> exceeds the Nyquist limit (fs/2), it "folds" back to <code>|f mod fs - fs/2|</code>, creating a ghost tone at a lower frequency that didn't exist in the original signal.
            </Explain>
          </Panel>
        )}
      </div>

      {/* 3D Spectrogram (Full Width) */}
      <div className="lg:col-span-2 space-y-3 mt-4">
        <Suspense fallback={
          <div className="flex items-center justify-center h-80 rounded-2xl border border-white/[0.06] bg-black/40 text-white/20 text-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
              <span>Initializing 3D Spectrogram…</span>
            </div>
          </div>
        }>
          <WaterfallPlot stft={stftResult} className="h-96 w-full" autoPan={true} />
        </Suspense>
      </div>
    </div>
  );
}

// ── Inline SVG icons ────────────────────────────────────────

function WaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
      <path d="M2 12c2-4 4-8 6 0s4 4 6 0 4-8 6 0" strokeLinecap="round" />
    </svg>
  );
}

function SampleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
      <circle cx="6" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="8" r="1.5" fill="currentColor" /><circle cx="18" cy="14" r="1.5" fill="currentColor" />
      <path d="M6 12 L12 8 L18 14" strokeDasharray="2 2" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
      <path d="M3 6h18M6 12h12M9 18h6" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
      <path d="M3 20L9 14 13 18 21 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpectrumIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
      <rect x="3" y="12" width="3" height="9" rx="1" /><rect x="8" y="8" width="3" height="13" rx="1" />
      <rect x="13" y="4" width="3" height="17" rx="1" /><rect x="18" y="9" width="3" height="12" rx="1" />
    </svg>
  );
}

function QualityIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}
