//! Wire types shared with `packages/platform/src/tauri.ts`. Serde-only, so the JSON shapes can be
//! unit-tested without a webview.

use std::collections::HashMap;

use serde::Serialize;

/// One message on the `llm_fetch` channel. `untagged` gives the JS side exactly three shapes:
/// `{status, headers}`, a bare byte array, and `{done: true}`.
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum LlmChunk {
    Start { status: u16, headers: HashMap<String, String> },
    Bytes(Vec<u8>),
    Done { done: bool },
}

impl LlmChunk {
    pub fn done() -> Self {
        LlmChunk::Done { done: true }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_serialise_to_the_wire_shapes_js_expects() {
        let start = LlmChunk::Start {
            status: 200,
            headers: HashMap::from([("content-type".to_string(), "text/event-stream".to_string())]),
        };
        assert_eq!(
            serde_json::to_value(&start).unwrap(),
            serde_json::json!({ "status": 200, "headers": { "content-type": "text/event-stream" } })
        );
        assert_eq!(serde_json::to_value(LlmChunk::Bytes(vec![1, 2, 255])).unwrap(), serde_json::json!([1, 2, 255]));
        assert_eq!(serde_json::to_value(LlmChunk::done()).unwrap(), serde_json::json!({ "done": true }));
        // An empty chunk is still a valid (if pointless) array; the command skips them anyway.
        assert_eq!(serde_json::to_string(&LlmChunk::Bytes(vec![])).unwrap(), "[]");
    }
}
