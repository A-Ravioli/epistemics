import Testing
@testable import Epistemics

@Suite struct MathTextTests {
    @Test func rendersThePacksCommonForms() {
        #expect(MathText.latexToUnicode(#"3 \times 4 \times 2 = 24"#) == "3 × 4 × 2 = 24")
        #expect(MathText.latexToUnicode(#"26^2 \times 10^3"#) == "26² × 10³")
        #expect(MathText.latexToUnicode(#"P(A \mid B)"#) == "P(A | B)")
        #expect(MathText.latexToUnicode(#"\frac{5}{8}"#) == "5/8")
        #expect(MathText.latexToUnicode(#"\frac{n!}{(n-r)!}"#) == "(n!)/((n−r)!)")
        #expect(MathText.latexToUnicode(#"\binom{10}{3}"#) == "C(10, 3)")
        #expect(MathText.latexToUnicode(#"A \cap B"#) == "A ∩ B")
        #expect(MathText.latexToUnicode(#"\text{Var}(X)"#) == "Var(X)")
        #expect(MathText.latexToUnicode(#"n_1 n_2 \cdots n_k"#) == "n₁ n₂ ⋯ nₖ")
        #expect(MathText.latexToUnicode(#"\sqrt{2}"#) == "√2")
    }

    @Test func keepsProseAndConvertsOnlyMath() {
        let s = MathText.convertMath(in: "There are $3 \\times 4 = 12$ outfits, *not* 7.")
        #expect(s == "There are 3 × 4 = 12 outfits, *not* 7.")
    }

    @Test func leavesUnknownCommandsVisible() {
        #expect(MathText.latexToUnicode(#"\weird{x}"#).contains("\\weird"))
    }
}
