import { PauseIcon, PlayIcon, StopIcon } from '../../shared/ui/Icons';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../../shared/hooks/useModalDialog';

type PauseDialogProps = {
  cycle: number;
  finishing: boolean;
  onResume: () => void;
  onStop: () => void;
  tone: string;
};

export const PauseDialog = ({ cycle, finishing, onResume, onStop, tone }: PauseDialogProps) => {
  const dialogRef = useModalDialog<HTMLDivElement>();

  return createPortal(
    <div
      ref={dialogRef}
      className={'pause-dialog page-tone--' + tone}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <section>
        <div className="pause-dialog__icon" aria-hidden="true">
          <PauseIcon />
        </div>
        <p className="eyebrow">练习已暂停</p>
        <h1 id="pause-title" tabIndex={-1} data-modal-initial-focus>
          先完全放松，重新坐好
        </h1>
        <p>
          {finishing
            ? '准备好后继续听完结束说明。'
            : `继续后会先准备 3 秒，再从第 ${cycle} 轮的收缩重新开始。`}
        </p>
        <button className="primary-button" type="button" onClick={onResume}>
          <PlayIcon />
          {finishing ? '继续' : '准备好，重做本轮'}
        </button>
        <button className="danger-link" type="button" onClick={onStop}>
          <StopIcon />
          不舒服，结束练习
        </button>
      </section>
    </div>,
    document.body,
  );
};
