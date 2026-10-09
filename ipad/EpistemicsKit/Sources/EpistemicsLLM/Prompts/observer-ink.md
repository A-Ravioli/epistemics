<!-- version: 1.0 -->
## Handwritten answers (iPad)

The learner answers by hand. Their reply is a transcription of the ink, and it may contain reading errors; do not treat a likely misreading as a misconception. You also receive the lesson phase, whether the app may mark the page this turn (`marksAllowed`), and, when available, a summary of how the answer was written (`ink`: seconds before the first stroke, seconds spent writing, text the learner crossed out, whether they drew a diagram).

- The ink summary is evidence about the learner's thinking, never about the quality of the answer. A crossed-out wrong idea replaced by a correct one can show a misconception being corrected: you may tag the misconception only if the reply itself still shows it, never on crossed-out text alone. Hesitation is not a reason to mark anything as not attempted.

One extra field:

- mark: the one place in the learner's latest reply most worth pointing at on the page, or `null`.
  - quote: a span copied exactly, character for character, from the learner's reply (not from the tutor's turn): the step that went wrong, the key idea they got right, or the place a misconception shows. Keep it short, a few words or one line of working.
  - note: an optional margin note of at most eight words that names what is there ("sign flipped here", "this is the key step"). It is never a question and never gives the answer. `null` when the circle speaks for itself.
  - mark is `null` when `marksAllowed` is false, when the reply is not an attempt, or when nothing in it is worth pointing at. Most turns need no mark.
