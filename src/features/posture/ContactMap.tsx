import type { CSSProperties } from 'react';
import type { DeviceSnapshot } from '../../domain/posture';
const intensity = (value: number): CSSProperties =>
  ({ '--contact': Math.max(0.08, Math.min(1, value)) }) as CSSProperties;
export const ContactMap = ({ snapshot }: { snapshot: DeviceSnapshot }) => (
  <div className="contact-map contact-map--v2" aria-label="当前臀下、腿侧与背部中央接触趋势">
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label="背部中央方片；腿侧和臀下左右各一个圆片，左右以坐着的人为准"
    >
      <path
        d="M84 22 Q160 0 236 22 L226 108 Q252 123 257 196 Q160 238 63 196 Q68 123 94 108Z"
        fill="var(--paper-bright)"
        stroke="var(--line)"
        strokeWidth="2"
      />
      <rect
        className="contact-point"
        x="143"
        y="46"
        width="34"
        height="34"
        rx="4"
        style={intensity(snapshot.backCenter)}
      />
      <text x="160" y="37" textAnchor="middle">
        背部中央
      </text>
      <circle
        className="contact-point"
        cx="82"
        cy="165"
        r="17"
        style={intensity(snapshot.thighLeft)}
      />
      <circle
        className="contact-point"
        cx="238"
        cy="165"
        r="17"
        style={intensity(snapshot.thighRight)}
      />
      <circle
        className="contact-point"
        cx="126"
        cy="184"
        r="17"
        style={intensity(snapshot.gluteLeft)}
      />
      <circle
        className="contact-point"
        cx="194"
        cy="184"
        r="17"
        style={intensity(snapshot.gluteRight)}
      />
      <text x="46" y="144" textAnchor="middle">
        腿侧左
      </text>
      <text x="274" y="144" textAnchor="middle">
        腿侧右
      </text>
      <text x="118" y="217" textAnchor="middle">
        臀下左
      </text>
      <text x="202" y="217" textAnchor="middle">
        臀下右
      </text>
    </svg>
    <p>左右以坐着的人为准 · 颜色表示相对接触变化</p>
  </div>
);
