/**
 * The slots a screen fills in the window chrome: the views and actions in the pane header, and the tabs of
 * the inspector on the right. The shell owns both rows so they line up across the window; a screen declares
 * what goes in them with `useScreenChrome`, and the shell renders it.
 */
import { createContext, useContext, useEffect, useMemo, useState, type DependencyList, type ReactNode } from 'react';

export interface InspectorTab {
  id: string;
  label: string;
  /** Rendered only while the tab is the selected one, so a heavy panel costs nothing until it is opened. */
  render: () => ReactNode;
  testId?: string;
}

export interface ScreenChrome {
  /** Left of the pane header: the screen's name, or its view tabs. */
  header?: ReactNode;
  /** Right of the pane header: at most two flat actions. */
  actions?: ReactNode;
  /** The right-hand panel. Omit it and the window is two panes wide. */
  inspector?: InspectorTab[];
}

interface ChromeApi {
  chrome: ScreenChrome;
  set(next: ScreenChrome): void;
}

const ChromeContext = createContext<ChromeApi | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<ScreenChrome>({});
  const api = useMemo<ChromeApi>(() => ({ chrome, set: setChrome }), [chrome]);
  return <ChromeContext.Provider value={api}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ScreenChrome {
  return useContext(ChromeContext)?.chrome ?? {};
}

/**
 * Declare this screen's header and inspector. `deps` works like `useMemo`'s: list what the slots read, and
 * nothing else, or the chrome re-renders on every keystroke.
 */
export function useScreenChrome(build: () => ScreenChrome, deps: DependencyList): void {
  const api = useContext(ChromeContext);
  useEffect(() => {
    if (!api) return;
    api.set(build());
    return () => api.set({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
