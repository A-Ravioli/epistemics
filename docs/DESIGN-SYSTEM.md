# Epistemics design system

A saturated wallpaper, one translucent window, and inside it almost nothing: text, space, and a single blue
action. The window is a macOS document window — a toolbar across the top, then a sidebar, the screen, and an
inspector — and each screen inside it is still one column of things said in order, never a dashboard of
panels. The same build draws that window in a browser tab and in the desktop shell; §6 is the difference.

Implementation: tokens and materials in [`apps/web/src/styles.css`](../apps/web/src/styles.css);
components in [`packages/ui/src`](../packages/ui/src).

## 1. The two rules that produce the look

**All the colour lives behind the UI.** The wallpaper is four or five enormous, heavily blurred colour
fields — cream, jade, sky, cobalt. Nothing in the interface is anywhere near that saturated. The window is
a near-opaque white that blurs and over-saturates what is behind it, so it picks up a faint warm tint where
the wallpaper is warm and a cool one where it is cool; the nav pane lets slightly more through, which is why
it reads as a different material without having a colour of its own. Because the frame is colourful, the
chrome can be pure neutral and the whole thing still looks rich.

**Nothing is drawn that space can do instead.** No card outlines, no boxed panels, no rules between rows,
no uppercase eyebrows, no status chips repeating what the sentence already says. Grouping comes from
whitespace, headings and weight. The only filled shapes on a screen are the things you act on — buttons,
inputs, the selected row, a chat bubble — and the only saturated one is the single accent action.

The exceptions are the window's own structure, and they are the whole list: the window (hairline, radius,
shadow), a dialog and a menu (both really do float above something), the hairlines that separate the
toolbar and the three panes, and the raised white pills of the chrome — toolbar buttons, view tabs, pane
actions. Chrome may be raised; content may not. Inside a pane, the rule above still holds.

## 2. Screens are conversations

- Every screen is one column, `reading` width (680px) for anything you read.
- Today is a short exchange: what to do next, said once, in the tutor's serif voice, then one button, then a
  few quiet lines of state below it. No panel repeats what the next step already said.
- A lesson, a review and a teach-back are the conversation itself: a header line saying where you are, the
  turns, and a composer at the bottom. No side panel — the concept's context sits behind one disclosure at
  the top of the column.
- Secondary detail is a muted line, a tooltip, or a disclosure. It is never a box.

## 3. Tokens

### Materials and the wallpaper

| Token | Use |
| --- | --- |
| `--backdrop` | The wallpaper: five radial colour fields over a blue base, fixed to the viewport. |
| `--material-window` / `--blur-window` | The window: 90% white (88% graphite in dark) under `blur(48px) saturate(180%)`. |
| `--material-content` | The content pane: more white on top of the window, so reading surfaces stay clean. |
| `--material-nav` | The nav pane: less white, so more wallpaper tint comes through. |

Applied as `.surface` (the window), `.pane-content`, `.pane-nav`. Only these three may use `backdrop-filter`.

### Colour

Neutrals: `ink` (text), `muted` (the one secondary text colour), `surface` (an opaque block), `nested` and
`fill` / `fill-strong` (control fills and selection), `hairline` (the window edge, and nothing else now).

Accent: `accent` (#0071e3 light, #4da2ff dark), `accent-hover`, `on-accent`. Status tones — `green`,
`yellow`, `red`, `blue`, `purple`, `lime` — are `-bg`/`-fg` pairs used as *text colour* for a state
(locked, unlocked, in debt) and as a fill only in a banner. `muted` clears 4.5:1 on every material in both
themes; the status pairs clear 5.5:1.

### Radius, elevation, motion

`--radius-control: 10px` → `--radius-input: 12px` → `--radius-card: 16px` → `--radius-surface: 28px`, and
`rounded-full` for every action. Shadows: `--shadow-window` (the window and dialogs) and nothing else; a
raised look is not available, because nothing else is raised. Motion is 150–200ms on `--ease-out`, and all
of it is disabled under `prefers-reduced-motion`.

### Type

| Class | Size / weight | Use |
| --- | --- | --- |
| `.type-display` | 28/600 | The page title — one per screen. |
| `.type-title` | 21/600 | The title of the one thing a screen is about. |
| `.type-heading` | 17/600 | Section headings (`SectionTitle`). |
| `.type-body` | 15/400 | Body text; the default. |
| `.type-secondary` | 13 muted | Hints, meta, the quiet lines under a next step. |
| `.type-caption` | 12 muted | Counts, legends. |
| `.reading` / `.reading-sm` | 17/1.6 serif | What the learner is learning: tutor turns, item prompts, the next step on Today. |

Pick a step; never write a one-off `text-[nn]px`. The serif means "this is the material", so it never
appears in chrome.

## 4. Components

All in `@epistemics/ui`:

- **`Button`** — pills in `lg` / `md` / `sm`. One `primary` (filled accent) per screen; everything else is
  `secondary` (flat grey pill) or `ghost`. A settings screen has no primary at all.
- **`IconButton`** — round, nothing but the glyph until hover.
- **`Card`** — a block of content: no border, no shadow, no fill. `nested` is the one soft fill, for a
  passage quoted rather than written by the page (a prompt, a composer).
- **`inputClass`** — filled, borderless, ring on focus. In a composer even the ring goes: the caret is the
  indicator there.
- **`Switch`** / **`ChoiceGroup`** — a setting that applies immediately; one-of-N where each option needs a
  sentence, the chosen one revealing its own fields through `detail`.
- **`SegmentedGroup` / `Tabs` / `Stepper`** — a grey track, the selected segment white.
- **`Disclosure`** — a line of text that opens. It is how secondary detail is kept out of the way.
- **`Banner` / `ErrorBanner`** — the one tinted block, for a state the learner must notice.
- **`ListRow` / `navRowClass`** — one line per row; selection is a fill.
- **Chrome** — `Toolbar`, `ToolbarSearch`, `MenuPill` / `Menu`, `TrafficLights`, `SidebarGroup`,
  `PaneHeader` / `ViewTabs` / `PaneButton`, `Inspector` / `NoteCard` / `InspectorSection`. See §6.

## 5. Rules for new UI

1. Before adding a container, ask what a blank line would do instead. Usually the same thing.
2. Never add a border, a divider or a shadow *inside a pane*. If two things need separating, space them.
   The window's own structure (§6) is where hairlines and the one raised step live.
3. One accent action per screen, and only if the screen has one obvious next step.
4. Say it once. If the page title, the next step and a panel all name the same lesson, delete two of them.
5. State goes in the sentence ("Locked: reviews are due"), not in a chip beside it.
6. Secondary detail belongs in a muted line, a `title` tooltip or a disclosure.
7. Status colour means status; nothing is coloured to be pretty.
8. Everything focusable shows the focus ring (a composer's caret is its own), every icon-only control has a
   name, and every animation respects `prefers-reduced-motion`.
9. Check both themes; they are the same tokens.

## 6. The window

The window is one sheet with a 52px toolbar across the top and, under it, up to three panes divided by
hairlines.

| Part | What is in it |
| --- | --- |
| **Toolbar** (`Toolbar`) | Window buttons, the sidebar toggle and "build a course"; a search field in the middle that opens the command palette (`⌘K`); then the tutor in use (`MenuPill`) and the window's one blue action. |
| **Sidebar** (`AppSidebar`, `SidebarGroup`, `sidebarRowClass`) | Your courses, then the screens in three groups. Rows are names: no icons, no second line. Selection is a soft fill. It toggles from the toolbar and remembers its state. |
| **Pane header** (`PaneHeader`, `ViewTabs`, `PaneButton`) | On the left, the screen's views as raised pill tabs (Shelf: bundled / built / library / mine) or, with only one view, its name in muted type. On the right, at most two flat actions. |
| **Inspector** (`Inspector`, `NoteCard`, `InspectorSection`) | The right panel, from `lg`: tabs on the same line as the pane header, then a column of cards. Today puts the day's agenda there, the map the selected concept and the legend. Below `lg` it is not rendered, and the screen says the same thing inline — never both. |

A screen fills the header and the inspector with `useScreenChrome(() => ({ header, actions, inspector }), deps)`.
The deps are what the slots read; a value re-made every render (a handler, `navigate`) must not be listed.

Two screens take the whole window and have none of this: a checkpoint and a diagnostic (sat without help),
and the first-launch provider screen, which also strips the toolbar down to the window buttons.

**Browser and desktop.** The browser build floats the sheet on the wallpaper with a margin, rounded corners
and a shadow, and draws three decorative stoplight dots at the left of the toolbar so a tab still reads as
one window. The desktop build (`titleBarStyle: "Overlay"`, `hiddenTitle: true`) has no title bar of its own:
the sheet goes edge to edge, the toolbar *is* the title bar — a drag handle, with `--window-controls-w`
reserved at its left for the real stoplight buttons — and the OS supplies the corners and the shadow.

## 7. Checking a change

```bash
pnpm --filter @epistemics/web build
pnpm --filter @epistemics/web e2e     # Playwright, Chromium
```

The e2e suite drives the real screens, so a layout that breaks a flow fails there. For a visual check, run
`pnpm dev` and look at Today, a lesson, Settings and the Shelf in both themes — those four cover every
component in this document. Check the window itself too: collapse the sidebar, open the palette with `⌘K`,
and narrow the viewport past `lg` (the inspector goes and its content must reappear inline) and past `md`
(the sidebar becomes the toolbar's menu).
