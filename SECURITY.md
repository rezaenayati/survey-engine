# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✓ Active  |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a vulnerability, send a private report to the maintainers:

1. Open a [GitHub Security Advisory](https://github.com/rezaenayati/survey-engine/security/advisories/new) (preferred — kept private until resolved).
2. Or email the maintainers directly. The address is listed in the repository's `package.json` `author` field.

Include as much of the following as possible:

- Type of issue (e.g. SQL injection, authentication bypass, data leak)
- Affected version(s)
- Steps to reproduce
- Proof-of-concept or exploit code (if available)
- Impact assessment

## Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | 48 hours |
| Initial triage | 5 business days |
| Fix or mitigation | 30 days (critical), 90 days (others) |
| Public disclosure | After fix is released |

## Scope

The following are **in scope**:

- Authentication/authorisation bypass
- Data leakage across tenants or users
- SQL injection or NoSQL injection
- Webhook signature bypass
- Denial-of-service via malformed input

The following are **out of scope**:

- Vulnerabilities in dependencies that are already publicly known and haven't been patched upstream
- Issues requiring physical access to a deployed server
- Social engineering attacks

## Trust Contract

Survey Engine does **not** perform user authentication itself. It uses two headers to
implement the contract that its callers must enforce:

| Header        | Purpose                                                            | Trusted because…                                                            |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `X-User-ID`   | Identifies the acting user; drives ownership and attribution.      | The deployer's gateway authenticates the user *before* forwarding the header. |
| `X-API-Key` / `Authorization: Bearer` | Authenticates the *caller* (typically a backend). | The shared secret is known only to authorised services.                     |

Three deployment shapes that satisfy the contract:

1. **Behind a trusted gateway, no `API_KEY`.** The engine is on an internal network; the
   only thing that can reach it is your own BFF, which has already verified the user. The
   engine accepts `X-User-ID` as-is. *This is the default.*

2. **Internet-reachable, `API_KEY` set.** Any caller must present the shared key. The
   engine still trusts whatever `X-User-ID` that authorised caller sends — so the caller
   is responsible for only sending it after authenticating the user.

3. **Internet-reachable, `API_KEY` set, `STRICT_AUTH=true`.** Same as (2) but the engine
   *also* refuses any `X-User-ID` request that doesn't carry the API key. Use this when
   you want a hard failure mode for misconfigured callers — e.g. a forgotten env var
   leaks the engine to the open internet. Without it, an attacker who can reach the
   engine directly can set `X-User-ID: <victim>` and act as that user.

Anything that doesn't match one of these shapes — for example, an internet-reachable
engine with no `API_KEY` — is a misconfiguration and a vulnerability against this threat
model.

## Other Security Notes

- Webhook payloads are signed with HMAC-SHA256. Always verify the
  `X-Survey-Engine-Signature` header before processing webhook data.
- File uploads are size-capped (`FILE_MAX_SIZE_BYTES`, default 25 MB) and validated against
  per-question `allowedFileTypes` rules. The current validation trusts the client-supplied
  MIME type; magic-byte sniffing is on the roadmap.
- Rate limiting (`THROTTLE_LIMIT` / `THROTTLE_TTL`) defends against scraping and
  brute-force enumeration of resource UUIDs.
