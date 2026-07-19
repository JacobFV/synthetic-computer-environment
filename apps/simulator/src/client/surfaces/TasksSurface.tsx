import { useState } from 'react';
import { CalendarDays, CheckCircle2, Circle, Plus, SlidersHorizontal } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function TasksSurface({ manifest, computer }: SurfaceProps) {
  const linear = manifest.id === 'linear';
  type Task = [string, string, string];
  if (linear) return <LinearSurface manifest={manifest} computer={computer}/>;
  const listNames = ['Research', 'Personal'];
  const initialLists: Task[][] = [[['','Verify package receipts','Today'],['','Review window chrome','Today'],['','Capture app-specific states','Tomorrow'],['','Publish fidelity report','Friday']], [['','Water desk plant','Today'],['','Call about lab access','Tomorrow']]];
  const [lists, setLists] = useState<Task[][]>(initialLists);
  const [listIndex, setListIndex] = useState(0);
  const tasks = lists[listIndex]!;
  const setTasks = (updater: (items: Task[]) => Task[]) => setLists((all) => all.map((list, index) => index === listIndex ? updater(list) : list));
  const toggle = async (index: number) => { const task = tasks[index]!; const next = task[2] === 'Completed' ? 'Today' : 'Completed'; if (await runOperation(manifest, computer, next === 'Completed' ? 'complete' : 'update', { id: task[1], status: next })) setTasks((items) => items.map((item, itemIndex): Task => itemIndex === index ? [item[0], item[1], next] : item)); };
  const createTask = async () => { const next: Task = ['', 'New reminder', 'Today']; if (await runOperation(manifest, computer, 'create', { title: next[1], status: next[2], list: listNames[listIndex] })) setTasks((items) => [...items, next]); };
  const todayCount = lists.flat().filter((task) => task[2] === 'Today').length;
  return <div className="tasks-app surface-reminders"><aside><Brand manifest={manifest}/><div className="reminder-counts"><button className="today"><b>{todayCount}</b><span>Today</span></button><button><b>{lists.flat().length}</b><span>Scheduled</span></button></div><h5>MY LISTS</h5>{listNames.map((name, index) => <button key={name} className={listIndex === index ? 'active' : ''} onClick={() => setListIndex(index)}>{name} <b>{lists[index]!.length}</b></button>)}</aside><section><header><h1>{listNames[listIndex]}</h1><button>•••</button></header><button className="add-reminder" onClick={() => void createTask()}><Plus/> New Reminder</button>{tasks.map((task, index) => <label className={task[2] === 'Completed' ? 'completed' : ''} key={`${task[1]}-${index}`}><button onClick={() => void toggle(index)}>{task[2] === 'Completed' ? <CheckCircle2/> : <Circle/>}</button><span><b>{task[1]}</b><small><CalendarDays/> {task[2]}</small></span><button>ⓘ</button></label>)}</section></div>;
}

export function LinearSurface({ manifest, computer }: SurfaceProps) {
  type Task = [string, string, string];
  const initial: Task[] = [['SIM-128','Audit browser service isolation','In Progress'],['SIM-127','Fix Windows title-bar icon','Done'],['SIM-126','Add per-app information architecture','Todo'],['SIM-125','Record same-service messaging','Backlog']];
  const views = ['Inbox', 'My issues', 'Views'];
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [view, setView] = useState(0);
  const [hideCompleted, setHideCompleted] = useState(false);
  const shown = tasks.map((task, index) => ({ task, index })).filter(({ task }) => (!hideCompleted || task[2] !== 'Done') && (view !== 1 || task[2] === 'In Progress' || task[2] === 'Todo'));
  const toggle = async (index: number) => { const task = tasks[index]!; const next = task[2] === 'Done' ? 'Todo' : 'Done'; if (await runOperation(manifest, computer, next === 'Done' ? 'complete' : 'update', { id: task[0], status: next })) setTasks((items) => items.map((item, itemIndex): Task => itemIndex === index ? [item[0], item[1], next] : item)); };
  const createTask = async () => { const next: Task = [`SIM-${129 + tasks.length}`, 'New simulator issue', 'Todo']; if (await runOperation(manifest, computer, 'create', { id: next[0], title: next[1], status: next[2] })) setTasks((items) => [...items, next]); };
  return <div className="linear-app surface-linear"><aside><Brand manifest={manifest}/>{views.map((item, index) => <button key={item} className={view === index ? 'active' : ''} onClick={() => setView(index)}>{item}</button>)}<h5>WORKSPACE</h5><button>Seed Simulator</button><button>Cycles</button><button>Projects</button></aside><section><header><div><small>Seed Simulator /</small><h1>{view === 1 ? 'My issues' : view === 2 ? 'Views' : 'All issues'}</h1></div><button className={hideCompleted ? 'active' : ''} onClick={() => setHideCompleted((value) => !value)}><SlidersHorizontal/> {hideCompleted ? 'Hiding done' : 'Filter'}</button><button onClick={() => void createTask()}><Plus/> New issue</button></header><div className="issue-table"><header><span>ID</span><span>Issue</span><span>Status</span><span>Assignee</span></header>{shown.map(({ task, index }) => <button onClick={() => void toggle(index)} key={task[0]}><code>{task[0]}</code><b>{task[1]}</b><span className={`status-${task[2].toLowerCase().replace(' ','-')}`}>{task[2]}</span><i>A</i></button>)}</div></section></div>;
}
