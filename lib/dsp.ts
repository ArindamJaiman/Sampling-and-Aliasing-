// ─────────────────────────────────────────────────────────────
//  DSP Engine — zero-dependency, pure-TypeScript
//  FFT, signal generators, metrics, aliasing analysis,
//  anti-alias corrections, comparison utilities.
// ─────────────────────────────────────────────────────────────

// ── Types ───────────────────────────────────────────────────

export interface Signal {
  samples: Float64Array;
  fs: number;          // sampling rate (Hz)
  duration: number;    // seconds
  label?: string;
  trueFrequencies?: number[];
}

export interface SpectrumPoint {
  frequency: number;
  magnitude: number;
  phase: number;
}

export interface TimeMetrics {
  peak: number;
  rms: number;
  energy: number;
  power: number;
  dcOffset: number;
  duration: number;
  sampleCount: number;
}

export interface FreqMetrics {
  spectrum: SpectrumPoint[];
  dominantPeaks: { frequency: number; magnitude: number }[];
  bandwidth: number;
  spectralCentroid: number;
  snr: number;
  noiseFloor: number;
}

export interface AliasingReport {
  isAliased: boolean;
  nyquistFrequency: number;
  foldedComponents: { original: number; folded: number; magnitude: number }[];
  severity: number;      // 0–1
  qualityScore: number;  // 0–100
  confidence: number;    // 0–100
}

export interface CorrectionResult {
  signal: Signal;
  method: CorrectionMethod;
  improvement: number;   // percentage
}

export interface ComparisonResult {
  snrImprovement: number;
  rmsChange: number;
  spectralOverlap: number;
  qualityBefore: number;
  qualityAfter: number;
}

export type WaveformType =
  | 'sine' | 'cosine' | 'square' | 'triangle' | 'sawtooth'
  | 'chirp' | 'gaussian-pulse' | 'exponential-decay'
  | 'noisy' | 'multi-frequency';

export type CorrectionMethod =
  | 'increase-fs' | 'fir' | 'butterworth'
  | 'savgol' | 'sinc-resample' | 'spline-resample';

// ── FFT ─────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 Cooley-Tukey FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle), wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let cRe = 1, cIm = 0;
      for (let j = 0; j < half; j++) {
        const tRe = cRe * re[i + j + half] - cIm * im[i + j + half];
        const tIm = cRe * im[i + j + half] + cIm * re[i + j + half];
        re[i + j + half] = re[i + j] - tRe;
        im[i + j + half] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const nRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nRe;
      }
    }
  }
}

/** Inverse FFT. */
export function ifft(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  for (let i = 0; i < N; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < N; i++) { re[i] /= N; im[i] = -im[i] / N; }
}

/** Compute magnitude spectrum with Hann window. */
export function computeSpectrum(samples: Float64Array, fs: number): SpectrumPoint[] {
  const n = samples.length;
  const N = nextPow2(n);
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  // Hann window
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
    re[i] = samples[i] * w;
  }
  fft(re, im);

  const result: SpectrumPoint[] = [];
  const halfN = N >> 1;
  for (let k = 0; k <= halfN; k++) {
    result.push({
      frequency: (k * fs) / N,
      magnitude: (2 * Math.sqrt(re[k] ** 2 + im[k] ** 2)) / N,
      phase: Math.atan2(im[k], re[k]),
    });
  }
  return result;
}

// ── Signal generators ───────────────────────────────────────

export function generateWave(
  type: WaveformType,
  frequency: number,
  fs: number,
  duration: number,
): Signal {
  const n = Math.max(2, Math.round(fs * duration));
  const samples = new Float64Array(n);
  const dt = 1 / fs;
  const trueFrequencies: number[] = [];

  switch (type) {
    case 'sine':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * frequency * i * dt);
      break;
    case 'cosine':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) samples[i] = Math.cos(2 * Math.PI * frequency * i * dt);
      break;
    case 'square':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * frequency * i * dt) >= 0 ? 1 : -1;
      break;
    case 'triangle':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) {
        const t = i * dt * frequency;
        samples[i] = 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1;
      }
      break;
    case 'sawtooth':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) {
        const t = i * dt * frequency;
        samples[i] = 2 * (t - Math.floor(t + 0.5));
      }
      break;
    case 'chirp':
      trueFrequencies.push(frequency, frequency * 4);
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        const f = frequency + (frequency * 3 * t) / duration;
        samples[i] = Math.sin(2 * Math.PI * f * t);
      }
      break;
    case 'gaussian-pulse': {
      trueFrequencies.push(frequency);
      const center = duration / 2;
      const sigma = duration / 8;
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        samples[i] = Math.exp(-((t - center) ** 2) / (2 * sigma ** 2)) *
          Math.sin(2 * Math.PI * frequency * t);
      }
      break;
    }
    case 'exponential-decay':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        samples[i] = Math.exp(-3 * t / duration) * Math.sin(2 * Math.PI * frequency * t);
      }
      break;
    case 'noisy':
      trueFrequencies.push(frequency);
      for (let i = 0; i < n; i++) {
        samples[i] = Math.sin(2 * Math.PI * frequency * i * dt) + 0.3 * (Math.random() * 2 - 1);
      }
      break;
    case 'multi-frequency':
      trueFrequencies.push(frequency, frequency * 2.5, frequency * 4.1);
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        samples[i] =
          Math.sin(2 * Math.PI * frequency * t) +
          0.5 * Math.sin(2 * Math.PI * frequency * 2.5 * t) +
          0.3 * Math.sin(2 * Math.PI * frequency * 4.1 * t);
      }
      break;
  }

  return { samples, fs, duration, label: type, trueFrequencies };
}

// ── Expression evaluator ────────────────────────────────────

const SAFE_MATH: Record<string, unknown> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  exp: Math.exp, log: Math.log, sqrt: Math.sqrt,
  abs: Math.abs, pow: Math.pow,
  pi: Math.PI, PI: Math.PI, e: Math.E,
  ceil: Math.ceil, floor: Math.floor, round: Math.round,
  min: Math.min, max: Math.max,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
};

export function evalExpression(expr: string, fs: number, duration: number): Signal {
  const n = Math.max(2, Math.round(fs * duration));
  const samples = new Float64Array(n);
  const dt = 1 / fs;

  // Build a safe evaluator using Function constructor with whitelisted names
  const paramNames = Object.keys(SAFE_MATH);
  const paramValues = Object.values(SAFE_MATH);

  try {
    const fn = new Function(...paramNames, 't', `"use strict"; return (${expr});`);
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const val = fn(...paramValues, t);
      samples[i] = typeof val === 'number' && isFinite(val) ? val : 0;
    }
  } catch {
    // If expression is invalid, return silence
    samples.fill(0);
  }

  return { samples, fs, duration, label: 'expression' };
}

// ── CSV parser ──────────────────────────────────────────────

export function parseCSV(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => parseFloat(s.trim()))
    .filter((v) => isFinite(v));
}

// ── Time-domain metrics ─────────────────────────────────────

export function timeMetrics(signal: Signal): TimeMetrics {
  const { samples, fs } = signal;
  const n = samples.length;
  let peak = 0, sum = 0, sumSq = 0;

  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (Math.abs(v) > peak) peak = Math.abs(v);
    sum += v;
    sumSq += v * v;
  }

  const dcOffset = sum / n;
  const rms = Math.sqrt(sumSq / n);
  const energy = sumSq;
  const duration = n / fs;
  const power = energy / duration;

  return { peak, rms, energy, power, dcOffset, duration, sampleCount: n };
}

// ── Frequency-domain metrics ────────────────────────────────

export function freqMetrics(signal: Signal): FreqMetrics {
  const spectrum = computeSpectrum(signal.samples, signal.fs);

  // Find dominant peaks (local maxima above 10% of max)
  const maxMag = Math.max(...spectrum.map((s) => s.magnitude), 1e-12);
  const threshold = maxMag * 0.1;
  const peaks: { frequency: number; magnitude: number }[] = [];

  for (let i = 1; i < spectrum.length - 1; i++) {
    if (
      spectrum[i].magnitude > threshold &&
      spectrum[i].magnitude > spectrum[i - 1].magnitude &&
      spectrum[i].magnitude > spectrum[i + 1].magnitude
    ) {
      peaks.push({ frequency: spectrum[i].frequency, magnitude: spectrum[i].magnitude });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);

  // Spectral centroid
  let weightedSum = 0, magSum = 0;
  for (const s of spectrum) {
    weightedSum += s.frequency * s.magnitude;
    magSum += s.magnitude;
  }
  const spectralCentroid = magSum > 0 ? weightedSum / magSum : 0;

  // Bandwidth (frequency range containing 90% of energy)
  const totalEnergy = spectrum.reduce((s, p) => s + p.magnitude ** 2, 0);
  let cumEnergy = 0;
  let lowBand = 0, highBand = 0;
  for (let i = 0; i < spectrum.length; i++) {
    cumEnergy += spectrum[i].magnitude ** 2;
    if (cumEnergy >= totalEnergy * 0.05 && lowBand === 0) lowBand = spectrum[i].frequency;
    if (cumEnergy >= totalEnergy * 0.95) { highBand = spectrum[i].frequency; break; }
  }

  // SNR and noise floor
  const signalPower = peaks.slice(0, 5).reduce((s, p) => s + p.magnitude ** 2, 0);
  const noisePower = Math.max(1e-20, totalEnergy - signalPower);
  const snr = 10 * Math.log10(signalPower / noisePower);
  const noiseFloor = 10 * Math.log10(noisePower / spectrum.length);

  return {
    spectrum,
    dominantPeaks: peaks.slice(0, 10),
    bandwidth: highBand - lowBand,
    spectralCentroid,
    snr,
    noiseFloor,
  };
}

// ── Aliasing analysis ───────────────────────────────────────

export function analyzeAliasing(
  signal: Signal,
  fm: FreqMetrics,
): AliasingReport {
  const nyq = signal.fs / 2;
  const trueFreqs = signal.trueFrequencies ?? fm.dominantPeaks.map((p) => p.frequency);
  const foldedComponents: AliasingReport['foldedComponents'] = [];

  for (const f of trueFreqs) {
    if (f > nyq) {
      // Compute folded frequency
      let folded = f % signal.fs;
      if (folded > nyq) folded = signal.fs - folded;
      const mag = fm.dominantPeaks.find(
        (p) => Math.abs(p.frequency - folded) < signal.fs / signal.samples.length,
      )?.magnitude ?? 0;
      foldedComponents.push({ original: f, folded, magnitude: mag });
    }
  }

  const isAliased = foldedComponents.length > 0;
  const severity = trueFreqs.length > 0
    ? foldedComponents.length / trueFreqs.length
    : 0;

  // Quality: 100 = perfect, 0 = fully aliased
  const qualityScore = Math.max(0, Math.min(100, 100 * (1 - severity)));
  const confidence = Math.min(100, 50 + fm.dominantPeaks.length * 10);

  return { isAliased, nyquistFrequency: nyq, foldedComponents, severity, qualityScore, confidence };
}

// ── Downsampling ────────────────────────────────────────────

export function downsample(samples: Float64Array, fsIn: number, fsOut: number): Float64Array {
  if (fsOut >= fsIn) return new Float64Array(samples);
  const ratio = Math.round(fsIn / fsOut);
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float64Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = samples[i * ratio];
  return out;
}

// ── Sinc resampling ─────────────────────────────────────────

export function sincResample(samples: Float64Array, fsIn: number, fsOut: number): Float64Array {
  const ratio = fsOut / fsIn;
  const outLen = Math.round(samples.length * ratio);
  const out = new Float64Array(outLen);
  const halfWin = 16; // sinc kernel half-width

  for (let i = 0; i < outLen; i++) {
    const srcIdx = i / ratio;
    let sum = 0;
    for (let j = Math.max(0, Math.floor(srcIdx) - halfWin);
         j <= Math.min(samples.length - 1, Math.ceil(srcIdx) + halfWin);
         j++) {
      const x = srcIdx - j;
      const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      // Hann window on the sinc kernel
      const win = (Math.abs(x) <= halfWin)
        ? 0.5 * (1 + Math.cos(Math.PI * x / halfWin))
        : 0;
      sum += samples[j] * sinc * win;
    }
    out[i] = sum;
  }
  return out;
}

// ── Anti-alias correction methods ───────────────────────────

/** FIR low-pass via windowed-sinc. */
function firLowPass(samples: Float64Array, fs: number, cutoff: number): Float64Array {
  const fc = cutoff / fs;
  const order = 63;
  const half = (order - 1) / 2;
  const kernel = new Float64Array(order);

  for (let i = 0; i < order; i++) {
    const x = i - half;
    const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (order - 1)); // Hamming
    kernel[i] = sinc * win * 2 * fc;
  }

  // Normalize
  const kSum = kernel.reduce((a, b) => a + b, 0);
  for (let i = 0; i < order; i++) kernel[i] /= kSum;

  // Convolve
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let j = 0; j < order; j++) {
      const idx = i - j + Math.floor(half);
      if (idx >= 0 && idx < samples.length) sum += samples[idx] * kernel[j];
    }
    out[i] = sum;
  }
  return out;
}

/** IIR Butterworth low-pass (2nd order). */
function butterworthLowPass(samples: Float64Array, fs: number, cutoff: number): Float64Array {
  const wc = Math.tan(Math.PI * cutoff / fs);
  const wc2 = wc * wc;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * wc + wc2);

  const a0 = wc2 * norm;
  const a1 = 2 * a0;
  const a2 = a0;
  const b1 = 2 * (wc2 - 1) * norm;
  const b2 = (1 - sqrt2 * wc + wc2) * norm;

  const out = new Float64Array(samples.length);
  let y1 = 0, y2 = 0, x1 = 0, x2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    out[i] = a0 * x + a1 * x1 + a2 * x2 - b1 * y1 - b2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = out[i];
  }
  return out;
}

/** Savitzky-Golay smoothing filter (order 2, window 7). */
function savgolFilter(samples: Float64Array, _fs: number, _cutoff: number): Float64Array {
  const windowSize = 7;
  const half = 3;
  // Pre-computed SG coefficients for quadratic, window=7
  const coeffs = [-2/21, 3/21, 6/21, 7/21, 6/21, 3/21, -2/21];
  const out = new Float64Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const idx = i - half + j;
      const val = idx < 0 ? samples[0] : idx >= samples.length ? samples[samples.length - 1] : samples[idx];
      sum += val * coeffs[j];
    }
    out[i] = sum;
  }
  return out;
}

/** Cubic spline interpolation resampling. */
function splineResample(samples: Float64Array, fsIn: number, fsOut: number): Float64Array {
  const ratio = fsOut / fsIn;
  const outLen = Math.round(samples.length * ratio);
  const out = new Float64Array(outLen);
  const n = samples.length;

  for (let i = 0; i < outLen; i++) {
    const srcIdx = i / ratio;
    const i0 = Math.floor(srcIdx);
    const t = srcIdx - i0;

    const p0 = samples[Math.max(0, i0 - 1)];
    const p1 = samples[Math.min(n - 1, i0)];
    const p2 = samples[Math.min(n - 1, i0 + 1)];
    const p3 = samples[Math.min(n - 1, i0 + 2)];

    // Catmull-Rom spline
    out[i] = 0.5 * (
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + p2) * t +
      2 * p1
    );
  }
  return out;
}

export function applyCorrection(
  signal: Signal,
  method: CorrectionMethod,
  cutoff?: number,
): Signal {
  const fc = cutoff ?? signal.fs / 2 * 0.9;
  let corrected: Float64Array;
  let newFs = signal.fs;

  switch (method) {
    case 'increase-fs':
      // Conceptual: just double the effective sample rate via sinc interpolation
      corrected = sincResample(signal.samples, signal.fs, signal.fs * 2);
      newFs = signal.fs * 2;
      break;
    case 'fir':
      corrected = firLowPass(signal.samples, signal.fs, fc);
      break;
    case 'butterworth':
      corrected = butterworthLowPass(signal.samples, signal.fs, fc);
      break;
    case 'savgol':
      corrected = savgolFilter(signal.samples, signal.fs, fc);
      break;
    case 'sinc-resample':
      corrected = sincResample(signal.samples, signal.fs, signal.fs * 2);
      newFs = signal.fs * 2;
      break;
    case 'spline-resample':
      corrected = splineResample(signal.samples, signal.fs, signal.fs * 2);
      newFs = signal.fs * 2;
      break;
    default:
      corrected = new Float64Array(signal.samples);
  }

  return {
    samples: corrected,
    fs: newFs,
    duration: corrected.length / newFs,
    label: `${signal.label} (${method})`,
    trueFrequencies: signal.trueFrequencies,
  };
}

// ── Signal comparison ───────────────────────────────────────

export function compareSignals(
  a: Signal,
  b: Signal,
  fmA: FreqMetrics,
  fmB: FreqMetrics,
): ComparisonResult {
  const snrImprovement = fmB.snr - fmA.snr;
  const rmsA = Math.sqrt(a.samples.reduce((s, v) => s + v * v, 0) / a.samples.length);
  const rmsB = Math.sqrt(b.samples.reduce((s, v) => s + v * v, 0) / b.samples.length);
  const rmsChange = rmsA > 0 ? ((rmsB - rmsA) / rmsA) * 100 : 0;

  // Spectral overlap (correlation of magnitude spectra)
  const minLen = Math.min(fmA.spectrum.length, fmB.spectrum.length);
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < minLen; i++) {
    dotProduct += fmA.spectrum[i].magnitude * fmB.spectrum[i].magnitude;
    normA += fmA.spectrum[i].magnitude ** 2;
    normB += fmB.spectrum[i].magnitude ** 2;
  }
  const spectralOverlap = (normA > 0 && normB > 0)
    ? dotProduct / Math.sqrt(normA * normB) * 100
    : 0;

  const reportA = analyzeAliasing(a, fmA);
  const reportB = analyzeAliasing(b, fmB);

  return {
    snrImprovement,
    rmsChange,
    spectralOverlap,
    qualityBefore: reportA.qualityScore,
    qualityAfter: reportB.qualityScore,
  };
}
