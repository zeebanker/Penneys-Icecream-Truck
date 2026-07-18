# Pennys Truck - Build Plan

This is the step-by-step plan to build the app. It sits next to `CLAUDE.md` in the repo. Work the phases in order. Each phase ends with a "Done when" check before moving on.

## The whole system in one paragraph

Penny's phone runs the OwnTracks app, which sends her GPS location every 3 minutes to a small program (a "Worker") running on Cloudflare. The Worker saves the latest location in a Cloudflare database (D1). Two web pages are hosted for free on GitHub Pages: a driver page where Penny taps SHARE or DISABLE, and a customer map page where parents see the truck. Both pages talk to the same Worker. The Worker will only reveal the location to customers when sharing is turned on.

## Repository layout

```
penneys-truck/
  CLAUDE.md            # project context (already written)
  BUILD_PLAN.md        # this file
  worker/              # the Cloudflare backend
    src/index.js       # the Worker code (all API endpoints)
    schema.sql         # database table definitions
    wrangler.toml      # Cloudflare config
  docs/                # the two public web pages (GitHub Pages serves this folder)
    index.html         # customer map page
    driver.html        # driver control page
```

## What the backend needs to store

One database table is enough.

- `truck_state`: a single row holding the latest known location and whether sharing is on.
  - `id` (always 1, so there is only ever one row)
  - `lat`, `lon` (latest coordinates)
  - `updated_at` (when the location last came in)
  - `sharing` (0 = off, 1 = on)
  - `moving` (0 = stationary/serving, 1 = moving) - set by the Worker on each ping by comparing the new position to the previous one (moved > ~50m = moving). Drives the customer truck icon.

## The Worker's jobs (API endpoints)

The Worker answers four kinds of requests:

1. `POST /owntracks` - receives a location from Penny's OwnTracks app and saves `lat`, `lon`, `updated_at`. On each ping, before overwriting, compare the new position to the stored one: moved more than ~50m sets `moving = 1`, otherwise `moving = 0`. (First ever ping, with no prior position, defaults to `moving = 1`.) Protected by a secret so only her phone can post.
2. `POST /share` and `POST /disable` - the driver page calls these to flip `sharing` on or off. Protected by a driver secret so only Penny can toggle.
3. `GET /state` - the customer page calls this to ask "where is the truck and is sharing on?" If sharing is off, the Worker returns "not sharing" and NO coordinates. If on, it returns the latest `lat`, `lon`, `updated_at`, and `moving`.

Rule that enforces the core principle: coordinates are only ever sent to customers when `sharing = 1`. Turning sharing off must immediately stop customers from seeing the location.

## Security note (read this)

GitHub Pages serves plain, public files, so any secret written inside `driver.html` can technically be viewed by a determined person. For this neighborhood-scale app that is an acceptable trade-off, but be honest about it:

- Keep Penny's driver page at a private, unguessable web address (for example a long random path) and give the link only to her.
- Store the OwnTracks secret and driver secret as Cloudflare "secrets," not in the public pages, wherever possible.
- Do not treat this as bank-grade security. It stops casual access, not a motivated attacker. Revisit if the app ever grows beyond one truck.

Decision - dev stage vs. handover:

- **Dev stage (now):** hard-coded driver secret in the page, served from GitHub Pages, toggled by Pat from his own phone. Fine while only Pat has the link.
- **At handover to Penny:** switch to a passphrase prompt - Penny types a code once, it is stored in her phone's localStorage and sent with each toggle, so the secret is never written into the public HTML source. The Worker validates it. Keep the unguessable URL as a second layer.

---

## Phase 0 - Accounts and tools

Set up before any code.

- Create/confirm the GitHub repo `github.com/zeebanker/penneys-truck`.
- Create/confirm a Cloudflare account.
- Install Node.js and the Cloudflare command-line tool (`wrangler`).
- Install the OwnTracks app on Penny's iPhone (and Pat's, for testing).

**Done when:** `wrangler --version` works and the empty repo is cloned to Pat's Mac.

## Phase 1 - Cloudflare backend

Build the Worker and database first, because both pages depend on it.

1. Create the Worker project in `worker/` with `wrangler`.
2. Write `schema.sql` for the `truck_state` table above; create the D1 database and apply the schema.
3. Bind the D1 database in `wrangler.toml`.
4. Write `src/index.js` with the four endpoints (`/owntracks`, `/share`, `/disable`, `/state`).
5. Store two secrets with `wrangler secret put`: one for OwnTracks, one for the driver page.
6. Add CORS headers so the GitHub Pages site is allowed to call the Worker.
7. Deploy to `penneys-truck.zeebanker.workers.dev`.

**Done when:** using a manual test (curl or a REST tool), a fake location can be posted to `/owntracks`, `/share` turns sharing on, `GET /state` returns the coordinates, and `/disable` makes `GET /state` return "not sharing" with no coordinates.

## Phase 2 - OwnTracks integration

Connect Penny's real phone GPS to the Worker.

1. In OwnTracks, set mode to HTTP and point it at `https://penneys-truck.zeebanker.workers.dev/owntracks`.
2. Add the OwnTracks secret so the Worker accepts the posts.
3. Set the reporting interval to 3 minutes.
4. Confirm the Worker correctly reads the fields OwnTracks sends (latitude, longitude, timestamp).

**Done when:** walking around with the phone updates `lat`/`lon` in the database roughly every 3 minutes, visible via `GET /state` (with sharing on).

## Phase 3 - Driver page

The page Penny actually uses.

1. Build `docs/driver.html`: two large round buttons.
   - SHARE LOCATION (green), byline "Customers CAN see my location" - calls `POST /share`.
   - DISABLE SHARING (red), byline "Customers CANNOT see my location" - calls `POST /disable`.
2. Show current status clearly (which mode is active right now), read from `GET /state`.
3. Include the driver secret so the toggle calls are accepted (see security note).
4. Make it work well one-handed on a phone screen.

**Done when:** on a phone, tapping the buttons flips sharing on/off and the on-screen status matches what `GET /state` reports.

## Phase 4 - Customer map page

The page parents open.

1. Build `docs/index.html` with Leaflet.js + OpenStreetMap, centered on Minneapolis / St. Paul.
2. On load and then every 30 seconds, call `GET /state`.
3. If sharing is on: show the truck marker (ice cream color scheme) at the latest location and a relative "last updated" time (e.g. "Updated 2 minutes ago", computed on the customer's device; `updated_at` is stored as UTC). Choose the icon from the `moving` flag: `moving = 0` shows the bouncing "serving" truck, `moving = 1` shows the forward-nudging truck.
4. If sharing is off: hide the marker and show a friendly "Penny isn't out right now" message.
5. Handle the case where the truck has never reported. (Staleness is intentionally NOT handled at this stage - sharing on means show the dot however long she sits.)

**Done when:** with sharing on, the map shows the truck near its real position and refreshes; with sharing off, the map shows the "not out" message and no location.

## Phase 5 - Field testing

Prove it works before showing Penny.

1. Enable GitHub Pages to serve the `docs/` folder; confirm both pages load at their public addresses.
2. Full loop test on Pat's phone: drive/walk a route with OwnTracks running, toggle sharing from the driver page, and watch the customer map on a second device.
3. Check the 3-minute update timing feels acceptable in real use.
4. Confirm turning sharing off immediately removes the location for customers.
5. Test on a weak/spotty connection and after the phone screen locks.

**Done when:** a real route is trackable end to end on a separate device, sharing on/off behaves correctly, and there are no blocking bugs. Then demo to Penny.

---

## Settled decisions (were open questions)

- **Driver auth:** hard-coded secret for dev stage; passphrase-in-localStorage at handover to Penny. (See Security note.)
- **Staleness:** not handled at this stage. Sharing on = show the location however old it is.
- **Parked/idle truck:** shown with a bouncing "serving" truck icon (driven by the `moving` flag), not hidden or flagged as idle. Sharing stays on until Penny taps DISABLE.
- **"Last updated" wording:** relative time on the customer's device ("Updated N minutes ago"); store `updated_at` as UTC. No timezone math.
- **Accurate location, no fuzzing (decided 2026-07-13).** Penny wants customers to see her exact spot; the approximate-neighborhood privacy idea is dropped. The map shows the precise pin. (The earlier prototype was already reverted.)

---

## Before go-live (deferred to-dos)

Not needed for dev/testing among Pat and Penny; must be done before the public launch.

- **Rebrand to "A Whale of a Treat!" - DONE (2026-07-13).** Both pages carry the whale logo, blue palette, and soft-pink boxes; whale-popsicle map marker. Assets in `docs/`.
- **Custom domain - DONE (2026-07-13).** App is live at `awhaleofatreat.com` (and `/driver`) on Cloudflare Pages (project `awhaleofatreat`, direct wrangler deploy of `docs/`). See CLAUDE.md for the deploy command.
- **Turn off the old GitHub Pages site - DONE (2026-07-13).** Old github.io URLs now 404; app lives only at the custom domain.
- **Driver auth passphrase swap - DONE (2026-07-13).** No secret in `driver.html`; a code gate saves the code on the phone and sends it via the `X-Secret` header. Worker gained `POST /verify` for instant feedback. Comparison is an exact case-sensitive match (`secretOk` in `worker/src/index.js`).
- **Secret rotation - DONE (2026-07-17).** Both `DRIVER_SECRET` and `OWNTRACKS_SECRET` rotated to production values via `wrangler secret put` (old dev values are dead). Verified live: new driver code 200, old code 401, wrong-case 401; the stale test broadcast was turned off. **Actual values are NOT written in this repo (it is public)** - they live in the private handover note. To change the driver code later: one `wrangler secret put DRIVER_SECRET` (no code change). Rotating `OWNTRACKS_SECRET` again would also mean updating the URL in the OwnTracks app.
- **OwnTracks on Penny's Android phone - the only handover step left.** Penny's phone is Android; Pat's iPhone was the test device (its OwnTracks now holds the dead old secret, so it will not post until reconfigured). At handover, configure OwnTracks on Android (HTTP mode, the `/owntracks` URL with the NEW `OWNTRACKS_SECRET`, monitoring = Move, ~180s, Location = Always + Precise; plus Android background-location and battery-optimization/autostart settings, the main reliability risk), then do a live share, short drive, stop test. A printable one-page guide for Penny is at `handover/penny-guide.html` (git-ignored; contains the live code).
- **Make the GitHub repo PRIVATE - POST-handover to-do.** The app runs entirely on Cloudflare and is independent of GitHub (Pages = direct wrangler upload, not git-connected; Worker = `wrangler deploy`; GitHub is version-control/backup only), so changing visibility or even deleting the repo does not affect the live app. The repo was public only for the old free GitHub Pages hosting, which is now off, so it no longer needs to be public. Private (not deleted) keeps the backup and removes public exposure. Penny needs no git account, she is a user of the driver page, not a maintainer. Do it once the handover is complete: repo → Settings → Danger Zone → Change repository visibility → Private.

---

## Future option: onboard OBD-II GPS tracker (not now)

An always-powered OBD-II GPS tracker in the truck could replace the phone as the LOCATION source. Only worth it if the phone proves unreliable (dead battery, app killed, Penny forgets to open it). It does NOT remove the phone: Penny still needs the driver page for the Share/Hide toggle. Our architecture already separates "location in" (`/owntracks`) from "sharing toggle" (`/share`/`/disable`), so only the location source changes; the toggle and the sharing gate stay the same. Core principle still holds: ignition/motion never auto-shares; only Penny's tap does.

Recommended stack (researched 2026-07-12; verify current specs/coverage before buying):

- **Tracker:** Teltonika, open Codec protocol, points at your own server, highly configurable. Prefer **FMC003 (LTE Cat-1)** over FMM003 (Cat-M1) because the device is OBD-powered (low-power Cat-M1 gives no benefit here) and Cat-1 tends to have broader US coverage. Get the North America LTE band variant. (Queclink GL300/GL320 are not OBD plug-in, so they lose the always-powered benefit.)
- **SIM:** Hologram (metered, great US coverage/DX, ~$1-2/mo, no data ceiling) for zero worry, OR 1NCE (~$10 for 10 years / 500 MB, likely enough) IF its Cat-M1/US carrier coverage checks out in Penny's actual service area.

CRITICAL architectural gap: **Teltonika sends binary over raw TCP/UDP (Codec 8), and a Cloudflare Worker only accepts HTTP inbound.** The tracker CANNOT post to `/owntracks` directly. A protocol bridge is required:

- **Flespi** (recommended): a service that terminates the Teltonika protocol and forwards each position out as a webhook/MQTT to a new Worker endpoint. Cheap/free tier for one device, minimal code.
- Or a tiny self-hosted TCP parser (a ~$5/mo VPS running an open-source Codec 8 parser) that POSTs to the Worker. Cheaper long-term but you own a server.

Net new work if pursued: buy device + SIM, set up the bridge, add one Worker endpoint (e.g. `/obd`) that parses the bridge's payload and writes to D1. Rough cost: ~$70-95 device + ~$1-2/mo SIM + Flespi low/free tier.
