import type { ComponentType, SVGProps } from 'react';
import { MODULES, type ModuleId } from '../../domain/modules';
import { AnalIcon, PelvicIcon, PostureIcon } from './Icons';

type ModuleTabBarProps = {
  activeModule: ModuleId;
  onSelect: (moduleId: ModuleId) => void;
};

const icons: Record<ModuleId, ComponentType<SVGProps<SVGSVGElement>>> = {
  pelvic_floor: PelvicIcon,
  posture: PostureIcon,
  anal: AnalIcon,
};

export const ModuleTabBar = ({ activeModule, onSelect }: ModuleTabBarProps) => (
  <nav className="module-tab-bar" aria-label="训练模块">
    <div className="module-tab-bar__material">
      {MODULES.map((module) => {
        const Icon = icons[module.id];
        const active = module.id === activeModule;
        return (
          <button
            key={module.id}
            type="button"
            className={active ? 'is-active' : ''}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(module.id)}
          >
            <span className="module-tab-bar__icon">
              <Icon />
            </span>
            <span>{module.shortTitle}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
