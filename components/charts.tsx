'use client';

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
  ReferenceLine,
} from 'recharts';

// ─── Signal chart (time domain) ─────────────────────────────

interface SignalChartProps {
  data: { t: number; value: number }[];
  overlayData?: { t: number; value: number }[];
  color?: string;
  overlayColor?: string;
  height?: number;
  label?: string;
  overlayLabel?: string;
}

export function SignalChart({
  data,
  overlayData,
  color = '#00e5ff',
  overlayColor = '#ff00e5',
  height = 200,
  label = 'Signal',
  overlayLabel = 'Corrected',
}: SignalChartProps) {
  // Downsample if too many points for smooth rendering
  const maxPoints = 1000;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const displayData = data.filter((_, i) => i % step === 0);

  // Merge overlay data if present
  const mergedData = displayData.map((d, i) => ({
    t: d.t,
    value: d.value,
    overlay: overlayData
      ? overlayData[Math.min(Math.floor(i * step * (overlayData.length / data.length)), overlayData.length - 1)]?.value
      : undefined,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="t"
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
            tickFormatter={(v: number) => v.toFixed(3)}
            stroke="rgba(255,255,255,0.06)"
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
            tickFormatter={(v: number) => v.toFixed(1)}
            stroke="rgba(255,255,255,0.06)"
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,14,23,0.95)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.7)',
            }}
            formatter={(v: number, name: string) => [v.toFixed(4), name === 'value' ? label : overlayLabel]}
            labelFormatter={(l: number) => `t = ${l.toFixed(4)}s`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            name={label}
          />
          {overlayData && (
            <Line
              type="monotone"
              dataKey="overlay"
              stroke={overlayColor}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
              name={overlayLabel}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Spectrum chart (frequency domain) ──────────────────────

interface SpectrumChartProps {
  data: { frequency: number; magnitude: number }[];
  overlayData?: { frequency: number; magnitude: number }[];
  nyquistFreq?: number;
  height?: number;
  color?: string;
  overlayColor?: string;
}

export function SpectrumChart({
  data,
  overlayData,
  nyquistFreq,
  height = 200,
  color = '#00e5ff',
  overlayColor = '#ff00e5',
}: SpectrumChartProps) {
  const maxPoints = 500;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const displayData = data
    .filter((_, i) => i % step === 0)
    .map((d, i) => ({
      frequency: d.frequency,
      magnitude: d.magnitude,
      overlay: overlayData
        ? overlayData[Math.min(i * step, overlayData.length - 1)]?.magnitude
        : undefined,
    }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={displayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="specGradOverlay" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={overlayColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={overlayColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="frequency"
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            stroke="rgba(255,255,255,0.06)"
            label={{ value: 'Hz', position: 'insideBottomRight', offset: -5, fill: 'rgba(255,255,255,0.2)', fontSize: 10 }}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
            tickFormatter={(v: number) => v.toFixed(2)}
            stroke="rgba(255,255,255,0.06)"
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,14,23,0.95)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.7)',
            }}
            formatter={(v: number, name: string) => [
              v.toFixed(4),
              name === 'magnitude' ? 'Original' : 'Corrected',
            ]}
            labelFormatter={(l: number) => `${l.toFixed(1)} Hz`}
          />
          <Area
            type="monotone"
            dataKey="magnitude"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#specGrad)"
          />
          {overlayData && (
            <Area
              type="monotone"
              dataKey="overlay"
              stroke={overlayColor}
              strokeWidth={1.5}
              fill="url(#specGradOverlay)"
              strokeDasharray="4 4"
            />
          )}
          {nyquistFreq != null && (
            <ReferenceLine
              x={nyquistFreq}
              stroke="#ef4444"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Nyquist ${nyquistFreq.toFixed(0)} Hz`,
                position: 'top',
                fill: '#ef4444',
                fontSize: 10,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
