# Security: MCP Proxy Auth Token

## What It Is

`MCP_PROXY_AUTH_TOKEN` is an environment variable that acts as a shared secret between the MCP inspector (or any MCP client) and the MCP server. It is a security gate that prevents unauthorized access to the server.

## Why It Exists

When you launch the MCP inspector, it starts a local web server on your machine (typically on port 6274). This web server communicates with your browser-based MCP client (e.g., the MCP inspector UI).

Without a protection mechanism, any website you visit could make background HTTP requests to `http://localhost:6274`. Since your MCP server has access to your local filesystem (it reads and analyzes files), a malicious website could:

- Enumerate files and directories on your machine
- Read the contents of sensitive files
- Use your MCP server as a proxy to interact with other local services

This is a form of Cross-Site Request Forgery (CSRF) attack targeting localhost services.

## How It Works

```
Browser Tab (with token)         Malicious Site (no token)
         │                               │
         │  GET /api/analyze             │  GET /api/analyze
         │  Authorization: Bearer X      │  (no auth header)
         │                               │
         v                               v
    ┌─────────────────────────────────────────┐
    │       MCP Inspector (localhost:6274)     │
    │                                          │
    │  Validates token ──── ACCEPT             │
    │  No token / wrong token ── REJECT        │
    └──────────────────────────────────────────┘
```

- The token is generated once when the inspector starts.
- It is embedded in the URL opened in your browser (e.g., `http://localhost:6274?token=abc123`).
- Only the browser tab holding that exact URL can successfully communicate with the server.
- Any request missing the token, or carrying a different token, is rejected.

This effectively blocks all CSRF and unauthorized cross-origin attacks.

## Usage in This Project

When running the MCP server with the inspector, you may set the environment variable:

```bash
MCP_PROXY_AUTH_TOKEN="your-secure-token" npx @modelcontextprotocol/inspector ...
```

If you do not set it explicitly, the inspector generates a random token automatically.

## Important Notes

- The token is **not** a user authentication mechanism. It does not identify who is using the server.
- The token is a **session-level** security measure. It protects the transport channel, not the data.
- The token should be treated as a secret. Do not commit it to version control, log it, or expose it in error messages.
- If you are running the MCP server over `stdio` directly (without the inspector's web proxy), this token mechanism does not apply — `stdio` transport has no CSRF surface.

## Related Best Practices

| Practice | Rationale |
|----------|-----------|
| Never log the token | Prevents accidental exposure in logs or error reporting |
| Use a strong random value | Prevents brute-force or guessing attacks |
| Validate on every request | Ensures even leaked tokens from stale sessions are ineffective after restart |
| No token in source code | Committed secrets are a common attack vector |
