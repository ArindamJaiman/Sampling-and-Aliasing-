'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { type STFTResult } from '@/lib/dsp';

interface WaterfallPlotProps {
  stft: STFTResult | null;
  className?: string;
  autoPan?: boolean;
}

// Custom shader for neon heatmap
const waterfallShader = {
  vertexShader: `
    varying float vElevation;
    void main() {
      // position.z is the height in our setup (PlaneGeometry is on XY by default, but we rotate it)
      vElevation = position.z; 
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vElevation;
    
    // Neon heatmap colors: Deep Purple -> Blue -> Cyan -> Pink -> White
    vec3 getHeatmapColor(float t) {
      t = clamp(t, 0.0, 1.0);
      vec3 c0 = vec3(0.05, 0.0, 0.15); // Deep Purple
      vec3 c1 = vec3(0.0, 0.3, 0.7);   // Blue
      vec3 c2 = vec3(0.0, 0.8, 0.8);   // Cyan
      vec3 c3 = vec3(1.0, 0.1, 0.7);   // Pink
      vec3 c4 = vec3(1.0, 0.9, 1.0);   // White
      
      if (t < 0.25) return mix(c0, c1, t / 0.25);
      if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
      if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
      return mix(c3, c4, (t - 0.75) / 0.25);
    }

    void main() {
      // Normalize elevation (assumes max height is around 1.5 to 2.0 based on scaling)
      float t = vElevation / 1.5; 
      vec3 color = getHeatmapColor(t);
      gl_FragColor = vec4(color, 0.85); // slight transparency
    }
  `
};

function Terrain({ stft, autoPan }: { stft: STFTResult, autoPan: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const { geometry } = useMemo(() => {
    const times = stft.times.length;
    // Cap max frequencies to render (e.g. up to 100 bins) for performance and aesthetics
    const maxFreqBins = Math.min(stft.frequencies.length, 120);
    const freqs = maxFreqBins;
    
    // Create plane. By default, it's along X and Y axes. We'll rotate it in the mesh.
    // X = frequency, Y = time
    const geom = new THREE.PlaneGeometry(12, 16, freqs - 1, times - 1);
    const pos = geom.attributes.position;
    
    let max = 0.001; // prevent div by zero
    
    // Find global max for normalization (only over the bins we render)
    for (let t = 0; t < times; t++) {
      for (let f = 0; f < freqs; f++) {
        const mag = stft.magnitudes[t]?.[f] || 0;
        if (mag > max) max = mag;
      }
    }
    
    // Displace vertices (Z axis becomes height)
    for (let t = 0; t < times; t++) {
      for (let f = 0; f < freqs; f++) {
        const idx = t * freqs + f;
        const mag = stft.magnitudes[t]?.[f] || 0;
        // Normalize and scale height, use a slight non-linear curve for emphasis
        const normalized = Math.pow(mag / max, 0.8);
        const height = normalized * 1.5; 
        pos.setZ(idx, height);
      }
    }
    
    geom.computeVertexNormals();
    return { geometry: geom };
  }, [stft]);

  useFrame((state) => {
    if (autoPan && meshRef.current) {
      // Slowly scroll the terrain along the time axis
      const t = state.clock.getElapsedTime();
      // Drift the mesh slowly on the Y axis (time axis), and ping-pong it slightly
      const yOffset = Math.sin(t * 0.2) * 1.5;
      meshRef.current.position.y = yOffset;
    }
  });

  return (
    <group rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -1, -2]}>
      <mesh ref={meshRef} geometry={geometry}>
        <shaderMaterial 
          vertexShader={waterfallShader.vertexShader}
          fragmentShader={waterfallShader.fragmentShader}
          wireframe={true}
          transparent={true}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Base Grid for context */}
      <gridHelper args={[24, 48, '#00ffff', '#ffffff']} position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]} material-opacity={0.05} material-transparent />
    </group>
  );
}

export default function WaterfallPlot({ stft, className = '', autoPan = true }: WaterfallPlotProps) {
  if (!stft || stft.times.length < 2) {
    return (
      <div className={`flex items-center justify-center bg-black/40 border border-white/[0.06] rounded-2xl ${className}`}>
        <p className="text-xs text-white/30">Insufficient data for waterfall plot</p>
      </div>
    );
  }

  return (
    <div className={`relative bg-black/40 border border-white/[0.06] rounded-2xl overflow-hidden ${className}`}>
      {/* Overlay Labels */}
      <div className="absolute top-4 left-5 z-10 select-none pointer-events-none">
        <h3 className="text-sm font-medium tracking-tight text-white flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          3D Spectrogram
        </h3>
        <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest font-semibold">Waterfall Plot</p>
      </div>
      
      <Canvas camera={{ position: [8, 5, 8], fov: 45 }}>
        <color attach="background" args={['#020205']} />
        
        <Terrain stft={stft} autoPan={autoPan} />
        
        <OrbitControls 
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 - 0.1}
          minDistance={2}
          maxDistance={30}
          autoRotate={!autoPan} // gently rotate the whole scene if autoPan is disabled
          autoRotateSpeed={0.8}
        />
      </Canvas>
    </div>
  );
}
