import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

type CalEvent = { label: string; cal: number };

export function CalendarSurface({ manifest, computer }: SurfaceProps) {
  const calendars = ['Work', 'Research', 'Personal', 'Reminders'];
  const [day, setDay] = useState(16);
  const [weekStart, setWeekStart] = useState(13);
  const [view, setView] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [enabled, setEnabled] = useState<boolean[]>([true, true, true, true]);
  const [events, setEvents] = useState<Record<number, CalEvent[]>>({ 16: [{ label: '09:30  Simulator review', cal: 0 }, { label: '13:00  Network fidelity study', cal: 1 }, { label: '16:30  Evidence capture', cal: 1 }], 17: [{ label: '10:00  App ecosystem audit', cal: 0 }, { label: '15:00  Agent evaluation', cal: 1 }], 18: [{ label: '11:30  Package manager test', cal: 2 }] });
  const shown = (value: number): CalEvent[] => (events[value] ?? []).filter((event) => enabled[event.cal]);
  const selectDay = async (value: number) => { if (await runOperation(manifest, computer, 'list-events', { day: value })) setDay(value); };
  const createEvent = async () => { const title = 'New event'; const cal = enabled.findIndex(Boolean); if (await runOperation(manifest, computer, 'create-event', { title, day, at: `2026-07-${day}T14:00:00` })) setEvents((items) => ({ ...items, [day]: [...(items[day] ?? []), { label: `14:00  ${title}`, cal: cal < 0 ? 0 : cal }] })); };
  const shiftWeek = async (delta: number) => { const nextStart = Math.max(1, weekStart + delta); await runOperation(manifest, computer, 'list-events', { weekStart: nextStart }); setWeekStart(nextStart); setDay(nextStart + 3); };
  const goToday = async () => { await runOperation(manifest, computer, 'list-events', { day: 16 }); setWeekStart(13); setDay(16); };
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((offset) => weekStart + offset);
  const columns = view === 'Day' ? [day] : weekDays;
  return <div className="calendar-app surface-calendar"><aside><Brand manifest={manifest}/><button className="primary" onClick={() => void createEvent()}><Plus/> New event</button><h5>CALENDARS</h5>{calendars.map((item, index) => <label key={item}><input type="checkbox" checked={enabled[index]} onChange={() => setEnabled((flags) => flags.map((flag, flagIndex) => flagIndex === index ? !flag : flag))}/><i className={`calendar-color c${index}`}/>{item}</label>)}</aside><section><header><button onClick={() => void goToday()}>Today</button><button onClick={() => void shiftWeek(-7)}>‹</button><button onClick={() => void shiftWeek(7)}>›</button><h1>{view === 'Month' ? 'July 2026' : `July ${weekStart}–${weekStart + 6}, 2026`}</h1><div>{(['Day', 'Week', 'Month'] as const).map((option) => <button key={option} className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option}</button>)}</div></header><div className="week-grid" style={view === 'Day' ? { gridTemplateColumns: 'auto 1fr' } : undefined}><div className="hours">{['8 AM','10 AM','12 PM','2 PM','4 PM','6 PM'].map((hour) => <span key={hour}>{hour}</span>)}</div>{columns.map((value) => <button className={day === value ? 'selected' : ''} onClick={() => void selectDay(value)} key={value}><b>{['MON','TUE','WED','THU','FRI','SAT','SUN'][(value - 13) % 7 < 0 ? ((value - 13) % 7 + 7) : (value - 13) % 7]}</b><span>{value}</span>{shown(value).map((event) => <i key={event.label} className={`calendar-color-tag c${event.cal}`}>{event.label}</i>)}</button>)}</div><footer><b>{new Date(2026, 6, day).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</b>{(shown(day).length ? shown(day).map((event) => event.label) : ['No scheduled events']).map((event) => <span key={event}>{event}</span>)}</footer></section></div>;
}
