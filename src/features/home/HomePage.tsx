import type { ModuleId } from '../../domain/modules';
import { MODULES } from '../../domain/modules';
import { ArrowIcon } from '../../shared/ui/Icons';
import { BrandMark } from '../../shared/ui/BrandMark';
import { ConnectionBadge } from '../../shared/ui/ConnectionBadge';
import { StringVisual } from '../../shared/ui/StringVisual';

type HomePageProps = {
  onSelectModule: (moduleId: ModuleId) => void;
};

export const HomePage = ({ onSelectModule }: HomePageProps) => (
  <main className="home-page">
    <header className="home-header">
      <BrandMark />
      <ConnectionBadge />
    </header>

    <section className="home-intro" aria-labelledby="home-title">
      <div>
        <p className="eyebrow">现在，给身体一点空间</p>
        <h1 id="home-title">
          慢下来，
          <br />
          感受一次轻柔的收与放。
        </h1>
      </div>
      <StringVisual />
    </section>

    <section className="module-list" aria-label="选择练习">
      {MODULES.map((module) => (
        <button
          className={`module-card module-card--${module.tone}`}
          key={module.id}
          type="button"
          onClick={() => onSelectModule(module.id)}
        >
          <span className="module-card__number">{module.ordinal}</span>
          <span className="module-card__content">
            <strong>{module.title}</strong>
            <span>{module.description}</span>
          </span>
          <span className="module-card__meta">
            {module.duration}
            <ArrowIcon />
          </span>
          <span className="module-card__trace" aria-hidden="true" />
        </button>
      ))}
    </section>

    <footer className="home-footer">
      <span>保持自然呼吸</span>
      <span aria-hidden="true">·</span>
      <span>不舒服时随时停止</span>
    </footer>
  </main>
);
