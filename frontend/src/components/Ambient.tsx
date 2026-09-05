import { Component, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReducedMotionPreference } from '../lib/useReducedMotionPreference';
import type { GridHelper } from 'three';
// A WebGL failure must never take down the financial interface.
class AmbientBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function Grid({ healthy }: { healthy: boolean }) {
  const grid = useRef<GridHelper>(null);
  // Mutate the Three.js object each frame without React renders; wrap travel at one grid spacing.
  useFrame(({ clock }) => {
    if (grid.current) grid.current.position.z = (clock.elapsedTime * 0.025) % 1;
  });
  return (
    <gridHelper
      ref={grid}
      args={[40, 40, healthy ? '#3c796e' : '#806a3f', '#203d45']}
      rotation={[0.18, 0, 0.04]}
      position={[0, -3, 0]}
    />
  );
}
export default function Ambient({ healthy }: { healthy: boolean }) {
  const reduced = useReducedMotionPreference();
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  // Unmount the canvas to stop its render loop while the tab is hidden or motion is disabled.
  if (reduced || !visible) return null;
  return (
    <div className="ambient" aria-hidden="true">
      <AmbientBoundary>
        {/* Fixed pixel density and disabled antialiasing limit GPU work for this subtle background. */}
        <Canvas
          dpr={1}
          camera={{ position: [0, 7, 12], fov: 50 }}
          gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
          fallback={<span />}
        >
          <Grid healthy={healthy} />
        </Canvas>
      </AmbientBoundary>
    </div>
  );
}
