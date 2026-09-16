//! Pure, dependency-light rules for the desktop shell: which hosts `llm_fetch` may reach,
//! which headers cross the JS/Rust boundary, and how keychain entries are named.
//! Everything here is unit-tested without Tauri or a webview.

use std::collections::HashMap;
use url::Url;

/// Service name under which every credential is stored in the OS keychain.
pub const KEYRING_SERVICE: &str = "dev.epistemics.app";

/// Keychain entry that `llm_fetch` injects as `x-api-key` for Anthropic requests.
pub const ANTHROPIC_KEY_NAME: &str = "anthropic_api_key";

/// Hosts the webview may ask `llm_fetch` to contact. Anything else is refused before any I/O.
pub const ALLOWED_HOSTS: &[&str] = &["api.anthropic.com", "localhost", "127.0.0.1"];

/// Request headers copied from the JS side to the upstream. Everything else is dropped, so a
/// compromised webview cannot smuggle its own credentials, cookies or host overrides.
pub const FORWARDED_REQUEST_HEADERS: &[&str] = &["anthropic-version", "anthropic-beta", "content-type", "accept"];

/// Response headers never echoed back: the body arrives already decoded and re-chunked.
const DROPPED_RESPONSE_HEADERS: &[&str] =
    &["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyError {
    InvalidUrl(String),
    HostNotAllowed(String),
    SchemeNotAllowed { host: String, scheme: String },
    InvalidMethod(String),
    InvalidSecretKey(String),
}

impl std::fmt::Display for PolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PolicyError::InvalidUrl(u) => write!(f, "llm_fetch: invalid url {u:?}"),
            PolicyError::HostNotAllowed(h) => write!(f, "llm_fetch: host {h:?} is not in the allowlist"),
            PolicyError::SchemeNotAllowed { host, scheme } => {
                write!(f, "llm_fetch: scheme {scheme:?} is not allowed for host {host:?}")
            }
            PolicyError::InvalidMethod(m) => write!(f, "llm_fetch: invalid method {m:?}"),
            PolicyError::InvalidSecretKey(k) => write!(f, "secrets: invalid key {k:?}"),
        }
    }
}

impl std::error::Error for PolicyError {}

/// A request the policy has accepted. Only this type can reach the HTTP client.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckedRequest {
    pub url: Url,
    pub method: String,
    /// Lower-cased header names, already filtered.
    pub headers: Vec<(String, String)>,
    /// Whether the Anthropic key from the keychain must be attached.
    pub needs_anthropic_key: bool,
}

pub fn is_loopback(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1")
}

/// Parse and validate a URL against the allowlist. Remote hosts must use https; loopback may use http.
pub fn check_url(raw: &str) -> Result<Url, PolicyError> {
    let url = Url::parse(raw).map_err(|_| PolicyError::InvalidUrl(raw.to_string()))?;
    let host = url.host_str().ok_or_else(|| PolicyError::InvalidUrl(raw.to_string()))?.to_ascii_lowercase();
    if !ALLOWED_HOSTS.contains(&host.as_str()) {
        return Err(PolicyError::HostNotAllowed(host));
    }
    if url.username() != "" || url.password().is_some() {
        return Err(PolicyError::InvalidUrl(raw.to_string()));
    }
    let scheme = url.scheme();
    let ok = match scheme {
        "https" => true,
        "http" => is_loopback(&host),
        _ => false,
    };
    if !ok {
        return Err(PolicyError::SchemeNotAllowed { host, scheme: scheme.to_string() });
    }
    Ok(url)
}

pub fn check_method(method: &str) -> Result<String, PolicyError> {
    let m = method.trim().to_ascii_uppercase();
    match m.as_str() {
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" => Ok(m),
        _ => Err(PolicyError::InvalidMethod(method.to_string())),
    }
}

/// Keep only the forwardable request headers. `x-api-key` and `authorization` are always removed,
/// whatever their case; the key is re-attached from the keychain by the caller when appropriate.
pub fn filter_request_headers(headers: &HashMap<String, String>) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = headers
        .iter()
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.clone()))
        .filter(|(k, _)| FORWARDED_REQUEST_HEADERS.contains(&k.as_str()))
        .collect();
    out.sort();
    out
}

/// Response headers the webview is allowed to see.
pub fn filter_response_headers<'a, I>(headers: I) -> HashMap<String, String>
where
    I: IntoIterator<Item = (&'a str, &'a str)>,
{
    headers
        .into_iter()
        .map(|(k, v)| (k.to_ascii_lowercase(), v.to_string()))
        .filter(|(k, _)| !DROPPED_RESPONSE_HEADERS.contains(&k.as_str()))
        .collect()
}

/// Run every request-side rule and produce a request the HTTP layer may execute.
pub fn check_request(
    url: &str,
    method: &str,
    headers: &HashMap<String, String>,
) -> Result<CheckedRequest, PolicyError> {
    let url = check_url(url)?;
    let method = check_method(method)?;
    let needs_anthropic_key = url.host_str().map(|h| h.eq_ignore_ascii_case("api.anthropic.com")).unwrap_or(false);
    Ok(CheckedRequest { url, method, headers: filter_request_headers(headers), needs_anthropic_key })
}

/// Keychain entries are `(KEYRING_SERVICE, key)`. Keys are restricted to a small charset so a
/// key can never collide with another application's entries or contain control characters.
pub fn keyring_entry_name(key: &str) -> Result<&str, PolicyError> {
    let valid = !key.is_empty()
        && key.len() <= 64
        && key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.'));
    if valid {
        Ok(key)
    } else {
        Err(PolicyError::InvalidSecretKey(key.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn allows_anthropic_over_https_only() {
        assert!(check_url("https://api.anthropic.com/v1/messages").is_ok());
        assert_eq!(
            check_url("http://api.anthropic.com/v1/messages"),
            Err(PolicyError::SchemeNotAllowed { host: "api.anthropic.com".into(), scheme: "http".into() })
        );
        assert!(check_url("HTTPS://API.ANTHROPIC.COM/v1/messages").is_ok());
    }

    #[test]
    fn allows_loopback_over_http_for_local_models() {
        assert!(check_url("http://localhost:11434/api/chat").is_ok());
        assert!(check_url("http://127.0.0.1:8080/v1/chat/completions").is_ok());
        assert!(check_url("https://localhost:8443/").is_ok());
    }

    #[test]
    fn rejects_everything_else() {
        assert_eq!(check_url("https://evil.example.com/"), Err(PolicyError::HostNotAllowed("evil.example.com".into())));
        assert_eq!(
            check_url("https://api.anthropic.com.evil.example/"),
            Err(PolicyError::HostNotAllowed("api.anthropic.com.evil.example".into()))
        );
        assert!(matches!(check_url("ftp://localhost/"), Err(PolicyError::SchemeNotAllowed { .. })));
        assert!(matches!(check_url("not a url"), Err(PolicyError::InvalidUrl(_))));
        assert!(matches!(check_url("file:///etc/passwd"), Err(PolicyError::InvalidUrl(_))));
        // Userinfo could be used to confuse logs or upstream auth; refuse it outright.
        assert!(matches!(check_url("https://user:pw@api.anthropic.com/"), Err(PolicyError::InvalidUrl(_))));
        // IPv6 loopback is deliberately not on the list.
        assert!(matches!(check_url("http://[::1]:11434/"), Err(PolicyError::HostNotAllowed(_))));
    }

    #[test]
    fn strips_credentials_and_keeps_forwardable_headers() {
        let headers = h(&[
            ("X-Api-Key", "leaked"),
            ("Authorization", "Bearer leaked"),
            ("Cookie", "a=b"),
            ("Host", "evil"),
            ("Content-Length", "10"),
            ("anthropic-version", "2023-06-01"),
            ("Anthropic-Beta", "files-api-2025-04-14"),
            ("Content-Type", "application/json"),
            ("accept", "text/event-stream"),
            ("x-stainless-lang", "js"),
        ]);
        let out = filter_request_headers(&headers);
        assert_eq!(
            out,
            vec![
                ("accept".to_string(), "text/event-stream".to_string()),
                ("anthropic-beta".to_string(), "files-api-2025-04-14".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
                ("content-type".to_string(), "application/json".to_string()),
            ]
        );
    }

    #[test]
    fn response_headers_drop_transport_details() {
        let out = filter_response_headers(vec![
            ("Content-Type", "text/event-stream"),
            ("Content-Encoding", "gzip"),
            ("Content-Length", "12"),
            ("request-id", "req_1"),
            ("Set-Cookie", "x=1"),
        ]);
        assert_eq!(out.get("content-type").map(String::as_str), Some("text/event-stream"));
        assert_eq!(out.get("request-id").map(String::as_str), Some("req_1"));
        assert!(!out.contains_key("content-encoding"));
        assert!(!out.contains_key("content-length"));
        assert!(!out.contains_key("set-cookie"));
    }

    #[test]
    fn check_request_marks_anthropic_for_key_injection() {
        let r = check_request("https://api.anthropic.com/v1/messages", "post", &h(&[("x-api-key", "nope")])).unwrap();
        assert!(r.needs_anthropic_key);
        assert_eq!(r.method, "POST");
        assert!(r.headers.is_empty());

        let r = check_request("http://localhost:11434/api/chat", "POST", &h(&[])).unwrap();
        assert!(!r.needs_anthropic_key);

        assert_eq!(
            check_request("https://api.anthropic.com/", "TRACE", &h(&[])),
            Err(PolicyError::InvalidMethod("TRACE".into()))
        );
        assert!(matches!(check_request("https://example.com/", "GET", &h(&[])), Err(PolicyError::HostNotAllowed(_))));
    }

    #[test]
    fn keyring_names_are_restricted() {
        assert_eq!(keyring_entry_name("anthropic_api_key"), Ok("anthropic_api_key"));
        assert_eq!(keyring_entry_name(ANTHROPIC_KEY_NAME), Ok(ANTHROPIC_KEY_NAME));
        assert_eq!(keyring_entry_name("ollama.host-1"), Ok("ollama.host-1"));
        assert!(keyring_entry_name("").is_err());
        assert!(keyring_entry_name("Anthropic").is_err());
        assert!(keyring_entry_name("has space").is_err());
        assert!(keyring_entry_name("../other").is_err());
        assert!(keyring_entry_name(&"a".repeat(65)).is_err());
    }
}
