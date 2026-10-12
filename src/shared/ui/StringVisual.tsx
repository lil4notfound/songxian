type StringVisualProps = {
  active?: boolean;
  tone?: 'moss' | 'clay' | 'indigo' | 'gold';
  compact?: boolean;
};

export const StringVisual = ({
  active = false,
  tone = 'gold',
  compact = false,
}: StringVisualProps) => (
  <div
    className={`string-visual string-visual--${tone} ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`}
    aria-hidden="true"
  >
    <span />
    <span />
    <span />
    <span />
    <span />
  </div>
);
