import Foundation

/// Conventions shared by the structured roles (observer, grader, leak check, warm-up, reader): the role's input
/// is sent as one fenced JSON block in the last user message, and the mock provider decodes the same block.
public enum RoleInput {
    /// A fenced ```json block, pretty-printed like the web's `JSON.stringify(input, null, 2)`.
    public static func encode(_ input: OrderedJSON) -> String {
        "```json\n" + input.prettySerialized() + "\n```"
    }

    /// The fenced JSON block of the last user message, decoded as `T`, if any.
    public static func decode<T: Decodable>(_ req: LlmRequest, as: T.Type = T.self) -> T? {
        guard let json = jsonText(req) else { return nil }
        return try? JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// The raw text inside the last user message's ```json fence.
    public static func jsonText(_ req: LlmRequest) -> String? {
        guard let last = req.messages.last(where: { $0.role == .user }) else { return nil }
        let r = try! NSRegularExpression(pattern: "```json\\s*([\\s\\S]*?)```")
        let s = last.content
        guard let m = r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              let range = Range(m.range(at: 1), in: s), !s[range].isEmpty else { return nil }
        return String(s[range])
    }

    /// Last message written by the learner (user role), or "".
    public static func lastUserText(_ req: LlmRequest) -> String {
        req.messages.last { $0.role == .user }?.content ?? ""
    }

    /// Last control message (system role inside messages), or "".
    public static func lastControlText(_ req: LlmRequest) -> String {
        req.messages.last { $0.role == .system }?.content ?? ""
    }
}
