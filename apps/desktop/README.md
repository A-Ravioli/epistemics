# @epistemics/desktop

The Tauri 2 shell around the single React build in `apps/web`. The web app is built once; in the
browser it talks to `apps/server`, inside Tauri it talks to the Rust commands below. Nothing in
`apps/web` imports Tauri directly: `packages/platform` picks the implementation at runtime.

## Prerequisites

- Node 22 and pnpm (`corepack enable`), plus `pnpm install` at the repo root.
- Rust stable (1.77.2 or newer; `rustup` recommended).
- Tauri's system dependencies, per OS (from <https://v2.tauri.app/start/prerequisites/>):
  - **macOS**: Xcode command line tools (`xcode-select --install`).
  - **Windows**: Microsoft C++ Build Tools (Desktop development with C++) and the WebView2 runtime
    (preinstalled on Windows 10 1803+ / Windows 11).
  - **Linux (Debian/Ubuntu)**:
    `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev`
    (`libdbus-1-dev` is for the keychain via Secret Service; a running keyring daemon such as
    GNOME Keyring or KWallet is needed at runtime).

## Run and build

```sh
pnpm tauri dev      # from apps/desktop, or `pnpm tauri dev` at the repo root
pnpm tauri build    # produces installers in src-tauri/target/release/bundle/
```

`tauri dev` starts the Vite dev server for `apps/web` (`beforeDevCommand`) and opens the window
against `http://localhost:5173`; `tauri build` runs `pnpm --filter @epistemics/web build` and embeds
`apps/web/dist`. Both are configured in `src-tauri/tauri.conf.json`.

Rust-only checks that need no webview toolchain but do need the Tauri system libraries to link:

```sh
cd src-tauri
cargo fmt --check
cargo test --lib        # policy, wire format, migration embedding
```

Icons in `src-tauri/icons/` are a generated placeholder set (PNG, ICO, ICNS). Replace them with
`pnpm tauri icon path/to/1024x1024.png` once there is real artwork.

## Where things live

| What | Where |
|---|---|
| SQLite database | `<app config dir>/epistemics.db`, which `tauri-plugin-sql` resolves to `~/Library/Application Support/dev.epistemics.app/` (macOS), `~/.config/dev.epistemics.app/` (Linux), `%APPDATA%\dev.epistemics.app\` (Windows). The `open_data_dir` command reveals it. |
| API keys | The OS keychain, service `dev.epistemics.app`, one entry per key name (`anthropic_api_key`, ...). macOS Keychain, Windows Credential Manager, Linux Secret Service. |
| Migrations | `packages/db/migrations/*.sql` (drizzle-kit output), embedded at compile time by `src-tauri/build.rs` and registered for `sqlite:epistemics.db`. Applied on first `Database.load`; the plugin tracks versions in `_sqlx_migrations`. Set `EPISTEMICS_MIGRATIONS_DIR` to point the build at another directory. |
| Webview permissions | `src-tauri/capabilities/default.json`: `core:default`, `sql` (load/select/execute/close), `dialog` (open/save/message), `fs` (app config/data dirs recursively, plus any path picked through a dialog), `opener`. |

## Commands (`invoke` from JS)

| Command | Arguments | Returns |
|---|---|---|
| `secret_get` | `{ key }` | `string \| null` |
| `secret_set` | `{ key, value }` | `void` |
| `secret_delete` | `{ key }` | `void` (missing entry is not an error) |
| `llm_fetch` | `{ url, method, headers, body?, channel }` | `void`; the response arrives on `channel` |
| `open_data_dir` | none | the directory path it opened |

Key names are limited to `[a-z0-9_.-]{1,64}`; anything else is rejected before touching the keychain.

### How `llm_fetch` keeps the key out of the webview

1. JS constructs the request as it would for `fetch` and passes it with a `Channel`.
2. `policy::check_request` (pure Rust, unit-tested) parses the URL and refuses anything whose host is
   not `api.anthropic.com`, `localhost` or `127.0.0.1`; remote hosts must be `https`, loopback may be
   `http` (Ollama). Only `anthropic-version`, `anthropic-beta`, `content-type` and `accept` are
   forwarded. `x-api-key`, `authorization`, cookies and everything else from JS are dropped.
3. For `api.anthropic.com`, Rust reads `anthropic_api_key` from the keychain and sets `x-api-key`
   itself. The key is never returned to JavaScript on this path.
4. `reqwest` performs the call and the response is streamed back on the channel as
   `{ status, headers }`, then raw byte chunks (`Vec<u8>`, a JSON number array), then `{ done: true }`.
   `packages/platform/src/tauri.ts` wraps that channel in a `ReadableStream` inside a `Response`,
   so the shared LLM client works unchanged. Errors reject the `invoke` promise with a string.

Because the request originates in Rust, CORS never applies and the webview CSP can stay at
`connect-src 'self' ipc: http://ipc.localhost`.

Keep in mind that `secret_get` does return values to JS when the UI asks for them (the settings
screen needs it to show that a key exists). If that becomes a concern, have the UI ask only whether
a key exists and never read it back.
