export const ConnectionBadge = ({ connected = true }: { connected?: boolean }) => (
  <div className={`connection-badge ${connected ? 'is-ready' : ''}`}>
    <span className="connection-badge__dot" aria-hidden="true" />
    <span>{connected ? '坐垫已连接' : '正在连接'}</span>
  </div>
);
