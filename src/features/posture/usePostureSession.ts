import { useEffect, useState } from 'react';
import type { DeviceGateway } from '../../application/ports';
import { derivePostureAdvice, type DeviceSnapshot, type PostureAdvice } from '../../domain/posture';
const initialSnapshot: DeviceSnapshot = {
  sequence: 0,
  capturedAt: Date.now(),
  connected: false,
  stable: false,
  calibrated: false,
  gluteLeft: 0,
  gluteRight: 0,
  thighLeft: 0,
  thighRight: 0,
  backCenter: 0,
  thresholds: { seatDelta: 0.2, movement: 0.35 },
};
export const usePostureSession = (device: DeviceGateway) => {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [advice, setAdvice] = useState<PostureAdvice>(() => derivePostureAdvice(initialSnapshot));
  useEffect(() => {
    let current = initialSnapshot;
    let candidate = derivePostureAdvice(current);
    let since = performance.now();
    const unsubscribe = device.subscribe((next) => {
      current = next;
      setSnapshot(next);
    });
    const timer = window.setInterval(() => {
      const next = derivePostureAdvice(current);
      if (next.state !== candidate.state) {
        candidate = next;
        since = performance.now();
      }
      const delay =
        next.state === 'unknown' || next.state === 'uncalibrated'
          ? 0
          : next.state === 'saturated'
            ? 1000
            : 2000;
      if (performance.now() - since >= delay)
        setAdvice((old) => (old.state === next.state ? old : next));
    }, 250);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [device]);
  return { snapshot, advice };
};
