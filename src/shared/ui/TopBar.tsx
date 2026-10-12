import { BackIcon } from './Icons';
import { BrandMark } from './BrandMark';

type TopBarProps = {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  action?: React.ReactNode;
};

export const TopBar = ({ title, onBack, backLabel = '返回首页', action }: TopBarProps) => (
  <header className="top-bar">
    <div className="top-bar__side">
      {onBack ? (
        <button className="icon-button" type="button" onClick={onBack} aria-label={backLabel}>
          <BackIcon />
        </button>
      ) : (
        <BrandMark compact />
      )}
    </div>
    {title ? <p className="top-bar__title">{title}</p> : null}
    <div className="top-bar__side top-bar__side--right">{action}</div>
  </header>
);
