import { useEffect, useRef, useState } from 'react';
import {
  ELIGIBILITY_QUESTIONS,
  isEligible,
  type EligibilityAnswer,
  type EligibilityAnswers,
} from '../../domain/eligibility';
import { ArrowIcon, BackIcon, CloseIcon } from '../../shared/ui/Icons';
import { useModalDialog } from '../../shared/hooks/useModalDialog';

type EligibilityDialogProps = {
  onClose: () => void;
  onApproved: () => void;
};

const ANSWERS: readonly { value: EligibilityAnswer; label: string; helper: string }[] = [
  { value: 'yes', label: '有', helper: '有其中任一种情况' },
  { value: 'no', label: '没有', helper: '以上情况都没有' },
  { value: 'unsure', label: '不确定', helper: '目前还拿不准' },
];

export const EligibilityDialog = ({ onClose, onApproved }: EligibilityDialogProps) => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [answers, setAnswers] = useState<EligibilityAnswers>({});
  const [blocked, setBlocked] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);
  const question = ELIGIBILITY_QUESTIONS[step];

  useEffect(() => {
    titleRef.current?.focus();
  }, [step, blocked]);

  if (!question) return null;
  const selected = answers[question.id];

  const handleNext = () => {
    if (!selected) return;
    if (step < ELIGIBILITY_QUESTIONS.length - 1) {
      setDirection('forward');
      setStep((current) => current + 1);
      return;
    }
    if (isEligible(answers)) onApproved();
    else setBlocked(true);
  };

  const handleBack = () => {
    setDirection('back');
    setBlocked(false);
    setStep((current) => Math.max(0, current - 1));
  };

  return (
    <div
      ref={dialogRef}
      className="eligibility-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="练习适用确认"
    >
      <header className="eligibility-dialog__header">
        <div className="progress-label" aria-live="polite">
          <span>适用确认</span>
          <strong>{step + 1} / 3</strong>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭适用确认">
          <CloseIcon />
        </button>
      </header>

      <div className="eligibility-progress" aria-hidden="true">
        {ELIGIBILITY_QUESTIONS.map((item, index) => (
          <span key={item.id} className={index <= step ? 'is-complete' : ''} />
        ))}
      </div>

      <div className={`eligibility-dialog__body slide-${direction}`} key={`${step}-${blocked}`}>
        {blocked ? (
          <section className="eligibility-result">
            <div className="eligibility-result__mark" aria-hidden="true">
              !
            </div>
            <p className="eyebrow">开始前再确认一下</p>
            <h1 ref={titleRef} tabIndex={-1} data-modal-initial-focus>
              请先向专业人员确认适用情况
            </h1>
            <p>
              你的回答中有“有”或“不确定”。先暂停这次练习，向医生、护士或康复专业人员确认后再开始。
            </p>
            <div className="eligibility-actions">
              <button className="secondary-button" type="button" onClick={handleBack}>
                <BackIcon />
                修改回答
              </button>
              <button className="primary-button" type="button" onClick={onClose}>
                返回首页
              </button>
            </div>
          </section>
        ) : (
          <section className="eligibility-question">
            <p className="eyebrow">{question.title}</p>
            <h1 ref={titleRef} tabIndex={-1} data-modal-initial-focus>
              {question.question}
            </h1>
            <p className="question-helper">有其中任一种选“有”；都没有选“没有”。</p>

            <fieldset className="answer-options">
              <legend className="sr-only">请选择一种回答</legend>
              {ANSWERS.map((answer) => (
                <label
                  key={answer.value}
                  className={selected === answer.value ? 'is-selected' : ''}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={answer.value}
                    checked={selected === answer.value}
                    onChange={() =>
                      setAnswers((current) => ({ ...current, [question.id]: answer.value }))
                    }
                  />
                  <span>
                    <strong>{answer.label}</strong>
                    <small>{answer.helper}</small>
                  </span>
                  <i aria-hidden="true" />
                </label>
              ))}
            </fieldset>

            <div className="eligibility-actions">
              {step > 0 ? (
                <button className="secondary-button" type="button" onClick={handleBack}>
                  <BackIcon />
                  上一步
                </button>
              ) : (
                <span />
              )}
              <button
                className="primary-button"
                type="button"
                onClick={handleNext}
                disabled={!selected}
              >
                {step === 2 ? '确认并开始' : '下一步'}
                <ArrowIcon />
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
