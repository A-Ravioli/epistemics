import Foundation
import EpistemicsCore
import EpistemicsLLM

extension AppModel {
    /// The LLM provider for the chosen tutor (ONBOARDING §3). Usage is written to `llm_calls` for the cost line.
    func makeProvider() -> any LLMProvider {
        let store = self.store
        let sink: UsageSink = { call in
            Task {
                try? await store.logLLMCall(id: uuidv7(call.at == 0 ? AppModel.now() : call.at), role: call.role.rawValue, model: call.usage.model,
                                            costUsd: call.usage.costUsd, at: call.at == 0 ? AppModel.now() : call.at,
                                            details: ["inputTokens": .number(Double(call.usage.inputTokens)),
                                                      "outputTokens": .number(Double(call.usage.outputTokens)),
                                                      "cacheRead": .number(Double(call.usage.cacheRead)),
                                                      "latencyMs": .number(Double(call.usage.latencyMs))])
            }
        }
        switch settings.tutorMode {
        case .claudeKey:
            if let key = Secrets.get(Secrets.anthropicKey), !key.isEmpty {
                return AnthropicProvider(options: .init(apiKey: key, onUsage: sink))
            }
        case .proxy:
            if let url = URL(string: settings.proxyURL), url.scheme?.hasPrefix("http") == true {
                return AnthropicProvider(options: .init(apiKey: nil, baseURL: url, onUsage: sink))
            }
        case .demo:
            break
        }
        #if DEBUG
        if DeveloperDemo.previewsFixIt { return DeveloperDemo.fixItPreviewProvider() }
        #endif
        return MockProvider()
    }
}

#if DEBUG
/// Settings → Developer: the demo tutor can't check working, so it never finds a first wrong line and
/// "Fix it from here" never appears. This switch makes its grader treat the first line of a wrong answer as
/// the wrong step, labelled as a preview, so the flow can be seen without an API key.
enum DeveloperDemo {
    static var previewsFixIt: Bool {
        get { UserDefaults.standard.bool(forKey: "developerPreviewsFixIt") }
        set { UserDefaults.standard.set(newValue, forKey: "developerPreviewsFixIt") }
    }

    static func fixItPreviewProvider() -> MockProvider {
        MockProvider(.init(respond: { req in
            guard req.role == .grader, let content = req.messages.first?.content,
                  let json = try? JSONSerialization.jsonObject(with: Data(content.utf8)) as? [String: Any],
                  json["dump"] == nil, let answer = json["answer"] as? String else { return nil }
            let rubric = (json["rubric"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String }
            var g = MockHeuristics.grade(answer: answer, reference: json["reference"] as? String ?? "", rubricIds: rubric)
            let first = answer.split(whereSeparator: \.isNewline).first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? ""
            if g.score < 0.75, !first.isEmpty {
                g.firstError = StepError(quote: first, why: "Developer preview: the demo grader can't really check working, so it marks your first line.")
            }
            return .value(g)
        }))
    }
}
#endif
