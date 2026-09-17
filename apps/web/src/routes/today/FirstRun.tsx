import { Link } from 'react-router';
import { Button, Card, PageHeader } from '@epistemics/ui';

/** Today before any course exists: what the app does, in two sentences, and one way forward. */
export function FirstRun() {
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="first-run">
      <PageHeader title="Welcome to Epistemics" description="Learning how to learn." />
      <Card className="space-y-4">
        <p className="text-sm leading-relaxed">
          A tutor teaches you a subject by asking questions, giving hints only after you try, and then checking you without any help.
          Each day you clear the reviews that are due, and only then does the next lesson unlock.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link to="/shelf"><Button className="w-full sm:w-auto" data-testid="first-run-shelf">Pick a course on the Shelf</Button></Link>
          <Link to="/setup" className="text-sm text-muted underline-offset-2 hover:underline">or build one from a subject or your own files</Link>
        </div>
        <ol className="grid gap-2 text-sm text-muted sm:grid-cols-3">
          <li className="rounded-md border border-line p-2"><span className="font-medium text-ink">1. Review</span><br />Answer what is due, rate your confidence first.</li>
          <li className="rounded-md border border-line p-2"><span className="font-medium text-ink">2. Learn</span><br />A lesson unlocks: try, work it out, say it in your own words.</li>
          <li className="rounded-md border border-line p-2"><span className="font-medium text-ink">3. Check</span><br />Prove it with no help; only that counts as learned.</li>
        </ol>
      </Card>
      <p className="text-xs text-muted">Everything stays on this device. The demo tutor works offline; pick a real model in Settings when you are ready.</p>
    </div>
  );
}
