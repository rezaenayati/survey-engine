# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✓ Active  |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a vulnerability, send a private report to the maintainers:

1. Open a [GitHub Security Advisory](https://github.com/your-org/survey-engine/security/advisories/new) (preferred — kept private until resolved).
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

## Security Design Notes

- Survey Engine does **not** perform authentication itself. It relies on the caller's gateway to pass a trusted `X-User-ID` header. **Deploy it on an internal network or behind a trusted reverse proxy.**
- Set the `API_KEY` environment variable when the service is exposed beyond a trusted network.
- Webhook payloads are signed with HMAC-SHA256. Always verify the `X-Survey-Engine-Signature` header before processing webhook data.
