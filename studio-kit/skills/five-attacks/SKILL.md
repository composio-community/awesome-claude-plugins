---
name: five-attacks
description: Use before anything with an interactive part goes live (contact or booking form, AI chat widget, login, client area, admin panel, checkout, webhook, any new API route), and whenever the user says "launch", "go live", "deploy", "is it safe". Runs the five attacks that actually hit small-studio sites (stolen AI key, AI endpoint called in a loop, bot-flooded form, impersonating a user or admin, fake payment) against the user's own project, in about ten minutes, and ends with a one-line verdict. Defensive testing of systems the user owns only.
license: MIT
---

# Five attacks before launch

Most small sites are not hacked by clever people. They are drained by a script that found an API key in
the JavaScript bundle, or spammed by a bot that discovered the form has no server-side check, or they ship
a product to someone who called the "success" URL by hand. This skill runs those five attacks against the
user's own project before it goes live, and prints one line the user can read in two seconds:

```
SECURITY: 1✓ 2✓ 3✗ 4✓ 5 n/a   (3: form accepts posts without a captcha token)
```

Scope: only the user's own project or one they are authorized to test. Never point these probes at third-party
sites. Keep request counts small (the defaults are 25) and stop as soon as a limit triggers.

## How to run it

1. Inventory the interactive surface. List every route that accepts input or spends money: forms, `/api/*`,
   server actions, edge functions, webhooks, login, admin, AI calls. Read the code; do not trust the UI.
   A widget removed from the page is not a closed door: if the route still answers, it is in scope.
2. For each of the five attacks below, run the test, record PASS / FAIL / n/a with the evidence
   (command and real output), and fix FAILs before launch.
3. Print the verdict line plus the evidence table. Do not say "secure" without the real outputs.

Tests that need a running server: start the project locally (or use a preview URL the user owns), never production
unless the user explicitly asks and understands the requests are real.

## 1. Stolen AI key (or any secret) from the client bundle

Attack: open DevTools, search the JS for `sk-`, `AIza`, `pk_`... and use the key on someone else's bill.

Test:
```bash
python3 scripts/scan_bundle.py dist/            # or build/, .next/, out/, public/
python3 scripts/scan_bundle.py https://preview.example.com   # fetches the page and every same-origin script
```
PASS when the scan finds nothing. Also check:
- No secret sits in a browser-exposed env var (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `REACT_APP_`, `EXPO_PUBLIC_`).
  Those are inlined into the bundle at build time by design.
- Source maps are not deployed publicly (`*.js.map` returns 404 on the live host), or contain no secrets.
- In the AI provider's console: a monthly spend limit is set, auto-recharge is off, the key is dedicated
  to this project (so it can be revoked without breaking others).

Fix: move the call server-side (API route, edge function, backend). The browser talks to your route; only the
route holds the key. A key that ever reached a public repo or bundle must be rotated, even if it is only in history.

## 2. AI endpoint called in a loop

Attack: a script posts to `/api/chat` 10,000 times overnight. Every call is billed to the site owner.

Test (own server only):
```bash
python3 scripts/probe_endpoint.py https://localhost:3000/api/chat --json '{"message":"hi"}' -n 25
python3 scripts/probe_endpoint.py https://localhost:3000/api/chat --json '{"message":"hi"}' -n 5 --origin https://evil.example
```
PASS when, within the 25 calls, responses switch to 429 (rate limit) and a foreign `Origin` gets 403.
Also read the route and confirm:
- the limit is atomic and server-side (platform rate-limit binding, Redis INCR with TTL, database row lock),
  not "read a counter, then write it" in a key-value store, which races under parallel calls;
- a daily ceiling exists and is above zero (a cap of 0 that means "unlimited" is a classic bug);
- `max_tokens` (or equivalent) is fixed in server code, never taken from the request;
- the prompt and model are fixed server-side; the client sends only the user's message;
- a bot check (Turnstile, hCaptcha, reCAPTCHA) is verified on the server when the endpoint is public.

## 3. Form flooded by bots

Attack: a bot finds the booking or contact form and posts 5,000 entries, or uses it to send spam from your domain.

Test:
```bash
# post directly, without the captcha token the page would add
python3 scripts/probe_endpoint.py https://localhost:3000/api/contact --form 'name=Test&email=t@example.com&message=hi' -n 10
```
PASS when the server rejects posts that lack a valid captcha token (4xx), limits repeats per IP, and refuses
oversized fields. Check in code:
- the captcha token is verified server-side with the provider's verify endpoint, and verification FAILS CLOSED
  when the secret is missing (a missing env var that silently skips verification is the most common hole);
- a honeypot field exists and is checked server-side;
- duplicate submissions (same email + same message within minutes) are dropped;
- every field has a maximum length and type validation; uploads have a size and type allowlist;
- the form never sends email to an address taken from the form without confirmation (open relay).

## 4. Impersonating a user or an admin

Attack: change `/api/orders/1041` to `/api/orders/1042`; call `/admin` without logging in; try 1,000 passwords.

Test:
- Log in as user A, copy a request that reads or changes A's object, replay it with B's object id
  (or with no session). PASS when the server answers 403/404, never B's data.
- Call every admin route without a session and with a normal user's session. PASS: 401/403.
- Send 20 wrong passwords for one account. PASS when it slows down or locks (429 or lockout), and the
  responses for "unknown email" and "wrong password" look identical.
- Check tokens (reset links, magic links, invite codes, download links): random, at least 32 characters,
  single-use or expiring, never a sequential id or an email in base64.
- No password, token or session id ever travels in a URL query string (they end up in logs and referrers).

Fix: authorize on the server for every request and every object (ownership check), not in the UI.

## 5. Fake payment

Attack: call the "thank you" or fulfilment URL with a made-up order id, or replay a webhook, and receive the
product without paying.

Test:
- Call the fulfilment path with an invented session/order id. PASS: nothing is delivered.
- Send the webhook endpoint a request with a wrong or missing signature. PASS: 401, nothing delivered.
- Send the same valid webhook twice (in test mode). PASS: delivered once (idempotent on the order id).

Rule: fulfil only from a signed webhook (Stripe `whsec_` signature, Shopify `X-Shopify-Hmac-Sha256`, PayPal
verification) or from a server-side lookup of the payment by id that checks status, amount, currency and the
product. Never trust an id, amount or "paid=true" coming from the browser.

## Switching something off means switching it off on the server

Hiding a button does not close an endpoint. To retire a feature: remove the route or the function, or unset its
key and let it fail closed, then verify the URL answers 404/410. A route that answers 403 still exists.

## Output format

```
SECURITY: 1✓ 2✓ 3✓ 4✓ 5✓
| # | attack | result | evidence |
|---|--------|--------|----------|
| 1 | stolen key | PASS | scan_bundle.py dist/: 0 findings in 14 files |
| 2 | AI loop | PASS | probe: 200 x10, 429 x15; foreign Origin 403 |
...
```
Use `n/a` only when the surface does not exist (no payments, no AI), and say so in the evidence column.

For the deep version (OWASP, agent and MCP tool security, incident runbooks, supply chain) use the
`security-engineer` skill from Studio Kit Pro, if installed.

## Scripts

- `scripts/scan_bundle.py <dir|url>`: scans built files or a live page plus its same-origin scripts and source
  maps for secret-shaped strings. Standard library only. Exit 1 when something is found.
- `scripts/probe_endpoint.py <url> [--json BODY | --form BODY] [-n 25] [--origin URL] [--delay 0.2]`: sends a small
  burst to one of your endpoints and prints a status-code histogram, first-429 position and timing.
