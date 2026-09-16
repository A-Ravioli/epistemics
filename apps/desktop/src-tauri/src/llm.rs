//! `llm_fetch`: the only network path from the webview to an LLM API.
//!
//! JS (`packages/platform/src/tauri.ts`) invokes `llm_fetch` with
//! `{ url, method, headers, body: number[] | null, channel, requestId }`; Rust validates the
//! request against `policy`, attaches the Anthropic key from the keychain, performs the call with
//! `reqwest`, and streams the response back over the channel as:
//!
//! 1. `{ "status": u16, "headers": { name: value } }`
//! 2. zero or more raw byte chunks, each serialised as a JSON array of bytes (`Vec<u8>`)
//! 3. `{ "done": true }`
//!
//! `llm_fetch_abort { requestId }` cancels an in-flight request (JS calls it from `AbortSignal`
//! and `ReadableStream.cancel`); the pending `llm_fetch` then rejects with `"llm_fetch: aborted"`.
//! Aborting an unknown or finished request is a no-op.
//!
//! Policy violations, keychain failures and transport errors reject the `invoke` promise with a
//! string; once the `Start` message has been sent, a mid-stream failure is reported by the
//! rejected promise as well, so JS should treat a rejection after `Start` as a truncated body.

use std::collections::HashMap;
use std::sync::Mutex;

use futures_util::future::{AbortHandle, Abortable};
use futures_util::StreamExt;
use tauri::ipc::Channel;
use tauri::State;

use crate::policy::{self, ANTHROPIC_KEY_NAME};
use crate::secrets;
pub use crate::wire::LlmChunk;

/// Shared HTTP client (connection pool, TLS config) built once at startup, plus the abort
/// handles of in-flight requests keyed by the JS-generated `requestId`.
pub struct HttpState {
    client: reqwest::Client,
    inflight: Mutex<HashMap<String, AbortHandle>>,
}

impl HttpState {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("epistemics-desktop/", env!("CARGO_PKG_VERSION")))
            // No overall timeout: a long generation can legitimately stream for minutes.
            // Connection establishment is bounded so a dead host fails fast.
            .connect_timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("reqwest client");
        Self { client, inflight: Mutex::new(HashMap::new()) }
    }

    fn register(&self, request_id: &str) -> futures_util::future::AbortRegistration {
        let (handle, registration) = AbortHandle::new_pair();
        self.lock_inflight().insert(request_id.to_string(), handle);
        registration
    }

    fn finish(&self, request_id: &str) {
        self.lock_inflight().remove(request_id);
    }

    /// Returns whether a request with that id was still running.
    pub fn abort(&self, request_id: &str) -> bool {
        match self.lock_inflight().remove(request_id) {
            Some(handle) => {
                handle.abort();
                true
            }
            None => false,
        }
    }

    fn lock_inflight(&self) -> std::sync::MutexGuard<'_, HashMap<String, AbortHandle>> {
        // A poisoned lock only means another request panicked mid-insert; the map is still usable.
        self.inflight.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Default for HttpState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub async fn llm_fetch(
    state: State<'_, HttpState>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    request_id: String,
    channel: Channel<LlmChunk>,
) -> Result<(), String> {
    // Validate before registering so a rejected request never leaves an abort handle behind.
    let checked = policy::check_request(&url, &method, &headers).map_err(|e| e.to_string())?;

    let registration = state.register(&request_id);
    let result = Abortable::new(perform(&state.client, checked, body, &channel), registration).await;
    state.finish(&request_id);

    match result {
        Ok(outcome) => outcome,
        Err(_aborted) => Err("llm_fetch: aborted".to_string()),
    }
}

/// Cancel an in-flight `llm_fetch`. Safe to call for ids that never existed or already finished.
#[tauri::command]
pub fn llm_fetch_abort(state: State<'_, HttpState>, request_id: String) -> bool {
    state.abort(&request_id)
}

async fn perform(
    client: &reqwest::Client,
    checked: policy::CheckedRequest,
    body: Option<Vec<u8>>,
    channel: &Channel<LlmChunk>,
) -> Result<(), String> {
    let mut req =
        client.request(checked.method.parse::<reqwest::Method>().map_err(|e| e.to_string())?, checked.url.clone());
    for (k, v) in &checked.headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if checked.needs_anthropic_key {
        let key = tauri::async_runtime::spawn_blocking(|| secrets::get(ANTHROPIC_KEY_NAME))
            .await
            .map_err(|e| format!("keyring task failed: {e}"))??
            .ok_or_else(|| "no Anthropic API key in the keychain; add one in Settings".to_string())?;
        req = req.header("x-api-key", key);
    }
    if let Some(body) = body {
        req = req.body(body);
    }

    let resp = req.send().await.map_err(|e| format!("llm_fetch: request failed: {e}"))?;

    let status = resp.status().as_u16();
    let headers = policy::filter_response_headers(
        resp.headers().iter().filter_map(|(k, v)| v.to_str().ok().map(|v| (k.as_str(), v))),
    );
    channel.send(LlmChunk::Start { status, headers }).map_err(|e| format!("llm_fetch: channel closed: {e}"))?;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("llm_fetch: stream failed: {e}"))?;
        if bytes.is_empty() {
            continue;
        }
        channel.send(LlmChunk::Bytes(bytes.to_vec())).map_err(|e| format!("llm_fetch: channel closed: {e}"))?;
    }
    channel.send(LlmChunk::done()).map_err(|e| format!("llm_fetch: channel closed: {e}"))?;
    Ok(())
}
