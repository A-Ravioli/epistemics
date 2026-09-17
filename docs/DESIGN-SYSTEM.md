# Epistemics design system

The look: a saturated, blurred wallpaper, and one floating translucent window that holds a quiet neutral
interface with a single blue accent. This document says why that reads the way it does, fixes the tokens
and components that produce it, and gives the rules for adding anything new.

Implementation: tokens and materials in [`apps/web/src/styles.css`](../apps/web/src/styles.css);
components in [`packages/ui/src`](../packages/ui/src). Nothing here is decorative — every rule below is a
constraint that keeps screens looking like one another.

## 1. What makes the reference look like that

The style comes from a handful of decisions, not from any one gradient or corner radius:

1. **All the colour lives behind the UI.** The backdrop is four or five enormous radial colour fields —
   cream, jade, sky, cobalt — blurred well past any detail. Nothing in the interface is anywhere near that
   saturated. Because the frame is colourful, the chrome can be pure neutral and the whole thing still
   reads as rich rather than grey.
2. **One window, floating.** A large corner radius (28px), a hairline, and a shadow in two stages — a tight
   contact shadow plus a wide, soft one. The window is inset from the edge so that the wallpaper frames it.
3. **The window is translucent, not white.** It is a near-opaque white that blurs and over-saturates what
   is behind it, so it picks up a faint warm tint where the wallpaper is warm and a cool one where it is
   cool. A sidebar that lets slightly more through reads as a different, cooler material than the content
   pane beside it — without either having a colour of its own.
4. **Controls are filled and borderless.** Search fields, text inputs, list rows: a light grey fill, a 10–12px
   radius, no stroke. Hairlines exist only to *separate regions* (a column rule, a row rule), never to
   outline a control.
5. **Exactly one accent.** System blue, and only on the thing that matters: the primary button, the switch
   that is on, the chosen option, a link, the focus ring. Everything else — off states, secondary text,
   disabled groups — is neutral. That is what makes the blue mean something.
6. **Elevation is rationed.** Three steps: the window, a raised white pill (the selected segment, a
   secondary button), and flat. Selection inside a list is a *fill*, never a border or a shadow.
7. **Geometry escalates with size.** Pills for actions, 10–16px for rows and cards, 28px for the window.
8. **The type ramp is wide and the leading is loose.** A 28px semibold title over 15px body, with 24–32px of
   air between groups. Most of the "premium" feeling is vertical space, not styling.
9. **One grey for the second voice.** All secondary text is the same muted grey, never a lighter black.
   Disabled means the whole group drops to ~40% opacity, not a different colour.

## 2. Tokens

### Materials and the wallpaper

| Token | Use |
| --- | --- |
| `--backdrop` | The wallpaper: five radial colour fields over a blue base, fixed to the viewport. |
| `--material-window` / `--blur-window` | The window: 90% white (88% graphite in dark) under `blur(48px) saturate(180%)`. |
| `--material-content` | The content pane: more white on top of the window, so reading surfaces stay clean. |
| `--material-nav` | The nav pane: less white, so more wallpaper tint comes through and the pane separates itself without a colour. |

Applied as `.surface` (the window), `.pane-content`, `.pane-nav`. Only these three classes are allowed to
use `backdrop-filter`: blurring is expensive, and a blur over an already-opaque parent buys nothing.

### Colour

Neutrals: `ink` (primary text), `muted` (the one secondary text colour), `surface` (opaque cards),
`nested` (a quieter fill inside a card), `fill` / `fill-strong` (control fills and selection),
`hairline` / `hairline-soft` (region separators).

Accent: `accent` (#0071e3 light, #4da2ff dark), `accent-hover`, `on-accent`. Status tones — `blue`, `green`,
`yellow`, `purple`, `red`, `lime` — exist as `-bg`/`-fg` pairs and are *only* for status (a pill, a banner,
mastery in the map). They never become decoration.

`muted` clears 4.5:1 on every material it sits on, in both themes; the status pairs all clear 5.5:1. Check
any new pairing before using it.

### Radius, elevation, motion

`--radius-control: 10px` → `--radius-input: 12px` → `--radius-card: 16px` → `--radius-surface: 28px`, and
`rounded-full` for every action. Shadows: `--shadow-window`, `--shadow-raised`, `--shadow-lift` (hover only),
`--shadow-accent` (the primary button). There is no fourth elevation; if something needs to stand out,
give it a fill, not a shadow. Motion is 150–200ms on `--ease-out`, and everything is disabled under
`prefers-reduced-motion`.

### Type

| Class | Size / weight | Use |
| --- | --- | --- |
| `.type-display` | 28/600 | The page title — one per screen (`PageHeader`). |
| `.type-title` | 21/600 | The title of the one thing a screen is about. |
| `.type-heading` | 17/600 | Section and card headings (`SectionTitle`). |
| `.type-body` | 15/400 | Body text; the default. |
| `.type-secondary` | 13 muted | Hints, meta, help lines. |
| `.type-caption` | 12 muted | Counts, timestamps, legends. |
| `.reading` / `.reading-sm` | 17/1.6 serif | Learner-facing prose only: tutor turns, item prompts, definitions. |

Pick a step; do not write a one-off `text-[nn]px`. The serif is a semantic signal — it means "this is the
material you are learning" — so it never appears in chrome.

## 3. Components

All in `@epistemics/ui`. The rules that matter:

- **`Button`** — pills, in `lg` / `md` / `sm`. `primary` is the filled accent one and a screen gets **one**;
  everything else is `secondary` (raised white pill) or `ghost`. `lg` is for the single call to action a
  focused screen ends on (Today's next step). `danger` is a red fill, not a red outline.
- **`IconButton`** — round, `ghost` by default (nothing but the glyph until hover), `raised` when it sits on
  a busy or coloured surface. An accessible name is mandatory.
- **`Card`** — an opaque white surface on the translucent pane, hairline plus `shadow-raised`; `nested` is the
  flat fill used inside another card.
- **`inputClass`** — filled, borderless, focus ring only. Every text input, textarea and select uses it.
- **`Switch`** (and `Toggle`, a thin wrapper) — `role="switch"`, accent when on. Only for settings that
  apply immediately.
- **`ChoiceGroup`** — one-of-N as rows with an accent check circle, for up to four options that each need a
  sentence of explanation; the chosen row can reveal its own fields through `detail`. More than four
  options, or no explanation needed, means a `select`.
- **`SegmentedGroup` / `Tabs` / `Stepper`** — a grey track with a raised white pill on the selected segment.
- **`navRowClass` / `ListRow`** — selection is `fill-strong`, hover is `fill`. No borders, ever.
- **`Dialog`** — window-grade radius and shadow over a blurred scrim.
- **`Banner` / `ErrorBanner` / `Pill` / `Stat` / `Meter` / `Progress`** — status tones only; bars stay neutral
  so the accent keeps meaning "act here".

Layout (`Page`, `Workspace`, `PanelSection`, `TopBar`): a centred column with a `reading` width of 680px for
prose, and a hairline-separated right panel from `lg` up.

## 4. Rules for new UI

1. Start from a component. If you are writing `className` with more than spacing and layout utilities, the
   thing you want probably belongs in `@epistemics/ui`.
2. One accent action per screen. If two things look equally important, one of them is not.
3. Selection is a fill. Emphasis is weight or size. Neither is a border.
4. A hairline separates regions. It does not outline controls.
5. Never add a shadow that is not one of the four tokens.
6. Space groups generously (20–32px); crowding is what makes an interface look cheap.
7. Status colour means status. Nothing is coloured to be pretty.
8. Everything focusable shows the focus ring, every icon-only control has a name, and every animation
   respects `prefers-reduced-motion`.
9. Dark mode is not an afterthought: both themes are defined on the same tokens, so check a screen in both.

## 5. Checking a change

```bash
pnpm --filter @epistemics/web build
pnpm --filter @epistemics/web e2e     # Playwright, Chromium
```

The e2e suite drives the real screens, so a layout that breaks a flow fails there. For a visual check, run
`pnpm dev` and look at Today, a lesson (three panes), Settings (choices and fields) and the Shelf in both
themes — those four cover every component in this document.
