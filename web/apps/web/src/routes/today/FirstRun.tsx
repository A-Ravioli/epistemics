import { Link } from 'react-router';
import { Button, Page } from '@epistemics/ui';

/**
 * Today with no course: someone who skipped the first run, or who removed every course they had. It does
 * not re-explain the app — the flow does that, and does it by asking rather than telling (ONBOARDING §2) —
 * so its job is one sentence and one way back into the flow.
 */
export function FirstRun() {
  return (
    <Page width="reading" data-testid="first-run">
      <header>
        <h1 className="type-display">Nothing to learn yet</h1>
        <p className="mt-1 text-[13px] text-muted">Learning how to learn.</p>
      </header>
      <p className="reading text-ink">
        A tutor teaches you a subject by asking questions, giving hints only after you try, and then checking you without any help.
        Each day you clear the reviews that are due, and only then does the next lesson unlock.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to="/welcome?course=new" className="inline-block w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto" data-testid="first-run-start">Choose something to learn</Button>
        </Link>
        <Link to="/shelf" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline" data-testid="first-run-shelf">or browse the Shelf</Link>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        It takes about two minutes: pick a subject, write down whatever you already know about it, and say how much time you have most days.
        Everything stays on this device.
      </p>
    </Page>
  );
}
