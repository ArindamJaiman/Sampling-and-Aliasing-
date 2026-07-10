'use client';

import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line, Float } from '@react-three/drei';
import * as THREE from 'three';
import type { BlochPoint } from '@/lib/quantum';

// ─── Colour palette ──────────────────────────────────────────
const CYAN     = '#00e5ff';
const MAGENTA  = '#ff00e5';
const AMBER    = '#ffab00';

// ─── Wireframe sphere ───────────────────────────────────────
function WireframeSphere() {
  return (
    <mesh>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial
        color="#ffffff"
        wireframe
        transparent
        opacity={0.04}
      />
    </mesh>
  );
}

// ─── Axis arrows ────────────────────────────────────────────
function AxisArrow({
  dir,
  color,
  label,
  labelPos,
}: {
  dir: [number, number, number];
  color: string;
  label: string;
  labelPos: [number, number, number];
}) {
  const points = useMemo(
    () => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(...dir)],
    [dir],
  );

  // Calculate rotation so the cone points along the axis direction
  const coneRotation = useMemo(() => {
    const direction = new THREE.Vector3(...dir).normalize();
    const defaultDir = new THREE.Vector3(0, 1, 0); // Cone default points up
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, direction);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z] as [number, number, number];
  }, [dir]);

  return (
    <>
      <Line points={points} color={color} lineWidth={1.5} transparent opacity={0.6} />
      {/* Arrowhead cone — rotated to point along axis */}
      <mesh position={dir} rotation={coneRotation}>
        <coneGeometry args={[0.03, 0.1, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
      <Text
        position={labelPos}
        fontSize={0.12}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </>
  );
}

// ─── Great circles (equator + two meridians) ────────────────
function GreatCircle({
  plane,
  color = '#ffffff',
}: {
  plane: 'xy' | 'xz' | 'yz';
  color?: string;
}) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      if (plane === 'xy') pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      else if (plane === 'xz') pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      else pts.push(new THREE.Vector3(0, Math.cos(a), Math.sin(a)));
    }
    return pts;
  }, [plane]);
  return <Line points={points} color={color} lineWidth={0.8} transparent opacity={0.15} />;
}

// ─── State vector arrow (fixed: imperative geometry update) ─
function StateVector({ target }: { target: THREE.Vector3 }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.BufferGeometry>(null);
  const current = useRef(new THREE.Vector3(0, 0, 1));

  // Create initial line geometry positions
  const positions = useMemo(() => new Float32Array([0, 0, 0, 0, 0, 1]), []);

  useFrame((_, delta) => {
    current.current.lerp(target, 1 - Math.pow(0.001, delta));

    // Update the line geometry imperatively
    if (lineRef.current) {
      const posAttr = lineRef.current.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr) {
        posAttr.setXYZ(1, current.current.x, current.current.y, current.current.z);
        posAttr.needsUpdate = true;
      }
    }

    // Update the sphere tip position
    if (sphereRef.current) {
      sphereRef.current.position.copy(current.current);
    }
  });

  return (
    <group>
      {/* State vector line — using raw bufferGeometry so we can update imperatively */}
      <line>
        <bufferGeometry ref={lineRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={2}
          />
        </bufferGeometry>
        <lineBasicMaterial color={CYAN} linewidth={2} transparent opacity={0.9} />
      </line>
      {/* Glowing tip sphere */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ─── Animated qubit trail (fixed: ref-based progress) ───────
function QubitTrail({
  blochPath,
  animationSpeed = 1,
}: {
  blochPath: BlochPoint[];
  animationSpeed?: number;
}) {
  const progressRef = useRef(0);
  const tipRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.BufferGeometry>(null);
  const colorAttrRef = useRef<THREE.BufferAttribute | null>(null);

  // Build the full path as Vector3[] and pre-allocate buffers
  const { pathPositions, maxCount } = useMemo(() => {
    const maxCount = blochPath.length;
    // Pre-compute all positions
    const pathPositions = new Float32Array(maxCount * 3);
    for (let i = 0; i < maxCount; i++) {
      const p = blochPath[i];
      pathPositions[i * 3] = p.x;
      pathPositions[i * 3 + 1] = p.z; // z mapped to y for Bloch display
      pathPositions[i * 3 + 2] = p.y; // y mapped to z
    }
    return { pathPositions, maxCount };
  }, [blochPath]);

  // Pre-allocate color buffer
  const colorBuffer = useMemo(() => new Float32Array(maxCount * 3), [maxCount]);

  useFrame((_, delta) => {
    progressRef.current += delta * animationSpeed * 0.3;
    if (progressRef.current >= 1) progressRef.current = 0;

    const visibleCount = Math.max(2, Math.floor(progressRef.current * maxCount));

    // Update line draw range
    if (lineRef.current) {
      lineRef.current.setDrawRange(0, visibleCount);

      // Update colors for visible portion
      for (let i = 0; i < visibleCount; i++) {
        const t = i / Math.max(1, visibleCount - 1);
        colorBuffer[i * 3] = THREE.MathUtils.lerp(1, 0, t);     // r: magenta → cyan
        colorBuffer[i * 3 + 1] = THREE.MathUtils.lerp(0, 0.9, t); // g
        colorBuffer[i * 3 + 2] = THREE.MathUtils.lerp(0.9, 1, t); // b
      }

      if (colorAttrRef.current) {
        colorAttrRef.current.needsUpdate = true;
      }
    }

    // Update tip position
    const tipIdx = Math.min(visibleCount - 1, maxCount - 1);
    const tipX = pathPositions[tipIdx * 3];
    const tipY = pathPositions[tipIdx * 3 + 1];
    const tipZ = pathPositions[tipIdx * 3 + 2];

    if (tipRef.current) {
      tipRef.current.position.set(tipX, tipY, tipZ);
    }
    if (haloRef.current) {
      haloRef.current.position.set(tipX, tipY, tipZ);
    }
  });

  const handleColorRef = useCallback((attr: THREE.BufferAttribute | null) => {
    colorAttrRef.current = attr;
  }, []);

  if (maxCount < 2) return null;

  return (
    <group>
      {/* Trail line — using raw geometry for imperative draw range updates */}
      <line>
        <bufferGeometry ref={lineRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[pathPositions, 3]}
            count={maxCount}
          />
          <bufferAttribute
            ref={handleColorRef}
            attach="attributes-color"
            args={[colorBuffer, 3]}
            count={maxCount}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.85} />
      </line>
      {/* Glowing tip */}
      <mesh ref={tipRef}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={4}
          toneMapped={false}
        />
      </mesh>
      {/* Glow halo */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial
          color={CYAN}
          transparent
          opacity={0.15}
        />
      </mesh>
    </group>
  );
}

// ─── Latitude/longitude grid lines ──────────────────────────
function GridLines() {
  const lines = useMemo(() => {
    const result: THREE.Vector3[][] = [];
    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      const r = Math.cos((lat * Math.PI) / 180);
      const y = Math.sin((lat * Math.PI) / 180);
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
      }
      result.push(pts);
    }
    // Longitude lines
    for (let lon = 0; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            Math.sin(a) * Math.cos((lon * Math.PI) / 180),
            Math.cos(a),
            Math.sin(a) * Math.sin((lon * Math.PI) / 180),
          ),
        );
      }
      result.push(pts);
    }
    return result;
  }, []);

  return (
    <>
      {lines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#ffffff"
          lineWidth={0.5}
          transparent
          opacity={0.04}
        />
      ))}
    </>
  );
}

// ─── Poles: |0⟩ and |1⟩ ─────────────────────────────────────
function Poles() {
  return (
    <>
      {/* |0⟩ North */}
      <mesh position={[0, 1.08, 0]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial
          color="#4ade80"
          emissive="#4ade80"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      <Text position={[0, 1.22, 0]} fontSize={0.1} color="#4ade80" anchorX="center">
        |0⟩
      </Text>

      {/* |1⟩ South */}
      <mesh position={[0, -1.08, 0]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial
          color="#f87171"
          emissive="#f87171"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      <Text position={[0, -1.22, 0]} fontSize={0.1} color="#f87171" anchorX="center">
        |1⟩
      </Text>
    </>
  );
}

// ─── Particle field background ──────────────────────────────
function ParticleField({ count = 800 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null);
  const { positions, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.5 + Math.random() * 1.5;
    }
    return { positions: pos, sizes: sz };
  }, [count]);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.elapsedTime * 0.015;
      mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color={CYAN}
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}



// ─── Glowing ring pulse at equator ──────────────────────────
function EquatorPulse() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02;
      ref.current.scale.set(s, s, s);
      (ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.08 + Math.sin(state.clock.elapsedTime * 3) * 0.04;
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.005, 8, 128]} />
      <meshBasicMaterial color={AMBER} transparent opacity={0.1} />
    </mesh>
  );
}

// ─── Main exported component ────────────────────────────────

interface BlochSphereProps {
  blochPath: BlochPoint[];
  animationSpeed?: number;
  autoRotate?: boolean;
  className?: string;
}

export default function BlochSphere({
  blochPath,
  animationSpeed = 1,
  autoRotate = true,
  className = '',
}: BlochSphereProps) {
  // Compute target vector from the latest bloch point
  const target = useMemo(() => {
    if (blochPath.length === 0) return new THREE.Vector3(0, 1, 0);
    const last = blochPath[blochPath.length - 1];
    return new THREE.Vector3(last.x, last.z, last.y);
  }, [blochPath]);

  return (
    <div className={`relative w-full h-full min-h-[400px] ${className}`}>
      {/* Subtle vignette overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />
      <Canvas
        camera={{ position: [1.8, 1.0, 1.8], fov: 55, near: 0.1, far: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <pointLight position={[3, 3, 3]} intensity={0.8} color={CYAN} />
        <pointLight position={[-3, -2, 2]} intensity={0.4} color={MAGENTA} />
        <pointLight position={[0, 4, 0]} intensity={0.3} color="#ffffff" />

        {/* Background particles */}
        <ParticleField />

        {/* Bloch sphere structure */}
        <Float speed={0.4} rotationIntensity={0.03} floatIntensity={0.05}>
          <group>
            <WireframeSphere />
            <GridLines />
            <GreatCircle plane="xy" />
            <GreatCircle plane="xz" />
            <GreatCircle plane="yz" />
            <EquatorPulse />

            {/* Axes */}
            <AxisArrow dir={[1.3, 0, 0]} color="#ef4444" label="X" labelPos={[1.45, 0, 0]} />
            <AxisArrow dir={[0, 1.3, 0]} color="#4ade80" label="Z" labelPos={[0, 1.45, 0]} />
            <AxisArrow dir={[0, 0, 1.3]} color="#60a5fa" label="Y" labelPos={[0, 0, 1.45]} />

            {/* Poles */}
            <Poles />

            {/* State vector */}
            <StateVector target={target} />

            {/* Qubit trajectory */}
            {blochPath.length > 1 && (
              <QubitTrail blochPath={blochPath} animationSpeed={animationSpeed} />
            )}
          </group>
        </Float>

        {/* Controls — always interactive, auto-rotate is optional */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          minDistance={1.5}
          maxDistance={8}
          autoRotate={autoRotate}
          autoRotateSpeed={0.4}
          dampingFactor={0.1}
          enableDamping
          zoomSpeed={0.8}
        />
      </Canvas>
    </div>
  );
}
