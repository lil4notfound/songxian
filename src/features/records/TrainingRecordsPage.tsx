import { useEffect, useMemo, useState } from 'react';
import type { WellnessApplication } from '../../application/WellnessApplication';
import type { CalendarDay, ProgressSnapshot } from '../../contracts/training';
import { BackIcon, CalendarIcon } from '../../shared/ui/Icons';
import { TopBar } from '../../shared/ui/TopBar';

type TrainingRecordsPageProps = {
  application: WellnessApplication;
  onBack: () => void;
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

const shiftMonth = (month: string, delta: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
};

const makeCalendar = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const count = new Date(Date.UTC(year!, monthNumber, 0)).getUTCDate();
  const leading = first.getUTCDay();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ];
};

export const TrainingRecordsPage = ({ application, onBack }: TrainingRecordsPageProps) => {
  const [month, setMonth] = useState(currentMonth);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const cells = useMemo(() => makeCalendar(month), [month]);
  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      application.training.getCalendar(month),
      application.training.getProgress(),
    ]).then(([nextDays, nextProgress]) => {
      if (!active) return;
      setDays(nextDays);
      setProgress(nextProgress);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [application, month]);

  const [year, monthNumber] = month.split('-');
  const today = new Date().toISOString().slice(0, 10);
  const moveMonth = (delta: number) => {
    setLoading(true);
    setMonth((value) => shiftMonth(value, delta));
  };

  return (
    <main className="records-page page-tone--moss">
      <TopBar title="训练记录" onBack={onBack} backLabel="返回训练" />
      <section className="records-overview">
        <p className="eyebrow">你的练习节奏</p>
        <div className="streak-line">
          <strong>{progress?.currentStreak ?? 0}</strong>
          <span>天连续打卡</span>
        </div>
        <p>{progress?.message ?? '正在读取训练记录…'}</p>
        <dl>
          <div>
            <dt>累计训练</dt>
            <dd>{progress?.trainingDays ?? 0} 天</dd>
          </div>
          <div>
            <dt>最长连续</dt>
            <dd>{progress?.longestStreak ?? 0} 天</dd>
          </div>
        </dl>
      </section>

      <section className="calendar-section" aria-busy={loading}>
        <header className="calendar-toolbar">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="上个月">
            <BackIcon />
          </button>
          <h1>
            {year} 年 {Number(monthNumber)} 月
          </h1>
          <button
            className="calendar-next"
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="下个月"
          >
            <BackIcon />
          </button>
        </header>
        <div className="calendar-weekdays" aria-hidden="true">
          {'日一二三四五六'.split('').map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((day, index) => {
            if (day === null) return <span key={`empty-${index}`} />;
            const date = `${month}-${String(day).padStart(2, '0')}`;
            const record = dayMap.get(date);
            return (
              <div
                key={date}
                className={`calendar-day ${record ? `is-${record.status}` : ''} ${date === today ? 'is-today' : ''}`}
                aria-label={`${date}${record ? `，${record.status === 'complete' ? '已完成' : '部分完成'}` : '，无训练'}`}
              >
                <span>{day}</span>
                {record ? (
                  <i aria-hidden="true">
                    <CalendarIcon />
                  </i>
                ) : null}
              </div>
            );
          })}
        </div>
        <footer className="calendar-legend">
          <span>
            <i className="is-complete" />
            完整打卡
          </span>
          <span>
            <i className="is-partial" />
            部分完成
          </span>
        </footer>
      </section>

      {progress?.improvements.length ? (
        <section className="improvement-list">
          <p className="eyebrow">最近的变化</p>
          {progress.improvements.map((item) => (
            <p key={item.metric}>
              <strong>+{item.change}%</strong>
              {item.message}
            </p>
          ))}
        </section>
      ) : null}
    </main>
  );
};
