import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AudioSettings } from '../../application/ports';
import type { WellnessApplication } from '../../application/WellnessApplication';
import { CloseIcon, PlayIcon, SoundIcon } from '../../shared/ui/Icons';
import { useModalDialog } from '../../shared/hooks/useModalDialog';

type AudioSheetProps = {
  application: WellnessApplication;
  sampleText: string;
  onClose: () => void;
  onChange: (settings: AudioSettings) => void;
};

export const AudioSheet = ({ application, sampleText, onClose, onChange }: AudioSheetProps) => {
  const initial = application.audio.getSettings();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [volume, setVolume] = useState(initial.volume);

  const save = (nextEnabled: boolean, nextVolume: number) => {
    application.updateAudio(nextEnabled, nextVolume);
    onChange({ enabled: nextEnabled, volume: nextVolume });
  };

  const close = () => {
    application.audio.stop();
    onClose();
  };
  const dialogRef = useModalDialog<HTMLElement>(close);

  return createPortal(
    <div className="sheet-backdrop" role="presentation" onPointerDown={close}>
      <section
        ref={dialogRef}
        className="audio-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-sheet-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <p className="eyebrow">跟随文字，也可以听口令</p>
            <h2 id="audio-sheet-title" tabIndex={-1} data-modal-initial-focus>
              声音设置
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label="关闭声音设置">
            <CloseIcon />
          </button>
        </header>

        <label className="toggle-row">
          <span>
            <strong>语音口令</strong>
            <small>{enabled ? '已开启' : '已关闭，完整文字仍会显示'}</small>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              const next = event.target.checked;
              setEnabled(next);
              save(next, volume);
            }}
          />
          <i aria-hidden="true" />
        </label>

        <label className="volume-control">
          <span>
            <SoundIcon muted={!enabled} />
            音量
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            disabled={!enabled}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              save(enabled, next);
            }}
          />
          <output>{Math.round(volume * 100)}%</output>
        </label>

        <button
          className="secondary-button audio-preview"
          type="button"
          disabled={!enabled}
          onClick={() => void application.audio.speak(sampleText)}
        >
          <PlayIcon />
          播放试听
        </button>
      </section>
    </div>,
    document.body,
  );
};
