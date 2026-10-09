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
        return MockProvider()
    }
}
