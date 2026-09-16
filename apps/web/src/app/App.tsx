import { Routes, Route, NavLink, Navigate } from 'react-router';
import { Card } from '@epistemics/ui';

function Placeholder({ name }: { name: string }) {
  return <Card><h1 className="text-lg font-semibold">{name}</h1><p className="text-sm text-ink/70">Coming together.</p></Card>;
}

const nav = [
  ['/today', 'Today'], ['/shelf', 'Shelf'], ['/map', 'Map'], ['/progress', 'Progress'], ['/settings', 'Settings'],
] as const;

export function App() {
  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-line bg-mist/40 p-3">
        <div className="mb-3 px-2 text-base font-semibold tracking-tight">Epistemics</div>
        {nav.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `rounded-md px-2 py-1.5 text-sm ${isActive ? 'bg-ink text-paper' : 'hover:bg-mist'}`}>{label}</NavLink>
        ))}
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Placeholder name="Today" />} />
          <Route path="/shelf" element={<Placeholder name="Shelf" />} />
          <Route path="/map" element={<Placeholder name="Course map" />} />
          <Route path="/progress" element={<Placeholder name="Progress" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
        </Routes>
      </main>
    </div>
  );
}
