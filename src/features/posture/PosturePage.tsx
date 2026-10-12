import { useEffect, useRef, useState } from 'react';
import type { AudioSettings } from '../../application/ports';
import type { WellnessApplication } from '../../application/WellnessApplication';
import { CalendarIcon, DeviceIcon, SoundIcon } from '../../shared/ui/Icons';
import { TopBar } from '../../shared/ui/TopBar';
import { AudioSheet } from '../audio/AudioSheet';
import { ContactMap } from './ContactMap';
import { usePostureSession } from './usePostureSession';
import { derivePostureAdvice } from '../../domain/posture';

type PosturePageProps = {
  application: WellnessApplication;
  onOpenRecords: () => void;
  onOpenDevice: () => void;
};

export const PosturePage = ({ application, onOpenRecords, onOpenDevice }: PosturePageProps) => {
  const [audio, setAudio] = useState<AudioSettings>(() => application.audio.getSettings());
  const [audioOpen, setAudioOpen] = useState(false);
  const { snapshot, advice } = usePostureSession(application.device);

  const lastSpoken = useRef(new Map<string, number>());
  const currentAdvice = useRef(advice);
  useEffect(() => {
    currentAdvice.current = derivePostureAdvice(snapshot);
  }, [snapshot]);
  const [unlocked, setUnlocked] = useState(() => application.audio.isUnlocked?.() ?? false);
  useEffect(() => {
    const unlock = () => {
      application.audio.unlock?.();
      setUnlocked(true);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [application]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        !audio.enabled ||
        !unlocked ||
        currentAdvice.current.state !== advice.state ||
        document.visibilityState === 'hidden' ||
        ['balanced', 'uncalibrated', 'adjusting'].includes(advice.state)
      )
        return;
      const now = performance.now();
      if (now - (lastSpoken.current.get(advice.state) ?? Number.NEGATIVE_INFINITY) < 30000) return;
      lastSpoken.current.set(advice.state, now);
      void application.audio.speak(advice.message);
    }, 500);
    return () => window.clearInterval(timer);
  }, [advice, application, audio.enabled, unlocked]);
  useEffect(() => () => application.audio.stop(), [application]);
  return (
    <main className="posture-page page-tone--clay">
      <TopBar
        title="坐姿矫正"
        action={
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              onClick={onOpenDevice}
              aria-label="设备与校准"
            >
              <DeviceIcon />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={onOpenRecords}
              aria-label="训练记录"
            >
              <CalendarIcon />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setAudioOpen(true)}
              aria-label="声音设置"
            >
              <SoundIcon muted={!audio.enabled} />
            </button>
          </div>
        }
      />

      <section className="posture-heading">
        <p className="eyebrow">此刻的支撑</p>
        <div className="posture-heading__row">
          <h1>{advice.label}</h1>
          <span
            className={`observation-state ${snapshot.stable ? 'is-stable' : ''}`}
            role="status"
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {snapshot.stable ? '输入稳定' : '正在观察'}
          </span>
        </div>
      </section>

      <section className="posture-layout">
        <ContactMap snapshot={snapshot} />

        <div className="advice-panel" aria-live="polite">
          <span className="advice-panel__number">现在只做这一件事</span>
          <h2>{advice.message}</h2>
          <button
            className="listen-button"
            type="button"
            disabled={!audio.enabled}
            onClick={() => void application.audio.speak(advice.message)}
          >
            <SoundIcon />
            听建议
          </button>

          <div className="posture-metrics" aria-label="接触概览">
            <div>
              <span>臀下平衡</span>
              <strong>
                {Math.round((1 - Math.abs(snapshot.gluteLeft - snapshot.gluteRight)) * 100)}%
              </strong>
            </div>
            <div>
              <span>腿侧平衡</span>
              <strong>
                {Math.round((1 - Math.abs(snapshot.thighLeft - snapshot.thighRight)) * 100)}%
              </strong>
            </div>
          </div>
        </div>
      </section>

      {audioOpen ? (
        <AudioSheet
          application={application}
          sampleText={advice.message}
          onClose={() => setAudioOpen(false)}
          onChange={setAudio}
        />
      ) : null}
    </main>
  );
};
