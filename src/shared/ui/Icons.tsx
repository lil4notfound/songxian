import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const ArrowIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M5 12h13M14 7l5 5-5 5" />
  </svg>
);

export const BackIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const SoundIcon = ({ muted = false, ...props }: IconProps & { muted?: boolean }) => (
  <svg {...baseProps} {...props}>
    <path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z" />
    {muted ? <path d="m16 10 5 5m0-5-5 5" /> : <path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" />}
  </svg>
);

export const PauseIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m8 5 11 7-11 7V5Z" />
  </svg>
);

export const StopIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m5 12 4 4L19 6" />
  </svg>
);

export const RefreshIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M20 11a8 8 0 1 0-2 5.3M20 5v6h-6" />
  </svg>
);

export const CalendarIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
    <path d="M7.5 3v5M16.5 3v5M3.5 10h17" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
  </svg>
);

export const LockIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="5" y="10" width="14" height="10" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const PelvicIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M5 8.5c2.1 0 2.1 2 4.2 2s2.1-2 4.2-2 2.1 2 4.2 2" />
    <path d="M5 13.5c2.1 0 2.1 2 4.2 2s2.1-2 4.2-2 2.1 2 4.2 2" />
  </svg>
);

export const PostureIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M7 4v8a3 3 0 0 0 3 3h7" />
    <path d="M6 12h10a2 2 0 0 1 2 2v1H9" />
    <path d="M9 15v5M18 15v5" />
  </svg>
);

export const AnalIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3" />
  </svg>
);

export const DeviceIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="6" y="3" width="12" height="18" rx="3" />
    <path d="M9 7h6M9 11h6M9 15h2" />
    <circle cx="15" cy="15" r="1" />
  </svg>
);
