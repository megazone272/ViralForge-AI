# Security notes

- Never commit `.env`.
- Encrypt OAuth access/refresh tokens at rest in production.
- Use HTTPS in production.
- Add CSRF protection to OAuth callbacks.
- Validate OAuth `state` and PKCE where supported.
- Add rate limiting and request-size limits.
- Store generated media in private object storage with signed URLs.
- Use a real background queue (Redis/BullMQ or a managed queue) for long renders.
- Add moderation and rights checks before publishing.
