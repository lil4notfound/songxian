import { useEffect, useReducer, useRef } from 'react';
import type { CycleObservation } from '../../domain/trainingGuard';
import {
  createTrainingSession,
  trainingReducer,
  type TrainingModuleId,
} from '../../domain/training';
import type { TrainingPrescription } from '../../contracts/training';

export const useTrainingSession = (
  moduleId: TrainingModuleId,
  prescription?: TrainingPrescription,
  readObservation?: () => CycleObservation | undefined,
) => {
  const [session, dispatch] = useReducer(
    trainingReducer,
    { moduleId, prescription },
    ({ moduleId: initialModule, prescription: initialPrescription }) =>
      createTrainingSession(initialModule, initialPrescription),
  );
  const observationRef = useRef(readObservation);
  useEffect(() => {
    observationRef.current = readObservation;
  }, [readObservation]);

  useEffect(() => {
    if (session.status !== 'running') return;
    const timer = window.setInterval(
      () => dispatch({ type: 'tick', observation: observationRef.current?.() }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [session.status]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden') dispatch({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  return { session, dispatch };
};
