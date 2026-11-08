import { useEffect, useState } from 'react';
import { Icon } from './components/Icon';
import { FeedbackProvider } from './components/ui';
import { RestTimerProvider } from './components/RestTimer';
import { useRoute, navigate } from './hooks/route';
import { db, dbMode, writeDbMode } from './db/db';
import { ensureInitialised } from './db/repo';
import { generateSampleData } from './data/sampleData';
import { todayISO } from './lib/dates';
import { TodayScreen } from './screens/Today';
import { SessionScreen } from './screens/SessionScreen';
import { ScheduleScreen, ProgrammeEditor } from './screens/Schedule';
import { ProgressScreen } from './screens/progress/Progress';
import { LogScreen } from './screens/Log';
import { ProfileScreen } from './screens/Profile';

const NAV = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'log', label: 'Log', icon: 'list' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

async function prepareDatabase(): Promise<void> {
  if (dbMode === 'sample' && (await db.sessions.count()) === 0) {
    const sample = generateSampleData(todayISO());
    await db.transaction('rw', db.tables, async () => {
      for (const [table, rows] of Object.entries(sample)) if (rows.length) await db.table(table).bulkPut(rows);
    });
  }
  await ensureInitialised();
}

export function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    prepareDatabase()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="screen">
        <div className="alert critical">
          <Icon name="alert" />
          <div>
            <div className="alert-title">Storage could not be opened</div>
            {error}. Private browsing can block storage on iPhone; open the app in a normal Safari tab or from the home screen.
          </div>
        </div>
      </div>
    );
  }
  if (!ready) return <div className="screen" />;

  const [top, sub, third] = route;
  const activeTab = top === 'session' ? 'today' : NAV.some((n) => n.id === top) ? top : 'today';
  let screen;
  if (top === 'session' && sub) screen = <SessionScreen id={sub} key={sub} />;
  else if (top === 'schedule' && sub === 'edit') screen = <ProgrammeEditor />;
  else if (top === 'schedule') screen = <ScheduleScreen />;
  else if (top === 'progress') screen = <ProgressScreen tab={sub} param={third} />;
  else if (top === 'log') screen = <LogScreen />;
  else if (top === 'profile') screen = <ProfileScreen section={sub} />;
  else screen = <TodayScreen />;

  return (
    <FeedbackProvider>
      <RestTimerProvider>
        <div className={`app${dbMode === 'sample' ? ' has-banner' : ''}`}>
          {dbMode === 'sample' && (
            <div className="sample-banner" role="status" data-testid="sample-banner">
              <span>Sample data — not your training history</span>
              <button
                onClick={() => {
                  writeDbMode('real');
                  window.location.hash = '#/today';
                  window.location.reload();
                }}
              >
                Exit
              </button>
            </div>
          )}
          {screen}
          <nav className="bottom-nav" aria-label="Main">
            <div className="bottom-nav-inner">
              {NAV.map((n) => (
                <button key={n.id} className={`nav-item${activeTab === n.id ? ' active' : ''}`} onClick={() => navigate(n.id)} aria-current={activeTab === n.id ? 'page' : undefined} data-testid={`nav-${n.id}`}>
                  <Icon name={n.icon} />
                  {n.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </RestTimerProvider>
    </FeedbackProvider>
  );
}
