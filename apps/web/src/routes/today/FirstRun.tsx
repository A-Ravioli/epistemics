import { Link } from 'react-router';
import { Button, Page } from '@epistemics/ui';

/** Today before any course exists: what the app does, in two sentences, and one way forward. */
export function FirstRun() {
  return (
    <Page width="reading" data-testid="first-run">
      <header>
        <h1 className="type-display">Welcome to Epistemics</h1>
        <p className="mt-1 text-[13px] text-muted">Learning how to learn.</p>
      </header>
      <p className="reading text-ink">
        A tutor teaches you a subject by asking questions, giving hints only after you try, and then checking you without any help.
        Each day you clear the reviews that are due, and only then does the next lesson unlock.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to="/shelf" className="inline-block w-full sm:w-auto"><Button size="lg" className="w-full sm:w-auto" data-testid="first-run-shelf">Pick a course on the Shelf</Button></Link>
        <Link to="/setup" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">or build one from a subject or your own files</Link>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        The loop is three steps: answer what is due and say how sure you are first; then a lesson — try, work it out, put it in your own
        words; then prove it with no help, because only that counts as learned. Everything stays on this device, and the demo tutor works
        offline until you pick a real model in Settings.
      </p>
    </Page>
  );
}
