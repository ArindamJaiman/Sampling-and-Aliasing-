// ─────────────────────────────────────────────────────────────
//  Quantum Simulation Engine
//  Pure-TypeScript qubit phase-evolution, QFT, Bloch-sphere
//  path generation, and shot-noise measurement simulation.
// ─────────────────────────────────────────────────────────────

export interface QuantumConfig {
  phaseFrequency: number;   // Hz – frequency of phase rotation φ(t) = 2π·f·t
  samplingRate: number;     // Hz – rate at which we sample the phase
  duration: number;         // seconds
  shots: number;            // number of measurement shots
  theta: number;            // Bloch polar angle θ (radians)
  noise: number;            // depolarising noise probability [0, 1]
}

export interface BlochPoint {
  x: number;
  y: number;
  z: number;
  t: number;                // time stamp
  phi: number;              // azimuthal phase at this sample
}

export interface QFTPoint {
  frequency: number;
  magnitude: number;
}

export interface QuantumResult {
  // Raw data
  phases: number[];
  blochPath: BlochPoint[];
  qftSpectrum: QFTPoint[];

  // Metrics
  estimatedFrequency: number;
  trueFrequency: number;
  aliasDetected: boolean;
  aliasedFrequency: number;
  phaseError: number;       // radians
  fidelity: number;         // [0, 1]
  shotNoise: number;        // σ
  confidence: number;       // percentage
  p1: number;               // |1⟩ probability
}

// ── Helpers ──────────────────────────────────────────────────

/** Fold a frequency into the first Nyquist zone. */
export function aliasFreqQ(f: number, fs: number): number {
  const nyq = fs / 2;
  // f mod fs  mapped into [-fs/2, fs/2)
  let rem = ((f % fs) + fs) % fs;
  if (rem > nyq) rem = fs - rem;
  return rem;
}

/** Next power of two ≥ n. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 Cooley-Tukey FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
        const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// ── Main simulation ─────────────────────────────────────────

export function simulateQuantum(cfg: QuantumConfig): QuantumResult {
  const { phaseFrequency: f, samplingRate: fs, duration, shots, theta, noise } = cfg;
  const numSamples = Math.max(2, Math.round(fs * duration));
  const dt = 1 / fs;

  // 1. Phase evolution: φ(t) = 2π·f·t + optional noise
  const phases: number[] = [];
  const blochPath: BlochPoint[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = i * dt;
    let phi = 2 * Math.PI * f * t;

    // Depolarising noise: randomly perturb the phase
    if (noise > 0 && Math.random() < noise) {
      phi += (Math.random() - 0.5) * Math.PI * noise;
    }

    phases.push(phi);

    // Bloch sphere coordinates
    // |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩
    const sinHalfTheta = Math.sin(theta / 2);
    const cosHalfTheta = Math.cos(theta / 2);
    blochPath.push({
      x: sinHalfTheta * Math.cos(phi),      // ⟨σ_x⟩ = sin θ cos φ
      y: sinHalfTheta * Math.sin(phi),      // ⟨σ_y⟩ = sin θ sin φ
      z: cosHalfTheta * cosHalfTheta - sinHalfTheta * sinHalfTheta, // ⟨σ_z⟩ = cos θ
      t,
      phi,
    });
  }

  // 2. QFT via radix-2 FFT on complex sequence e^{iφ(t)}
  const N = nextPow2(numSamples);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < numSamples; i++) {
    // Hann window
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    re[i] = w * Math.cos(phases[i]);
    im[i] = w * Math.sin(phases[i]);
  }
  fft(re, im);

  // Build spectrum (positive frequencies only)
  const qftSpectrum: QFTPoint[] = [];
  const halfN = N >> 1;
  let maxMag = 0, maxIdx = 0;
  for (let k = 0; k <= halfN; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
    qftSpectrum.push({ frequency: (k * fs) / N, magnitude: mag });
    if (mag > maxMag) { maxMag = mag; maxIdx = k; }
  }

  const estimatedFrequency = (maxIdx * fs) / N;
  const aliasedFrequency = aliasFreqQ(f, fs);
  const nyquist = fs / 2;
  const aliasDetected = f > nyquist;

  // 3. Measurement simulation – |1⟩ probability = sin²(θ/2)
  const p1 = Math.sin(theta / 2) ** 2;
  const shotNoise = Math.sqrt((p1 * (1 - p1)) / shots);

  // 4. Fidelity: F = ½(1 + r̂_meas · r̂_ideal)
  //    For depolarised noise the fidelity degrades proportionally.
  const noiseFactor = 1 - noise * 0.5;
  const fidelity = Math.min(1, Math.max(0, 0.5 * (1 + noiseFactor)));

  // 5. Phase error
  const expectedPhase = (2 * Math.PI * f * duration) % (2 * Math.PI);
  const measuredPhase = phases[phases.length - 1] % (2 * Math.PI);
  let phaseError = Math.abs(expectedPhase - measuredPhase);
  if (phaseError > Math.PI) phaseError = 2 * Math.PI - phaseError;

  // 6. Confidence
  const freqError = Math.abs(estimatedFrequency - (aliasDetected ? aliasedFrequency : f));
  const relError = f > 0 ? freqError / f : 0;
  const confidence = Math.max(0, Math.min(100, 100 * (1 - relError) * noiseFactor));

  return {
    phases,
    blochPath,
    qftSpectrum,
    estimatedFrequency,
    trueFrequency: f,
    aliasDetected,
    aliasedFrequency,
    phaseError,
    fidelity,
    shotNoise,
    confidence,
    p1,
  };
}
