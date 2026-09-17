# Epistemics design system

A saturated wallpaper, one floating translucent window, and inside it almost nothing: text, space, and a
single blue action. The app is a conversation with a tutor, so every screen is built as one column of
things said in order — never a dashboard of panels.

Implementation: tokens and materials in [`apps/web/src/styles.css`](../apps/web/src/styles.css);
components in [`packages/ui/src`](../packages/ui/src).

## 1. The two rules that produce the look

**All the colour lives behind the UI.** The wallpaper is four or five enormous, heavily blurred colour
fields — cream, jade, sky, cobalt. Nothing in the interface is anywhere near that saturated. The window is
a near-opaque white that blurs and over-saturates what is behind it, so it picks up a faint warm tint where
the wallpaper is warm and a cool one where it is cool; the nav pane lets slightly more through, which is why
it reads as a different material without having a colour of its own. Because the frame is colourful, the
chrome can be pure neutral and the whole thing still looks rich.

**Nothing is drawn that space can do instead.** No card outlines, no dividers, no boxed panels, no rules
between rows, no shadows, no uppercase eyebrows, no breadcrumbs, no status chips repeating what the
sentence already says. Grouping comes from whitespace, headings and weight. The only filled shapes on a
screen are the things you act on — buttons, inputs, the selected row, a chat bubble — and the only
saturated one is the single accent action.

Two exceptions, and they are the whole list: the window itself (hairline, radius, shadow) and a dialog,
because both really are floating above something.

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

## 5. Rules for new UI

1. Before adding a container, ask what a blank line would do instead. Usually the same thing.
2. Never add a border, a divider or a shadow. If two things need separating, space them.
3. One accent action per screen, and only if the screen has one obvious next step.
4. Say it once. If the page title, the next step and a panel all name the same lesson, delete two of them.
5. State goes in the sentence ("Locked: reviews are due"), not in a chip beside it.
6. Secondary detail belongs in a muted line, a `title` tooltip or a disclosure.
7. Status colour means status; nothing is coloured to be pretty.
8. Everything focusable shows the focus ring (a composer's caret is its own), every icon-only control has a
   name, and every animation respects `prefers-reduced-motion`.
9. Check both themes; they are the same tokens.

## 6. Checking a change

```bash
pnpm --filter @epistemics/web build
pnpm --filter @epistemics/web e2e     # Playwright, Chromium
```

The e2e suite drives the real screens, so a layout that breaks a flow fails there. For a visual check, run
`pnpm dev` and look at Today, a lesson, Settings and the Shelf in both themes — those four cover every
component in this document.
