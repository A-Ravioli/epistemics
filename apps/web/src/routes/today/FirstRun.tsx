import { Link } from 'react-router';
import { Button, Card, Page, PageHeader } from '@epistemics/ui';

const LOOP = [
  { n: 1, title: 'Review', body: 'Answer what is due, rate your confidence first.' },
  { n: 2, title: 'Learn', body: 'A lesson unlocks: try, work it out, say it in your own words.' },
  { n: 3, title: 'Check', body: 'Prove it with no help; only that counts as learned.' },
];

/** Today before any course exists: what the app does, in two sentences, and one way forward. */
export function FirstRun() {
  return (
    <Page width="sm" data-testid="first-run">
      <PageHeader title="Welcome to Epistemics" description="Learning how to learn." />
      <Card className="space-y-5 p-5 sm:p-7">
        <p className="reading max-w-xl text-ink">
          A tutor teaches you a subject by asking questions, giving hints only after you try, and then checking you without any help.
          Each day you clear the reviews that are due, and only then does the next lesson unlock.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link to="/shelf" className="inline-block w-full sm:w-auto"><Button className="w-full sm:w-auto" data-testid="first-run-shelf">Pick a course on the Shelf</Button></Link>
          <Link to="/setup" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">or build one from a subject or your own files</Link>
        </div>
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          {LOOP.map((s) => (
            <li key={s.n} className="rounded-input bg-nested p-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fill-strong text-[11px] font-semibold tabular-nums">{s.n}</span>
                <span className="font-semibold text-ink">{s.title}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-xs text-muted">Everything stays on this device. The demo tutor works offline; pick a real model in Settings when you are ready.</p>
    </Page>
  );
}
