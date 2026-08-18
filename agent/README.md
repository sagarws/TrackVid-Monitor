# Local browser agent

Opens a logged-in marketplace browser **on your own machine** when you click
**Open account** in the Monitor's Company list.

## Why it exists

A web page can't launch a browser, and Automated-scripts *can* — but it runs on
the automation server, so its Chrome window opens there. Neither gets you into a
seller portal. This process runs where you are.

## Run it

```bash
cd agent && npm install     # once
pnpm agent                  # from the repo root, any time after
```

It listens on `127.0.0.1:7788` (loopback only). The Monitor probes `/health` on
page load and enables the button when it answers.

## What happens on click

1. The Monitor POSTs `{ platform, username, password }` to `/open`.
2. The agent launches your installed Chrome with a per-account profile.
3. It runs that platform's login flow (ported from Automated-scripts).
4. It calls `browser.disconnect()` — Chrome stays open and untethered, the
   agent goes back to idle.

Stopping the agent does **not** close windows you're working in: the signal
handlers are disabled at launch.

If a login fails (portal changed its form, OTP, captcha), the window is left
open so you can finish by hand rather than starting over.

## Platforms

`myntra`, `ajio`, `snapdeal`, `meesho`, `flipkart`, `nykaa`, `delhivery`,
`xbees` — see `logins/`. Myntra also accepts a stored cookie jar and replays it
instead of typing the password, which skips bot detection entirely.

Quirks carried over from the automation, because each is load-bearing:

| Platform | Quirk |
| --- | --- |
| Myntra | Slow per-char typing; instant fills trigger a "Network Error" banner |
| Ajio | Reliance OAuth SSO; some builds auto-redirect, others need the launcher click |
| Flipkart | Edge serves 502 on cold loads (reload up to 4x); username→password re-render detaches the field |
| Delhivery | Keycloak renders hidden 0×0 password inputs and Login buttons for autofill — the visible one is picked explicitly |
| Xbees | SSO round-trip can bounce back to the landing "Sign in"; clicked through up to 3x |
| Nykaa | Login inputs live inside the Zoho `#iamFrame` iframe; captcha/OTP is common — finish it by hand in the window |

Adding one: drop a module in `logins/` exporting
`{ key, label, homeUrl, login(page, credentials) }`, register it in
`logins/index.js`, and add the key to `AGENT_PLATFORMS` in
`src/views/apps/company/list/index.tsx`.

## Config

| Env | Default | Purpose |
| --- | --- | --- |
| `AGENT_PORT` | `7788` | Listen port |
| `AGENT_ALLOWED_ORIGINS` | `http://localhost:4001,http://127.0.0.1:4001` | CORS allowlist |
| `AGENT_PROFILE_DIR` | OS temp dir | Where Chrome profiles live |
| `AGENT_CHROME_CHANNEL` | `chrome` | Set empty to use bundled Chromium |

Point the Monitor elsewhere with `NEXT_PUBLIC_LOCAL_AGENT_URL`.

## Note on credentials

Credentials arrive in the request body from the Monitor page, which already
renders them in the credential panel — this adds no exposure beyond that panel.
Nothing is written to disk except Chrome's own profile.
