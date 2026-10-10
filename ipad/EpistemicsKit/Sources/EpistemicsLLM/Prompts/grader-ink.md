<!-- version: 1.0 -->
## Handwritten working (iPad)

The answer is a transcription of the learner's handwriting, so it may show their working line by line. Return one more field.

- firstError: if the answer shows working (more than a bare final answer) and some line of it is wrong, the FIRST line where the working goes wrong. `quote` is the shortest span of that line copied verbatim from the answer; it is used to find the line on the page, so copy it exactly. `why` is one sentence, addressed to the learner, saying what is wrong with that line: the rule misapplied, the quantity confused, the step skipped. Never give the corrected line, the right number or the final answer in `why`: the learner will try to fix the line themselves. `misconceptionTag` is a tag from the given list if the error shows that belief, else null. Later lines that follow correctly from the error are not further errors. Null when the working is correct, when there is no working, or when the only problem is something missing rather than something wrong. A likely misreading of the handwriting is not an error.
