/**
 * Which window the same build is running in. The desktop shell hides the system title bar on macOS and lets
 * the app draw the toolbar itself, so the chrome has to know: it reserves room for the OS stoplight buttons
 * at the left of the toolbar and makes the rest of that bar a drag handle. In a browser tab neither applies,
 * and the three dots at the left of the toolbar are decoration.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * True only where the OS draws its window buttons *over* our toolbar: the desktop build on macOS, where
 * `titleBarStyle: "Overlay"` is in force. Windows and Linux keep their own title bar above the window, so
 * nothing is reserved there.
 */
export function hasOverlayWindowControls(): boolean {
  if (!isDesktop()) return false;
  const ua = typeof navigator !== 'undefined' ? `${navigator.userAgent} ${(navigator as { platform?: string }).platform ?? ''}` : '';
  return /Mac|iPhone|iPad/.test(ua);
}
