import Foundation
import EpistemicsCore

/// The state machine's instruction for one teach-back student turn.
public struct StudentTurnControl: Sendable, Hashable {
    /// Pose one plausible wrong belief this turn (once per session).
    public var poseWrongBelief: Bool
    /// The belief to pose, typically a Misconception.description.
    public var wrongBelief: String?
    /// Ask the learner for a concrete example this turn.
    public var askForExample: Bool
    /// Default 80.
    public var maxWords: Int
    /// Extra instruction ("wrap up: thank them and ask one last check question").
    public var instruction: String?
    public var turn: Int?

    public init(poseWrongBelief: Bool = false, wrongBelief: String? = nil, askForExample: Bool = false, maxWords: Int = 80,
                instruction: String? = nil, turn: Int? = nil) {
        self.poseWrongBelief = poseWrongBelief; self.wrongBelief = wrongBelief; self.askForExample = askForExample
        self.maxWords = maxWords; self.instruction = instruction; self.turn = turn
    }
}

public struct StudentObjective: Sendable, Hashable {
    public var id: String
    public var text: String
    public init(id: String, text: String) { self.id = id; self.text = text }
}

public struct StudentInput: Sendable, Hashable {
    public var conceptName: String
    public var definition: String
    /// What a complete explanation would cover (used to pick questions, never said).
    public var objectives: [StudentObjective]
    /// learner = user, student = assistant.
    public var transcript: [ChatMessage]
    public var control: StudentTurnControl
    public var model: String?
    public var effort: Effort?
    public var maxTokens: Int?
    public var metadata: RequestMetadata?

    public init(conceptName: String, definition: String, objectives: [StudentObjective] = [], transcript: [ChatMessage],
                control: StudentTurnControl = StudentTurnControl(), model: String? = nil, effort: Effort? = nil,
                maxTokens: Int? = nil, metadata: RequestMetadata? = nil) {
        self.conceptName = conceptName; self.definition = definition
        self.objectives = objectives
        self.transcript = transcript; self.control = control; self.model = model; self.effort = effort
        self.maxTokens = maxTokens; self.metadata = metadata
    }
}

/// Teach-back student (port of roles/student.ts, DESIGN §3.6): a curious, slightly confused pupil who has read
/// nothing. One question per turn, ≤ 80 words, poses one wrong belief when the state machine says so.
public enum Student {
    public static func renderControl(_ c: StudentTurnControl) -> String {
        var kv: [String] = []
        if let turn = c.turn { kv.append("turn=\(turn)") }
        kv += ["max_words=\(c.maxWords)", "pose_wrong_belief=\(c.poseWrongBelief ? "yes" : "no")", "ask_for_example=\(c.askForExample ? "yes" : "no")"]
        var lines = [kv.joined(separator: " ")]
        if c.poseWrongBelief {
            if let b = c.wrongBelief, !b.isEmpty {
                lines.append("State this wrong belief as something you think, then ask whether it is right: \"\(b.trimmingCharacters(in: .whitespacesAndNewlines))\"")
            } else {
                lines.append("State one plausible wrong belief about the concept as something you think, then ask whether it is right.")
            }
        }
        if c.askForExample { lines.append("Ask for a concrete example, or ask them to walk through one.") }
        if let i = c.instruction, !i.isEmpty { lines.append(i.trimmingCharacters(in: .whitespacesAndNewlines)) }
        lines.append("Exactly one question. At most \(c.maxWords) words. Do not explain or correct.")
        return lines.joined(separator: "\n")
    }

    /// The student never sees reference material: only the concept's name and a one-line definition to stay on topic.
    static func conceptNote(_ input: StudentInput) -> String {
        let trim = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        var lines = ["Topic the learner will teach you: \(trim(input.conceptName))."]
        lines.append("(For staying on topic only, never to be repeated to the learner: \(trim(input.definition)))")
        if !input.objectives.isEmpty {
            lines.append("What a complete explanation would cover (use it to pick what to ask about, not to say):")
            for o in input.objectives { lines.append("- \(o.id): \(trim(o.text))") }
        }
        return lines.joined(separator: "\n")
    }

    public static func buildRequest(_ input: StudentInput) -> LlmRequest {
        let name = input.conceptName.trimmingCharacters(in: .whitespacesAndNewlines)
        var messages: [ChatMessage] = [.user("[session] The learner will now teach you about \"\(name)\". Wait for them, then ask your questions.", cache: true)]
        messages += input.transcript.map { ChatMessage(role: $0.role, content: $0.content, images: $0.images) }
        messages.append(.system(renderControl(input.control)))
        return LlmRequest(role: .student, model: input.model,
                          system: [CacheableBlock(Prompts.student, cache: true), CacheableBlock(conceptNote(input), cache: true)],
                          messages: messages, maxTokens: input.maxTokens, effort: input.effort ?? .low, metadata: input.metadata)
    }
}
