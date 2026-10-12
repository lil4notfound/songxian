export const BrandMark = ({ compact = false }: { compact?: boolean }) => (
  <div className={compact ? 'brand-mark brand-mark--compact' : 'brand-mark'} aria-label="松弦">
    <span className="brand-mark__symbol" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
    <span>松弦</span>
  </div>
);
