# Sampling & Aliasing Analysis Toolkit

 **Demo** - https://sampling-and-aliasing-analysis-tool.vercel.app/

> **Nyquist–Shannon Lab** — an interactive, browser-based toolkit for detecting aliasing, applying anti-alias corrections, experimenting with quantum-state sampling, and hearing the difference in real audio. All computation runs **locally in your browser**. No data leaves your device.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Files Required for GitHub](#files-required-for-github)
- [Getting Started](#getting-started)
- [Tab Breakdown](#tab-breakdown)
  - [Classical Analyzer](#1-classical-analyzer)
  - [Quantum Lab](#2-quantum-lab)
  - [Audio A/B](#3-audio-ab)
- [Library Reference](#library-reference)
- [Configuration](#configuration)
- [License](#license)

---

## Features

### Classical Analyzer
- Generate waveforms: **sine, cosine, square, triangle, sawtooth, chirp, Gaussian pulse, exponential decay, noisy, multi-frequency**
- Enter **custom math expressions** (`sin(2*pi*40*t) + 0.5*sin(2*pi*90*t)`) evaluated safely with a whitelist
- Paste **CSV data** and assign a custom sample rate
- Set an independent **source rate** (high-fidelity) vs **sampling rate** to observe aliasing
- Real-time **time-domain** and **frequency-domain (FFT)** charts with Recharts
- Full aliasing analysis: Nyquist check, folded components, severity score (0–100), confidence
- Six **anti-alias correction methods**:
  | Method | Description |
  |---|---|
  | `increase-fs` | Conceptually increase sampling rate above Nyquist |
  | `fir` | Windowed-sinc FIR low-pass filter |
  | `butterworth` | IIR Butterworth low-pass filter |
  | `savgol` | Savitzky–Golay smoothing filter |
  | `sinc-resample` | Band-limited sinc interpolation resampling |
  | `spline-resample` | Cubic spline interpolation resampling |
- Time metrics: **peak, RMS, energy, power, DC offset, duration, sample count**
- Frequency metrics: **dominant peaks, bandwidth, spectral centroid, SNR, noise floor**
- **Educational mode** toggle — shows explanations for every metric and status badge
- **Export** corrected signal as a CSV file

### Quantum Lab
- Simulate **quantum phase evolution**: a qubit rotates at a configurable frequency, emulating phase estimation
- Configurable: **phase frequency, sampling rate, duration, shots, Bloch polar angle θ, depolarizing noise**
- **Quantum Fourier Transform (QFT)** computed via radix-2 FFT on the complex phase sequence `e^{iφ(t)}`
- **Bloch sphere** 3D visualization (Three.js / React Three Fiber) showing the qubit path over time
- Shot-based measurement simulation with binomial statistics (**shot noise, variance**)
- Reports: **estimated frequency, aliasing detection, fidelity, phase error, confidence, quantum corrections**
- Educational mode with contextual explanations for every quantum concept
- **Export** quantum results as a JSON file

### Audio A/B
- Upload any **WAV file** (mono/stereo, any sample rate) — decoded in-browser via Web Audio API
- Downsample to a **target sample rate** to introduce intentional aliasing
- Apply the same **six correction methods** as the Classical tab
- **Adjustable cutoff frequency** for FIR/Butterworth/Savgol filters
- Live **spectrum charts** for the original, downsampled (aliased), and corrected signals side-by-side
- **Play / Stop** buttons for each version (original, aliased, corrected) using the Web Audio API
- Aliasing report with quality score comparison before vs after correction
- **Download** the corrected signal as a new WAV file

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS v4 (dark-only scientific theme) |
| UI Components | shadcn/ui (`new-york` style), Radix primitives |
| Charts | [Recharts](https://recharts.org) v3 |
| 3D / WebGL | [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [@react-three/drei](https://github.com/pmndrs/drei), [Three.js](https://threejs.org) |
| Fonts | Inter (body) + JetBrains Mono (code/labels) via `next/font/google` |
| Analytics | Vercel Analytics |
| Package Manager | pnpm |
| DSP Engine | Custom (zero-dependency, pure TypeScript) |
| Quantum Engine | Custom simulation built on top of the DSP FFT |
| Audio | Web Audio API + custom WAV encoder/decoder |

---

## Project Structure

```
sampling-and-aliasing-toolkit/
│
├── app/
│   ├── layout.tsx            # Root layout: fonts, metadata, Analytics
│   ├── page.tsx              # Main page: tab navigation, educational mode toggle
│   └── globals.css           # Tailwind v4 theme tokens, dark scientific palette
│
├── components/
│   ├── classical-tab.tsx     # Classical Analyzer UI (signal input, charts, corrections)
│   ├── quantum-tab.tsx       # Quantum Lab UI (config, charts, results)
│   ├── audio-tab.tsx         # Audio A/B UI (file upload, playback, comparison)
│   ├── bloch-sphere.tsx      # Interactive 3D Bloch sphere (Three.js)
│   ├── charts.tsx            # Reusable SignalChart + SpectrumChart (Recharts)
│   ├── ui-bits.tsx           # Shared UI primitives: Panel, Metric, StatusBadge, Explain, QualityBar, Field
│   └── ui/
│       └── button.tsx        # shadcn Button component
│
├── lib/
│   ├── dsp.ts                # Core DSP engine: FFT, signal generators, metrics, aliasing analysis, corrections
│   ├── quantum.ts            # Quantum simulation engine: phase evolution, QFT, shot noise, Bloch path
│   ├── audio.ts              # WAV decode/encode, CSV download helpers
│   └── utils.ts              # Tailwind class merge utility (cn)
│
├── public/
│   ├── icon.svg              # App icon (SVG)
│   ├── apple-icon.png        # Apple touch icon
│   ├── icon-dark-32x32.png   # Favicon (dark)
│   └── icon-light-32x32.png  # Favicon (light)
│
├── components.json           # shadcn/ui configuration
├── next.config.mjs           # Next.js config
├── postcss.config.mjs        # PostCSS config (Tailwind v4)
├── tsconfig.json             # TypeScript config
├── package.json              # Dependencies and scripts
├── pnpm-lock.yaml            # pnpm lockfile (pinned dependency tree)
└── .gitignore
```
                    USER INPUT
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
 Classical          Quantum Lab         Audio Lab
        │                 │                  │
        │                 │                  │
        ▼                 ▼                  ▼
 Signal Generation   Quantum State      WAV Processing
        │                 │                  │
        ▼                 ▼                  ▼
 Sampling Engine     Phase Sampling      Downsampling
        │                 │                  │
        ▼                 ▼                  ▼
 Aliasing Engine     QFT Analysis       Frequency Analysis
        │                 │                  │
        ▼                 ▼                  ▼
 Visualization      Bloch Sphere      Audio Comparison
        │                 │                  │
        └─────────────────┼──────────────────┘
                          ▼
                   Correction Engine
                          ▼
                 Export Reports / CSV / JSON

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/sampling-and-aliasing-toolkit.git
cd sampling-and-aliasing-toolkit
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for production

```bash
pnpm build
pnpm start
```

> No environment variables, no database, no API keys required — everything runs in the browser.

---

## Tab Breakdown

### 1. Classical Analyzer

**Signal Input** — three modes:

| Mode | How it works |
|---|---|
| **Generator** | Choose a waveform type + frequency + source rate + sampling rate + duration |
| **Expression** | Enter any `f(t)` expression using `sin`, `cos`, `tan`, `exp`, `log`, `sqrt`, `abs`, `pow`, `pi` |
| **CSV** | Paste comma/newline/semicolon-separated numbers; assign a sampling rate |

**Aliasing detection** uses `lib/dsp.ts → analyzeAliasing()`:
- Computes the Nyquist frequency (`fs / 2`)
- Compares all dominant spectral peaks against known true frequencies
- Determines folded (aliased) frequency components via the formula: `f_alias = |((f mod fs) + fs) mod fs - fs/2|`
- Scores severity 0–1 and returns a `qualityScore` 0–100

**Correction pipeline**: `downsample()` → `applyCorrection()` → `compareSignals()` → renders both signals for comparison.

---

### 2. Quantum Lab

**Physics model:**
- Qubit state: `|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ(t)} sin(θ/2)|1⟩`
- Phase evolution: `φ(t) = 2π · f · t` with optional depolarizing noise
- Sampling the phase at rate `fsQ` introduces the same Nyquist aliasing problem as classical signals
- QFT is performed on `e^{iφ(t)}` via the same radix-2 FFT in `lib/dsp.ts`

**Metrics reported:**
- Estimated vs true frequency (from QFT argmax)
- Shot noise: `σ = √(p(1-p)/N)` from binomial statistics
- Fidelity: `F = ½(1 + r̂_meas · r̂_ideal)` (Bloch vector dot product)
- Phase error, confidence, aliasing flag

**Bloch Sphere** (`components/bloch-sphere.tsx`):
- Rendered with React Three Fiber
- Shows the qubit trajectory over time as a colored line on the unit sphere
- Dynamically imported (SSR disabled) to avoid Three.js server-side issues

---

### 3. Audio A/B

**WAV handling** (`lib/audio.ts`):
- `decodeWav(file)` — reads the WAV header, extracts PCM samples (8-bit, 16-bit, 32-bit int, 32-bit float formats supported), normalizes to `[-1, 1]`
- `encodeWav(samples, fs)` — encodes a `Float32Array` back to a standard 16-bit PCM WAV `Blob`
- Playback via `AudioContext.createBufferSource()`

**Comparison workflow:**
1. Upload WAV → decoded to `Float32Array` + native sample rate
2. Downsample to `targetFs` → introduces aliasing artefacts
3. Apply selected correction → cleaned signal
4. All three signals available for playback and spectrum inspection

---

## Library Reference

### `lib/dsp.ts`

| Export | Description |
|---|---|
| `fft(re, im)` | In-place radix-2 Cooley–Tukey FFT |
| `computeSpectrum(samples, fs)` | FFT with Hann window, returns `SpectrumPoint[]` |
| `generateWave(type, f, fs, duration)` | Generate 10 waveform types |
| `evalExpression(expr, fs, duration)` | Safe math expression → sample array |
| `parseCSV(text)` | Parse numeric CSV/whitespace-separated data |
| `timeMetrics(signal)` | Peak, RMS, energy, power, DC, duration |
| `freqMetrics(signal)` | Spectrum, dominant peaks, centroid, SNR |
| `analyzeAliasing(signal, freqMetrics)` | Full aliasing report with quality score |
| `applyCorrection(signal, method, cutoff)` | Apply one of 6 anti-alias corrections |
| `compareSignals(a, b, fmA, fmB)` | Compute improvement metrics between two signals |
| `downsample(samples, fsIn, fsOut)` | Integer-ratio downsampling |
| `sincResample(samples, fsIn, fsOut)` | Band-limited sinc interpolation |

### `lib/quantum.ts`

| Export | Description |
|---|---|
| `simulateQuantum(cfg)` | Full quantum simulation returning phases, QFT, Bloch path, metrics |
| `aliasFreqQ(f, fs)` | Alias frequency for quantum phase signals |

### `lib/audio.ts`

| Export | Description |
|---|---|
| `decodeWav(file)` | Decode WAV file → `{ samples: Float32Array, fs: number }` |
| `encodeWav(samples, fs)` | Encode samples → WAV `Blob` |
| `downloadBlob(blob, name)` | Trigger browser download |
| `downloadText(text, name)` | Trigger text file download |

---

## Configuration

### `next.config.mjs`

```js
{
  typescript: { ignoreBuildErrors: true },  // allows fast iteration
  images: { unoptimized: true }             // no Next.js Image Optimization needed (no remote images)
}
```

### `components.json`

Configures shadcn/ui with the `new-york` style, Tailwind CSS v4, and path aliases (`@/components`, `@/lib`).

### `app/globals.css`

Defines a **dark-only scientific color theme** using Tailwind v4 CSS custom properties:
- **Primary**: Cyan (`oklch(0.78 0.14 195)`)
- **Accent**: Amber (`oklch(0.78 0.16 80)`)
- **Background**: Deep navy (`oklch(0.16 0.012 250)`)

---

## License

MIT — feel free to use, modify, and distribute.

---

*Built with Next.js 16, React 19, TypeScript, Tailwind CSS v4, Recharts, and React Three Fiber.*
