# Design and UX audit: orientation, space, and the learning page

Status: October 10, 2026. Every main screen was rendered from the real views, with real app state, at five
sizes:

| Name | Size (points) |
|---|---|
| iPad Air 11 landscape | 1180 × 820 |
| iPad Air 11 portrait | 820 × 1180 |
| iPad Pro 13 landscape | 1376 × 1032 |
| iPad mini portrait | 744 × 1133 |
| Split View, half width | 590 × 820 |

The contact sheets are in [ux-audit/](ux-audit/). Dark mode, VoiceOver and Stage Manager windows were not
covered.

**Update, October 10, 2026:** the six bugs and the writing-page layout (§5, steps 1–3) are built; see §6.

## The short version

**The app has one layout.** Every screen is a single 760-point column, centred, at every size and in both
orientations. Nothing reads the size class or the orientation.
- **Portrait on an 11-inch iPad:** this is close to right; the column is a sheet of paper.
- **Landscape and on the 13-inch iPad:** half the screen is empty margin, and the question scrolls away
  while the learner writes the answer.
- **Split View:** the layout breaks.

**Four things are actually broken:**

1. **In a lesson, the pen tray and Hand in scroll off the screen.** They sit at the top of the scrolling
   page, and the page auto-scrolls to the newest turn. A few turns in, the learner has to scroll back up to
   find Hand in. This happens at every size; see [lesson-mid-bottom.png](ux-audit/lesson-mid-bottom.png).
   The flow tests call `handIn()` directly, which is why they never caught it.
2. **The warm-up's "Done writing" is below the fold** on an 11-inch iPad in landscape
   ([warmup.png](ux-audit/warmup.png)).
3. **The confidence buttons break mid-word in Split View** ("Guess / ing", "Certai / n").
4. **On iPad mini in portrait, the sidebar opens over a dimmed Today** on launch
   ([root-today.png](ux-audit/root-today.png)).

**The opportunity is to treat the two orientations as two different objects:**
- **Portrait is a notebook page:** one column, the paper full width.
- **Landscape is an open notebook, two pages:** the material on the left, your paper on the right, and
  the question never leaves the screen.

That is not cosmetic. Keeping the question and the work in view together is one of the more reliable
findings in instructional design (§3). In landscape today, the learner scrolls the question away to write.

---

## 1. Bugs to fix first

| # | Where | What happens | Fix |
|---|---|---|---|
| B1 | Lesson (`LessonView`) | The tool tray and the Hand in circle live inside the `ScrollView` (`FreeHandLayout` is in the scrolled content), so the auto-scroll to the newest turn takes them off screen | Pin the free-hand rail outside the scroll view, as reviews pin the confidence row. Add a test that finds Hand in after five turns |
| B2 | Warm-up, and any page whose paper is taller than the screen | The primary action sits under the paper, so it is below the fold in landscape | The same pinned rail: Done writing / Hand in sits in the free-hand margin, always visible |
| B3 | `ConfidenceHandIn` at compact width | Labels wrap mid-word; "I don't know" wraps to two lines | At compact width, stack the three buttons vertically in the free-hand margin, or show *"How sure?"* as a second row |
| B4 | `RootView` on iPad mini portrait | `.balanced` with `.doubleColumn` becomes an overlay that covers the detail on arrival | Start `.detailOnly` below about 1000 points of width; the sidebar button brings it back |
| B5 | Map from memory | On the 11-inch the canvas runs to the screen edge; on the 13-inch it stops at a fixed width with a wide empty margin ([map.png](ux-audit/map.png)) | The one session that should use the whole screen: full bleed at every size, pan and zoom with two fingers |
| B6 | `predict` items | They get a one-line box, but the pack's predict prompts ask for working (*"Say which and by how much, then check by counting"*) | Give predict items ruled paper, or let the pack's `ink` hint set it, and add a pack lint: a prompt that asks for working cannot get a short box |

Also seen, and lower priority:
- **Pencil double-tap is unhandled.** Squeeze (Pencil Pro) switches pen and eraser; a second-generation
  Pencil's double-tap does nothing. Add `.onPencilDoubleTap` with the same behaviour.
- **Many important lines are 12–13 pt muted grey.** These include "Read as … Not what you wrote?", which is
  how misreadings get caught before grading, "Nothing on this page holds the answer", and the hand-in
  prompt. An iPad on a desk is read from further away than a phone; 15 pt is a better floor.

---

## 2. What each orientation is for

How people actually hold an iPad to write:
- **Portrait**, in the lap or on a desk like a sheet of paper. This is the natural writing orientation.
- **Landscape**, on a stand or keyboard case, or flat on a desk with the Pencil.

Both happen, often in the same week, so the app has to be good in both.

### Portrait: the notebook page

**What works today:** at 820 points, the 760-point column fills the width; this is the layout the app was
designed in.

**Still worth changing:**
- **Collapse the sidebar by default in portrait.** At 820 points, a permanent 300-point sidebar takes 37% of
  the width from Today and the library screens.
- **Give the paper the rest of the page.** A worked problem's squared paper starts at 8 small squares, about
  200 points, then 400–600 points of empty page sit between it and the hand-in row
  ([review-apply-answer.png](ux-audit/review-apply-answer.png)). Start the paper at the remaining visible
  height. The design's *"the paper says what kind of answer is expected"* can stay: ruled paper still
  starts at three lines. Squared and dotted paper, the two kinds for working, should start big.
- **Stack the receipt in portrait.** It is two columns today, so the learner's own ink is shown at half size
  and the blue marks land on a miniature of what they wrote. Show their page at full width and 1:1 scale
  with its marks, then the verdict and criteria below it.

### Landscape: the open notebook

This is the big change. At 1180 × 820 (11-inch) and 1376 × 1032 (13-inch), a single column wastes 420–616
points of width, and the page is short. A long prompt plus the paper does not fit, so the prompt scrolls
away as the paper grows.

| Session | Left page (material) | Right page (yours) |
|---|---|---|
| Review, placement, progress check | The prompt, pinned. It never scrolls | The paper, full height |
| Review receipt | Verdict, criteria, feedback, *"Your working goes wrong here"*, the answer when shown | Your page at 1:1 with its marks; the fix-it rewrite under it |
| Lesson, assisted phases (PROBE, DEVELOP, CONSOLIDATE, EXTEND) | The dialogue so far, plus the concept card and the worked example, which today hide behind a modal "Concept" button | The current paper |
| Lesson, unaided phases (PRIME, CHECK) | Only the question. The rest stays folded, as now | The paper |
| Checkpoint | The paper metaphor works as is ([checkpoint.png](ux-audit/checkpoint.png)). On the 13-inch, put the question rail and the confidence tags beside the sheet | The sheet |
| Teach-back | The student's questions, as a chat column | Your whiteboard |
| Warm-up, map from memory | None: the whole screen is paper | |

The free-hand rail (tools, Hand in, the confidence buttons) sits on the outside edge of the free hand's page:
the left edge for a right-hander, the right edge for a left-hander. It never scrolls.

### Split View and Slide Over (compact width)

Split View and Slide Over are a real use: a lecture video or PDF on one side, Epistemics on the other. At
compact width:
- one column, as in portrait;
- the free-hand rail becomes a bottom bar;
- the confidence buttons stack (B3);
- the receipt is stacked.

There is one rule worth keeping: **the notebook stays shut and the page above stays folded during
retrievals**, even when another app is on screen. The app can't control the other app, so the honest
version is a one-line note at the first unaided question in a session with a second app open: *"Answer
from memory: the other window is yours to close."*

### Rotation must not move the ink

PencilKit strokes are stored in absolute points on a paper that is 760 points wide (`Theme.readingWidth`).
The marks, the reading's line positions and the recogniser search all depend on those coordinates. So the
paper must not reflow when the device rotates:
- **The paper's logical width stays fixed (760 points),** like a real sheet.
- **The view scales it to fit** the right page in landscape, or the screen width in portrait.

In practice:
- **Landscape on an 11-inch:** the right page is about 650 points wide, so the paper renders at about 0.85
  scale and the Pencil writes at that scale, which PencilKit handles natively with a zoomed canvas.
- **On the 13-inch:** the paper renders at 1:1 with margin to spare.

This is the one technical constraint the redesign must respect. The alternative, changing the paper's width
with orientation, would break every stored mark.

---

## 3. Making the page as effective as it can be

Ranked by how strong the evidence is that layout changes learning, not just comfort.

1. **Keep the question and the work in view together.** Making learners hold one source in mind while
   working on another (split attention) costs learning. In Ginns's 2006 meta-analysis of the spatial
   contiguity effect, integrating the sources had a large effect (d ≈ 0.7). Today, in landscape, a long
   prompt scrolls off as soon as the paper grows. The open-notebook layout fixes this directly, and in
   portrait the prompt can stay pinned above the paper while it scrolls.
2. **Put the worked example next to the practice in assisted phases.** Studying an example and then solving
   a similar problem beats solving problems alone for novices (Sweller & Cooper 1985; Renkl's
   example-problem pairs), and fading the example step by step helps further (Atkinson, Renkl & Merrill
   2003). DEVELOP already has a worked example and a hint ladder, but they arrive as tutor text or behind
   the "Concept" sheet. In landscape, the example belongs on the left page, with the steps the learner has
   not yet earned folded away. This is the faded-example item, #6 in [AUDIT.md](AUDIT.md), given a place
   on the page.
3. **Never make the learner hunt for a control while holding an answer in their head.** B1 and B2 are bugs,
   but they are also a learning cost: working memory spent finding Hand in is not spent on the problem.
   - The free-hand rail has a fixed position: always the same place, always visible, never under the
     writing hand.
   - Once the learner has written something, Hand in should also be reachable from the Pencil: a squeeze
     on Pencil Pro could open the confidence buttons beside the pen tip. This needs a test, because an
     accidental hand-in is worse than a reach.
4. **Show feedback at the place and the scale of the error.** The first-wrong-line mark (AUDIT #1) works only
   if the learner sees their own line, at the size they wrote it, with the mark on it. That is why the
   receipt should show the page at 1:1 (§2), not as a half-size thumbnail.
5. **Use the space for the work, not for decoration.** Empty space is not the problem; empty space *instead
   of paper* is. Interesting but irrelevant additions measurably hurt learning (the seductive details
   effect; Rey 2012, about g = −0.3), and progress dashboards don't raise achievement (Kaliisa et al.
   2024). So the extra landscape width goes to the material and the paper, never to a stats panel during
   a session. Today and the library screens can show more (§4), because no retrieval happens there.
6. **Let the learner read their own transcription.** The "Read as" line is how misreadings get caught
   before grading. It is 12-point grey under each answer. Make it 15 points, give it a clear target, and
   highlight the uncertain spans the Reader already reports, so the learner's eye goes straight to them.

---

## 4. Screen by screen

**Today** ([root-today.png](ux-audit/root-today.png)). All the content is in the top third, at every size.
- **Make the next step the page.** One large sentence and the button, vertically centred in the space,
  followed by the rest of the day as a short sequence with times: *warm-up 3 min → 18 reviews, about 21
  min → lesson: Counting*. A visible plan for the session is cheap and honest, unlike a dashboard.
- **In landscape, add the week as a quiet second column:** what comes back tomorrow, the streak line, the
  next checkpoint.

**Course map** ([root-map.png](ux-audit/root-map.png)). It is a text list, and it says *"0% · 0 of 3
spaced successes"* forty times.
- **It should be a map:** the prerequisite graph the app already has, drawn left to right with the units
  as regions and each concept's state in its label (new, learning, secure, mastered, placed out).
- **Landscape is where this pays off.** Tapping a concept shows its lessons, its items and its last
  attempts.
- **The learner's own map from memory** for the unit could be overlaid as a ghost, for comparison.

**Progress.** Six numbers in the top quarter of the page.
- **Show the calibration as a picture:** confidence against how often you were right, one dot per bucket.
- **Show one item over time:** your attempts at the same skill across weeks. Handwriting makes this
  possible and typing apps can't do it; the notebook already holds every page.

**Notebook.** Full-width page snapshots in one long scroll.
- **In landscape, lay it out as a spread:** two pages side by side.
- **Group by concept as well as by date,** so *"how my answers to this have changed"* is one tap away.
- **Keep it shut during retrievals,** as now.

**Review answer page.** Covered in §2: the paper fills the height, the prompt is pinned, and the
confidence row sits in the free-hand margin next to the paper, not 600 points below it.

**Lesson.**
- **Fix B1.**
- **In landscape,** the open notebook with the concept card and worked example on the left during
  assisted phases.
- **In portrait,** keep the single column, but put the concept card in a pull-down above the current turn
  instead of a modal sheet, so the learner can look at it and write without dismissing anything.

**Checkpoint.** The best-designed screen. It reads as an exam paper on a desk, with numbered questions,
a question rail and one *Hand in the paper*. On the 13-inch, widen the sheet a little and keep the rail.

**Map from memory.** Fix B5. Full bleed and pan and zoom; the prompt is a single line in the header.

**First run and placement.** Fine in portrait. In landscape, the placement should use the same
open-notebook layout as a review, since it is the first impression of how answering works.

---

## 5. Suggested order

1. **The bugs, B1–B6.** Small, and B1 blocks real use of lessons.
2. **One layout primitive, `WritingPage`,** that every answering screen uses. It takes the material, the
   paper and the free-hand rail, and lays them out three ways:
   - **portrait:** a column, with the prompt pinned while the paper scrolls;
   - **landscape:** a spread;
   - **compact width:** a column with a bottom rail.

   The paper keeps its fixed logical width and scales to fit (§2). Reviews, placement, progress checks,
   the fix-it receipt and lessons move onto it in that order.
3. **The receipt at 1:1,** stacked in portrait and a spread in landscape.
4. **The worked example on the left page** in assisted lesson phases, with fading. This combines with AUDIT
   #6.
5. **Today as a plan of the day, and the course map as a map.**
6. **Type floor at 15 points, and Pencil double-tap.**

---

## 6. Built

- **`WritingPage`** (`Epistemics/Design/WritingPage.swift`) is the page every answering screen uses: reviews,
  placement, progress checks, the warm-up, lessons and teach-back. It picks its layout from the window
  (`WritingLayout.choose`): a column in portrait, a spread at 1000 points or wider in landscape, and a column
  with a bottom bar at compact width.
  - **The rail** (tools and hand-in) is never inside a scroll view (B1, B2).
  - **In a column,** single-question pages pin the prompt above the paper.
  - **In a spread,** the material sits on the free hand's page and the paper on the writing hand's page.
    For a right-hander that is rail | material | paper; for a left-hander, paper | material | rail.
- **Fixed-width paper.** `InkArea` keeps a fixed logical width (760 points; the map's sheet is its own
  width). It draws the paper and the marks scaled to fit, and zooms the PencilKit canvas by the same factor,
  so strokes stay in paper coordinates across rotation and Split View. Squared and dotted paper start as
  tall as the page offers.
- **Rail controls lay themselves out for the rail.**
  - `ConfidenceHandIn` stacks full-width buttons in the side rail and never wraps a label (B3).
  - `HandInButton` is a circle in the side rail and a pill in the bottom bar.
  - The tool tray is a row in the bottom bar. Pencil double-tap now switches pen and eraser, as squeeze does.
- **The receipt** is a spread in landscape and stacked otherwise, so your page shows at full size.
- **The sidebar** is open only when the window is at least 1000 points wide, otherwise behind its button
  (B4). The width decides at render time; a learner's own toggle holds until the window crosses that width.
- **The map from memory** fills the window at every size (B5).
- **Prediction items** get ruled paper (B6), and `LayoutTests` lints the pack so no question that asks for
  working gets a one-line box.
- **Checked in the simulator:** with the paper zoomed to about 0.85 in portrait, strokes land exactly under the
  touch. The "after" contact sheets are in `ux-audit/after-*.png`.
- **`LayoutTests`** hosts the real views at four iPad sizes. It checks that the hand-in control and the tools
  are still on screen after a lesson dialogue scrolls to its end, and that the warm-up's Done writing is on
  screen in every orientation. Debug builds report the rail controls' frames for this (`LayoutProbe`).

**The concept card and the worked example, October 11, 2026** (§5 step 4). The modal "Concept" sheet is
gone.
- **Where the card goes:** while help is allowed (DEVELOP, EXTEND and remediation), the concept card and
  the worked example sit on the page through `WritingPage`'s reference slot:
  - **landscape:** at the top of the material page, above the dialogue, up to 65% of its height;
  - **portrait and Split View:** a pull-down panel above the page, up to half the height. It opens by
    default when there is an example to study or steps to finish.

  The learner can read the card and write at the same time.
- **When it's put away:** PRIME, PROBE and CHECK, where the learner answers alone, and CONSOLIDATE, where
  the card would hand them the words.
- **The tutor** is told the example is on the learner's page, so it points to steps by number instead of
  reading them out.
- **Fading** follows AUDIT #6.
- Screenshots: `ux-audit/after-concept-card.png` and `after-worked-example-compared.png`.

What should be measured when this ships, because the layout is a hypothesis:
- time from prompt to first stroke;
- how often learners scroll during an answer;
- how often "Read as" is corrected;
- unaided pass rates by orientation.

The app already logs time to first stroke and writing time in `InkRecord` (`firstStrokeMs`, `writingMs`);
scrolling is not logged yet.
