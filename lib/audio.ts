// ─────────────────────────────────────────────────────────────
//  Audio utilities — WAV decode/encode, download helpers
// ─────────────────────────────────────────────────────────────

export interface AudioData {
  samples: Float32Array;
  fs: number;
  channels: number;
  bitDepth: number;
}

// ── WAV Decoder ─────────────────────────────────────────────

export async function decodeWav(file: File): Promise<AudioData> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);

  // RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') throw new Error('Not a valid WAV file');

  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (wave !== 'WAVE') throw new Error('Not a valid WAV file');

  // Find fmt chunk
  let offset = 12;
  let audioFormat = 1, channels = 1, fs = 44100, bitDepth = 16;

  while (offset < buf.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      fs = view.getUint32(offset + 12, true);
      bitDepth = view.getUint16(offset + 22, true);
    }

    if (chunkId === 'data') {
      const dataOffset = offset + 8;
      const dataSize = chunkSize;
      const bytesPerSample = bitDepth / 8;
      const numSamples = Math.floor(dataSize / (bytesPerSample * channels));
      const samples = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const byteOffset = dataOffset + i * bytesPerSample * channels;
        // Take first channel only (mono mix)
        if (audioFormat === 3) {
          // 32-bit float
          samples[i] = view.getFloat32(byteOffset, true);
        } else if (bitDepth === 32) {
          samples[i] = view.getInt32(byteOffset, true) / 2147483648;
        } else if (bitDepth === 16) {
          samples[i] = view.getInt16(byteOffset, true) / 32768;
        } else if (bitDepth === 8) {
          samples[i] = (view.getUint8(byteOffset) - 128) / 128;
        }
      }

      return { samples, fs, channels, bitDepth };
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++; // pad byte
  }

  throw new Error('No data chunk found in WAV file');
}

// ── WAV Encoder ─────────────────────────────────────────────

export function encodeWav(samples: Float32Array, fs: number): Blob {
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * bytesPerSample;
  const bufferSize = 44 + dataSize;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, fs, true);          // sample rate
  view.setUint32(28, fs * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);      // block align
  view.setUint16(34, 16, true);          // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 32767, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ── Download helpers ────────────────────────────────────────

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, name: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(blob, name);
}

export function downloadJSON(data: unknown, name: string): void {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  downloadBlob(blob, name);
}

// ── Tone Generator ──────────────────────────────────────────

export function generateTone(
  type: 'sine' | 'square' | 'sawtooth',
  freq: number,
  durationSecs: number,
  fs: number = 44100
): AudioData {
  const numSamples = Math.floor(fs * durationSecs);
  const samples = new Float32Array(numSamples);
  const angularFreq = 2 * Math.PI * freq;

  for (let i = 0; i < numSamples; i++) {
    const t = i / fs;
    if (type === 'sine') {
      samples[i] = Math.sin(angularFreq * t);
    } else if (type === 'square') {
      samples[i] = Math.sign(Math.sin(angularFreq * t));
    } else if (type === 'sawtooth') {
      samples[i] = 2 * ((t * freq) - Math.floor(t * freq + 0.5));
    }
  }

  return {
    samples,
    fs,
    channels: 1,
    bitDepth: 32, // Float32
  };
}
