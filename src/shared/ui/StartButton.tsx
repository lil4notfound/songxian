import { PlayIcon } from './Icons';

type StartButtonProps = {
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
};

export const StartButton = ({
  ariaLabel,
  onClick,
  disabled = false,
  label = '开始',
}: StartButtonProps) => (
  <button
    className="start-button"
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    disabled={disabled}
  >
    <PlayIcon aria-hidden="true" />
    <span>{label}</span>
  </button>
);
