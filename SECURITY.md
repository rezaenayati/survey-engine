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

Survey Engine does **not** perform user authentication itself. Identity arrives via one of
three headers — pick the one that matches your threat model:

| Header                                | Purpose                                                       | Trusted because…                                                                |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `X-User-ID`                           | Identifies the acting user; drives ownership and attribution. | The deployer's gateway authenticates the user *before* forwarding the header.   |
| `X-User-Token`                        | Same purpose, cryptographically signed.                       | An HS256 JWT signed with `USER_TOKEN_SECRET` — the engine verifies the signature itself. |
| `X-API-Key` / `Authorization: Bearer` | Authenticates the *caller* (typically a backend).             | The shared secret is known only to authorised services.                         |

Four deployment shapes that satisfy the contract:

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

4. **Signed user tokens (`USER_TOKEN_SECRET` set).** Callers mint an HS256 JWT with
   `sub = userId` and forward it as `X-User-Token`. The engine verifies the signature
   itself, so no separate trust assumption about the caller is needed. With
   `STRICT_AUTH=true`, `X-User-ID` is rejected entirely — only signed tokens are honored
   — so a misconfigured deployment cannot fall back to the trusting mode.

Anything that doesn't match one of these shapes — for example, an internet-reachable
engine with no `API_KEY` and no `USER_TOKEN_SECRET` — is a misconfiguration and a
vulnerability against this threat model.

### Minting user tokens

Tokens are standard HS256 JWTs. With `jsonwebtoken` on your backend:

```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { sub: user.id },                            // userId goes in `sub`
  process.env.USER_TOKEN_SECRET!,              // same secret the engine has
  { algorithm: 'HS256', expiresIn: '15m' },
);

await fetch(`${SURVEY_ENGINE_URL}/surveys`, {
  headers: { 'X-User-Token': token, 'X-API-Key': process.env.SURVEY_ENGINE_API_KEY! },
  // ...
});
```

The engine verifies the signature, checks `exp` (with ±60s clock skew), and uses `sub` as
the userId for ownership and attribution. Invalid signatures, expired tokens, missing
`sub`, and non-HS256 algorithms are all rejected with `401`.

## Other Security Notes

- Webhook payloads are signed with HMAC-SHA256. Always verify the
  `X-Survey-Engine-Signature` header before processing webhook data.
- File uploads are size-capped (`FILE_MAX_SIZE_BYTES`, default 25 MB) and validated against
  per-question `allowedFileTypes` rules. The current validation trusts the client-supplied
  MIME type; magic-byte sniffing is on the roadmap.
- Rate limiting (`THROTTLE_LIMIT` / `THROTTLE_TTL`) defends against scraping and
  brute-force enumeration of resource UUIDs.
