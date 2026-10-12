import type { TrainingIssue } from '../../domain/trainingGuard';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../../shared/hooks/useModalDialog';
export const InterruptionDialog = ({
  issue,
  ready,
  onResume,
  onStop,
  tone,
}: {
  issue: TrainingIssue;
  ready: boolean;
  onResume: () => void;
  onStop: () => void;
  tone: string;
}) => {
  const ref = useModalDialog<HTMLDivElement>();
  return createPortal(
    <div
      ref={ref}
      className={'pause-dialog page-tone--' + tone}
      role="dialog"
      aria-modal="true"
      aria-labelledby="interruption-title"
    >
      <section>
        <p className="eyebrow">已暂停本轮</p>
        <h1 id="interruption-title" tabIndex={-1} data-modal-initial-focus>
          先调整，再继续
        </h1>
        <p role="alert">{issue.message}</p>
        <p role="status">
          {ready ? '输入已经稳定，可以重做本轮。' : '调整后保持稳定两秒，再重做本轮。'}
        </p>
        <button className="primary-button" type="button" disabled={!ready} onClick={onResume}>
          调整后重做本轮
        </button>
        <button className="danger-link" type="button" onClick={onStop}>
          结束训练
        </button>
      </section>
    </div>,
    document.body,
  );
};
