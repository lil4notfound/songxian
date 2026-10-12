import { useCallback, useEffect, useState } from 'react';
import type { ModuleId } from '../domain/modules';
import type { TrainingModuleId } from '../domain/training';
import { EligibilityDialog } from '../features/eligibility/EligibilityDialog';
import { PosturePage } from '../features/posture/PosturePage';
import { ResultPage } from '../features/result/ResultPage';
import { TrainingPage } from '../features/training/TrainingPage';
import type { TrainingFinishPayload } from '../features/training/TrainingPage';
import { TrainingRecordsPage } from '../features/records/TrainingRecordsPage';
import { DeviceSetupPage } from '../features/device/DeviceSetupPage';
import { ModuleTabBar } from '../shared/ui/ModuleTabBar';
import { application } from './composition';

type Screen =
  | { name: 'training'; moduleId: TrainingModuleId }
  | { name: 'posture' }
  | { name: 'result'; payload: TrainingFinishPayload }
  | { name: 'records' }
  | { name: 'device' };

type ModuleScreen = Exclude<Screen, { name: 'records' } | { name: 'device' }>;

export const App = () => {
  const [ready, setReady] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleId>('posture');
  const [screen, setScreen] = useState<Screen>({ name: 'posture' });
  const [recordsReturn, setRecordsReturn] = useState<ModuleScreen>({ name: 'posture' });
  const [deviceReturn, setDeviceReturn] = useState<ModuleScreen>({ name: 'posture' });
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

  useEffect(() => {
    const unlock = () => application.audio.unlock?.();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void application.initialize().finally(() => {
      if (mounted) {
        application.beginModule('posture');
        setReady(true);
      }
    });
    return () => {
      mounted = false;
      application.device.disconnect();
    };
  }, []);

  const selectModule = (moduleId: ModuleId) => {
    if (moduleId === activeModule) {
      if (screen.name === 'records') {
        setScreen(moduleId === 'posture' ? { name: 'posture' } : { name: 'training', moduleId });
      }
      return;
    }
    if (moduleId === 'pelvic_floor') {
      setEligibilityOpen(true);
      return;
    }
    setEligibilityOpen(false);
    application.beginModule(moduleId);
    setActiveModule(moduleId);
    if (moduleId === 'posture') {
      setScreen({ name: 'posture' });
      return;
    }
    setScreen({ name: 'training', moduleId });
  };

  const finishTraining = useCallback((payload: TrainingFinishPayload) => {
    application.audio.stop();
    setScreen({ name: 'result', payload });
  }, []);

  const openRecords = () => {
    if (screen.name !== 'records' && screen.name !== 'device') setRecordsReturn(screen);
    setScreen({ name: 'records' });
  };

  const openDevice = () => {
    if (screen.name !== 'records' && screen.name !== 'device') setDeviceReturn(screen);
    setScreen({ name: 'device' });
  };

  if (!ready) {
    return (
      <main className="boot-screen" aria-live="polite">
        <span className="boot-screen__mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p>正在连接坐垫…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-module-surface" key={`${activeModule}-${screen.name}`}>
        {screen.name === 'training' ? (
          <TrainingPage
            moduleId={screen.moduleId}
            application={application}
            onFinish={finishTraining}
            onOpenRecords={openRecords}
            onOpenDevice={openDevice}
          />
        ) : null}
        {screen.name === 'posture' ? (
          <PosturePage
            application={application}
            onOpenRecords={openRecords}
            onOpenDevice={openDevice}
          />
        ) : null}
        {screen.name === 'result' ? (
          <ResultPage
            payload={screen.payload}
            application={application}
            onDone={() =>
              setScreen({ name: 'training', moduleId: screen.payload.session.moduleId })
            }
            onAgain={() => {
              application.beginModule(screen.payload.session.moduleId);
              setScreen({ name: 'training', moduleId: screen.payload.session.moduleId });
            }}
            onOpenRecords={openRecords}
          />
        ) : null}
        {screen.name === 'records' ? (
          <TrainingRecordsPage application={application} onBack={() => setScreen(recordsReturn)} />
        ) : null}
        {screen.name === 'device' ? (
          <DeviceSetupPage application={application} onBack={() => setScreen(deviceReturn)} />
        ) : null}
      </div>

      {screen.name !== 'device' ? (
        <ModuleTabBar activeModule={activeModule} onSelect={selectModule} />
      ) : null}

      {eligibilityOpen ? (
        <EligibilityDialog
          onClose={() => setEligibilityOpen(false)}
          onApproved={() => {
            setEligibilityOpen(false);
            application.beginModule('pelvic_floor');
            setActiveModule('pelvic_floor');
            setScreen({ name: 'training', moduleId: 'pelvic_floor' });
          }}
        />
      ) : null}
    </div>
  );
};
