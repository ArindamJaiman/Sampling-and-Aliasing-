'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { decodeWav, encodeWav, downloadBlob, type AudioData } from '@/lib/audio';
import {
  downsample, applyCorrection, freqMetrics, analyzeAliasing,
  compareSignals, type CorrectionMethod, type Signal,
} from '@/lib/dsp';
import {
  isSupabaseConfigured, uploadAudioFile, listAudioFiles, deleteAudioFile,
  downloadAudioFile, type CloudAudioFile,
} from '@/lib/supabase';
import { Panel, Field, Metric, QualityBar, StatusBadge, Explain, ActionButton } from '@/components/ui-bits';
import { SpectrumChart } from '@/components/charts';

const CORRECTION_OPTIONS = [
  { value: 'fir', label: 'FIR Low-Pass' },
  { value: 'butterworth', label: 'Butterworth IIR' },
  { value: 'savgol', label: 'Savitzky-Golay' },
  { value: 'sinc-resample', label: 'Sinc Resampling' },
  { value: 'spline-resample', label: 'Spline Resampling' },
  { value: 'increase-fs', label: 'Increase Sample Rate' },
];

export default function AudioTab({ edu }: { edu: boolean }) {
  const [audioData, setAudioData] = useState<AudioData | null>(null);
  const [fileName, setFileName] = useState('');
  const [targetFs, setTargetFs] = useState(8000);
  const [corrMethod, setCorrMethod] = useState<CorrectionMethod>('fir');
  const [cutoffRatio, setCutoffRatio] = useState(0.9);
  const [playing, setPlaying] = useState<'none' | 'original' | 'aliased' | 'corrected'>('none');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Supabase cloud state
  const supabaseReady = isSupabaseConfigured();
  const [cloudFiles, setCloudFiles] = useState<CloudAudioFile[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const fileInputRef = useRef<File | null>(null);

  // ── Load cloud files on mount ─────────────────────────────

  useEffect(() => {
    if (supabaseReady) refreshCloudFiles();
  }, [supabaseReady]);

  const refreshCloudFiles = async () => {
    if (!supabaseReady) return;
    setCloudLoading(true);
    setCloudError(null);
    try {
      const files = await listAudioFiles();
      setCloudFiles(files);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setCloudLoading(false);
    }
  };

  // ── File upload ───────────────────────────────────────────

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await decodeWav(file);
      setAudioData(data);
      setFileName(file.name);
      setTargetFs(Math.min(data.fs / 2, 8000));
      fileInputRef.current = file;
    } catch (err) {
      console.error('WAV decode error:', err);
    }
  }, []);

  // ── Cloud upload ──────────────────────────────────────────

  const handleCloudUpload = useCallback(async () => {
    if (!fileInputRef.current || !supabaseReady) return;
    setUploadProgress(0);
    setCloudError(null);
    try {
      await uploadAudioFile(fileInputRef.current, setUploadProgress);
      await refreshCloudFiles();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadProgress(null);
    }
  }, [supabaseReady]);

  // ── Cloud download & load ─────────────────────────────────

  const handleCloudLoad = useCallback(async (file: CloudAudioFile) => {
    setCloudLoading(true);
    setCloudError(null);
    try {
      const buffer = await downloadAudioFile(file.path);
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const fileObj = new File([blob], file.name, { type: 'audio/wav' });
      const data = await decodeWav(fileObj);
      setAudioData(data);
      setFileName(file.name);
      setTargetFs(Math.min(data.fs / 2, 8000));
      fileInputRef.current = fileObj;
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setCloudLoading(false);
    }
  }, []);

  // ── Cloud delete ──────────────────────────────────────────

  const handleCloudDelete = useCallback(async (file: CloudAudioFile) => {
    setCloudError(null);
    try {
      await deleteAudioFile(file.path);
      await refreshCloudFiles();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, []);

  // ── Build signals ─────────────────────────────────────────

  const originalSignal = useMemo<Signal | null>(() => {
    if (!audioData) return null;
    return {
      samples: new Float64Array(audioData.samples),
      fs: audioData.fs,
      duration: audioData.samples.length / audioData.fs,
      label: 'original',
    };
  }, [audioData]);

  const aliasedSignal = useMemo<Signal | null>(() => {
    if (!originalSignal || targetFs >= originalSignal.fs) return null;
    const ds = downsample(originalSignal.samples, originalSignal.fs, targetFs);
    return { samples: ds, fs: targetFs, duration: ds.length / targetFs, label: 'aliased' };
  }, [originalSignal, targetFs]);

  const cutoff = cutoffRatio * (targetFs / 2);
  const correctedSignal = useMemo<Signal | null>(() => {
    if (!aliasedSignal) return null;
    return applyCorrection(aliasedSignal, corrMethod, cutoff);
  }, [aliasedSignal, corrMethod, cutoff]);

  // Metrics
  const origFM = useMemo(() => originalSignal ? freqMetrics(originalSignal) : null, [originalSignal]);
  const aliasFM = useMemo(() => aliasedSignal ? freqMetrics(aliasedSignal) : null, [aliasedSignal]);
  const corrFM = useMemo(() => correctedSignal ? freqMetrics(correctedSignal) : null, [correctedSignal]);
  const aliasReport = useMemo(
    () => aliasedSignal && aliasFM ? analyzeAliasing(aliasedSignal, aliasFM) : null,
    [aliasedSignal, aliasFM],
  );
  const comparison = useMemo(
    () => (aliasedSignal && correctedSignal && aliasFM && corrFM)
      ? compareSignals(aliasedSignal, correctedSignal, aliasFM, corrFM)
      : null,
    [aliasedSignal, correctedSignal, aliasFM, corrFM],
  );

  // ── Playback ──────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying('none');
  }, []);

  const play = useCallback(
    (which: 'original' | 'aliased' | 'corrected') => {
      stopPlayback();
      let samples: Float32Array;
      let fs: number;

      if (which === 'original' && audioData) {
        samples = audioData.samples;
        fs = audioData.fs;
      } else if (which === 'aliased' && aliasedSignal) {
        samples = new Float32Array(aliasedSignal.samples);
        fs = aliasedSignal.fs;
      } else if (which === 'corrected' && correctedSignal) {
        samples = new Float32Array(correctedSignal.samples);
        fs = correctedSignal.fs;
      } else return;

      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const buffer = ctx.createBuffer(1, samples.length, fs);
      buffer.getChannelData(0).set(samples);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setPlaying('none');
      source.start();
      sourceRef.current = source;
      setPlaying(which);
    },
    [audioData, aliasedSignal, correctedSignal, stopPlayback],
  );

  // ── Download corrected WAV ────────────────────────────────

  const handleDownload = () => {
    if (!correctedSignal) return;
    const wav = encodeWav(new Float32Array(correctedSignal.samples), correctedSignal.fs);
    downloadBlob(wav, `corrected_${corrMethod}_${correctedSignal.fs}Hz.wav`);
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Upload + Config row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Upload */}
        <Panel title="Audio Input" icon={<MicIcon />}>
          <label className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/[0.02] transition-all">
            <input type="file" accept=".wav" onChange={handleFile} className="hidden" />
            <UploadIcon />
            <span className="text-xs text-white/30 mt-2">
              {fileName || 'Drop a WAV file or click to browse'}
            </span>
          </label>
          {audioData && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-white/40">
              <span>Sample Rate: <span className="text-white/60 font-mono">{audioData.fs} Hz</span></span>
              <span>Channels: <span className="text-white/60 font-mono">{audioData.channels}</span></span>
              <span>Bit Depth: <span className="text-white/60 font-mono">{audioData.bitDepth}</span></span>
              <span>Duration: <span className="text-white/60 font-mono">{(audioData.samples.length / audioData.fs).toFixed(2)}s</span></span>
            </div>
          )}
          {/* Cloud upload button */}
          {audioData && supabaseReady && (
            <div className="mt-3">
              <ActionButton
                onClick={handleCloudUpload}
                variant="default"
                className="w-full justify-center"
                disabled={uploadProgress !== null}
              >
                <CloudUpIcon />
                {uploadProgress !== null ? `Uploading ${uploadProgress}%` : 'Save to Cloud'}
              </ActionButton>
              {uploadProgress !== null && (
                <div className="mt-2 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
          <Explain show={edu}>
            Upload any <strong>WAV file</strong> (8/16/32-bit PCM or float). The first channel is extracted and normalised to [-1, 1].
          </Explain>
        </Panel>

        {/* Downsample config */}
        <Panel title="Downsample" icon={<DownIcon />}>
          <div className="space-y-3">
            <Field
              label="Target Sample Rate"
              value={targetFs}
              onChange={(v) => setTargetFs(+v)}
              min={1000}
              max={audioData?.fs ?? 44100}
              step={500}
              unit="Hz"
            />
            <Field
              label="Correction Method"
              value={corrMethod}
              onChange={(v) => setCorrMethod(v as CorrectionMethod)}
              type="select"
              options={CORRECTION_OPTIONS}
            />
            <Field
              label="Cutoff"
              value={(cutoffRatio * 100).toFixed(0)}
              onChange={(v) => setCutoffRatio(+v / 100)}
              min={10}
              max={100}
              step={5}
              unit="% Nyquist"
            />
          </div>
          <Explain show={edu}>
            Reducing the sample rate below 2× the highest frequency in the audio creates <strong>aliasing artefacts</strong>. The correction filter attempts to remove these artefacts.
          </Explain>
        </Panel>

        {/* Playback */}
        <Panel title="Playback" icon={<PlayIcon />}>
          <div className="space-y-2">
            <PlayButton
              label="Original"
              active={playing === 'original'}
              disabled={!audioData}
              onPlay={() => play('original')}
              onStop={stopPlayback}
              color="blue"
            />
            <PlayButton
              label="Aliased"
              active={playing === 'aliased'}
              disabled={!aliasedSignal}
              onPlay={() => play('aliased')}
              onStop={stopPlayback}
              color="red"
            />
            <PlayButton
              label="Corrected"
              active={playing === 'corrected'}
              disabled={!correctedSignal}
              onPlay={() => play('corrected')}
              onStop={stopPlayback}
              color="emerald"
            />
          </div>
          <div className="mt-3">
            <ActionButton onClick={handleDownload} disabled={!correctedSignal} variant="primary" className="w-full justify-center">
              Download Corrected WAV
            </ActionButton>
          </div>
        </Panel>
      </div>

      {/* Supabase Audio Library */}
      {supabaseReady && (
        <Panel title="Cloud Audio Library" icon={<CloudIcon />} subtitle="Supabase Storage">
          {cloudError && (
            <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-xs text-red-400">
              ⚠ {cloudError}
            </div>
          )}
          {cloudLoading && cloudFiles.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-white/20">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-6 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
                <span className="text-xs">Loading library…</span>
              </div>
            </div>
          ) : cloudFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-white/20">
              <CloudIcon />
              <p className="text-xs mt-2">No audio files saved yet</p>
              <p className="text-[10px] text-white/10 mt-1">Upload a WAV file and click &quot;Save to Cloud&quot;</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {cloudFiles.map((file) => (
                <div
                  key={file.path}
                  className="group flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 hover:border-cyan-500/20 hover:bg-cyan-500/[0.02] transition-all"
                >
                  <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                      <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/70 truncate">{file.name}</p>
                    <p className="text-[10px] text-white/25">
                      {file.size > 0 ? `${(file.size / 1024).toFixed(0)} KB` : ''}
                      {file.createdAt ? ` · ${new Date(file.createdAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCloudLoad(file)}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleCloudDelete(file)}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-white/20">{cloudFiles.length} file(s)</span>
            <button
              onClick={refreshCloudFiles}
              disabled={cloudLoading}
              className="text-[10px] text-cyan-400/60 hover:text-cyan-400 transition-colors disabled:opacity-30"
            >
              ↻ Refresh
            </button>
          </div>
        </Panel>
      )}

      {/* Spectra comparison */}
      {audioData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Panel title="Original Spectrum" icon={<SpecIcon color="blue" />} subtitle={`${audioData.fs} Hz`}>
            {origFM && <SpectrumChart data={origFM.spectrum.slice(0, 200)} height={180} color="#60a5fa" />}
          </Panel>
          <Panel title="Aliased Spectrum" icon={<SpecIcon color="red" />} subtitle={`${targetFs} Hz`}>
            {aliasFM && (
              <SpectrumChart
                data={aliasFM.spectrum.slice(0, 200)}
                height={180}
                color="#f87171"
                nyquistFreq={targetFs / 2}
              />
            )}
          </Panel>
          <Panel title="Corrected Spectrum" icon={<SpecIcon color="emerald" />} subtitle={corrMethod}>
            {corrFM && (
              <SpectrumChart
                data={corrFM.spectrum.slice(0, 200)}
                height={180}
                color="#4ade80"
              />
            )}
          </Panel>
        </div>
      )}

      {/* Metrics + Quality */}
      {aliasReport && comparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Nyquist Freq" value={(targetFs / 2).toFixed(0)} unit="Hz" />
            <Metric label="Severity" value={(aliasReport.severity * 100).toFixed(1)} unit="%" warn={aliasReport.isAliased} />
            <Metric label="SNR Improvement" value={`${comparison.snrImprovement > 0 ? '+' : ''}${comparison.snrImprovement.toFixed(1)}`} unit="dB" accent={comparison.snrImprovement > 0} />
            <Metric label="Spectral Overlap" value={comparison.spectralOverlap.toFixed(1)} unit="%" />
          </div>
          <Panel title="Quality Comparison" icon={<QualIcon />}>
            <div className="space-y-3">
              <QualityBar value={aliasReport.qualityScore} label="Before Correction" />
              <QualityBar value={comparison.qualityAfter} label="After Correction" />
              <QualityBar value={comparison.spectralOverlap} label="Spectral Fidelity" />
            </div>
          </Panel>
        </div>
      )}

      {/* Empty state */}
      {!audioData && (
        <div className="flex flex-col items-center justify-center py-20 text-white/20">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4">
            <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          <p className="text-sm">Upload a WAV file to begin audio analysis</p>
          {supabaseReady && cloudFiles.length > 0 && (
            <p className="text-xs text-white/15 mt-1">Or load one from your cloud library above</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Play button ─────────────────────────────────────────────

function PlayButton({
  label,
  active,
  disabled,
  onPlay,
  onStop,
  color,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPlay: () => void;
  onStop: () => void;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    red: 'border-red-500/30 bg-red-500/10 text-red-400',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  };
  const activeMap: Record<string, string> = {
    blue: 'bg-blue-500/20 shadow-lg shadow-blue-500/10',
    red: 'bg-red-500/20 shadow-lg shadow-red-500/10',
    emerald: 'bg-emerald-500/20 shadow-lg shadow-emerald-500/10',
  };

  return (
    <button
      onClick={active ? onStop : onPlay}
      disabled={disabled}
      className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? activeMap[color] : ''
      } ${colorMap[color]}`}
    >
      {active ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>
      )}
      {label}
      {active && <span className="ml-auto text-[10px] opacity-60">Playing…</span>}
    </button>
  );
}

// ── Icons ───────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloudUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-current">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16l-4-4-4 4M12 12v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpecIcon({ color }: { color: string }) {
  const colors: Record<string, string> = { blue: 'text-blue-400', red: 'text-red-400', emerald: 'text-emerald-400' };
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={colors[color]}>
      <rect x="3" y="12" width="3" height="9" rx="1" /><rect x="8" y="8" width="3" height="13" rx="1" />
      <rect x="13" y="4" width="3" height="17" rx="1" /><rect x="18" y="9" width="3" height="12" rx="1" />
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
