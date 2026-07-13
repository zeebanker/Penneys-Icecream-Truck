# Pennys Truck

A Progressive Web App (PWA) that lets a neighborhood ice cream truck operator (Penny) share her real-time location, and lets customers (parents) track the truck on a map.

## Core principle

Simplicity and minimal friction for the end user. Penny's explicit button tap is the ONLY signal for sharing status. Do not infer sharing status from GPS speed, location, time of day, or any other automated trigger.

Note: GPS movement MAY be used to pick the customer-facing truck icon (see "Customer map page design"). That is display-only cosmetics; it never decides whether the location is shared. Sharing on/off remains 100% Penny's button.

## What it does

- **Driver page** (for Penny): two large round buttons to turn location sharing on or off.
- **Customer map page** (for parents): shows the truck's near-real-time location on a map when sharing is on.

## Architecture

Data flow: OwnTracks (phone GPS; iPhone for testing, Penny's Android at handover) -> Cloudflare Worker API -> Cloudflare D1 database -> two GitHub Pages HTML pages.

- Map centered on Minneapolis / St. Paul, MN.
- Map built with Leaflet.js + OpenStreetMap.
- OwnTracks reports location every 3 minutes.
- No custom domain in this phase.

## Infrastructure (locked in)

- GitHub repo: `github.com/zeebanker/penneys-truck`
- Cloudflare Worker: `penneys-truck.zeebanker.workers.dev` (deployed and live)
- Cloudflare D1 database for storing location updates
- GitHub Pages hosts the two HTML pages

## Driver page design (approved)

Two large round buttons:

- **SHARE LOCATION** (green), byline: "Customers CAN see my location"
- **DISABLE SHARING** (red), byline: "Customers CANNOT see my location"

## Customer map page design

Placeholder mockup produced: pulsing truck icon, ice cream color scheme, shown inside a mobile phone frame.

Truck icon reflects movement (parents' view only, display-only):

- **Stationary -> bouncing truck** ("serving"). Triggered when a new GPS ping is within ~50m of the previous ping (50m absorbs normal parked GPS jitter).
- **Moving -> forward-nudging truck.** Triggered when a ping moved more than ~50m from the previous ping.
- The switch is immediate (first stationary ping shows the bouncing icon; no counter/delay).
- The Worker decides moving vs. stationary on each incoming ping and returns a `moving` flag from `GET /state`, so every parent sees the same icon even after a page reload. The very first ping (no prior position to compare) defaults to moving.

## Build plan (five phases)

1. Cloudflare backend (Worker + D1)
2. OwnTracks integration
3. Driver page
4. Customer map page
5. Field testing

## Auth (dev stage vs. handover)

- **Dev stage (now):** the driver secret is hard-coded in the page and served from GitHub Pages. Toggling is done by Pat from his own phone. Acceptable while only Pat has the link.
- **At handover to Penny:** replace the hard-coded secret with a passphrase-prompt approach (Penny types a code once, it's stored in the phone's localStorage and sent with each toggle; the secret is never written into the public HTML source). Keep the driver page at an unguessable URL as a second layer.

## Current status (2026-07-12)

- **Phase 1 (Cloudflare backend): DONE, live.** Worker at `penneys-truck.zeebanker.workers.dev`; D1 `penneys-truck` with schema; both secrets set. All four endpoints pass their done-when tests (privacy rule + 50m moving/stationary detection).
- **Phase 2 (OwnTracks): DONE, live-verified.** Pat's iPhone posts real GPS through to the Worker (mode = HTTP, secret in the URL as `?secret=`, monitoring = Move, interval 180s, Location = Always + Precise). Confirmed moving:1 when driving and moving:0 when parked.
- **Phase 3 (driver page): DONE, live-tested.** `docs/driver.html` - two big buttons wired to `/share` and `/disable`, live status from `/state`. Design approved.
- **Phase 4 (customer map): DONE, live-tested.** `docs/index.html` - Leaflet + OSM, 30s refresh, Option-3 pink map-pin + cone + "Penny!" label, bouncing (serving) vs nudging (moving), relative "updated N ago", friendly "Penny isn't out right now" curtain when off. Design approved.
- **Phase 5 (field test): DONE (2026-07-12).** Live on GitHub Pages; real drive test passed on Pat's phone, the customer map updates the location in real time. All five build phases complete.
- **Before go-live to-dos** (see BUILD_PLAN "Before go-live"), needed before demoing/handing to Penny: **rebrand to "A Whale of a Treat!"** (real business at `www.awhaleofatreat.com`, blue whale-popsicle logo; both pages get the real name/logo/colors, optional `track.awhaleofatreat.com` subdomain), the driver-auth passphrase swap, rotate the dev secrets, and configure OwnTracks on Penny's Android phone at handover. **Location fuzzing is dropped: Penny wants exact location shown (decided 2026-07-13).**

## Live dev secrets (dev stage only; rotate before handover)

- Worker URL: `https://penneys-truck.zeebanker.workers.dev`
- `OWNTRACKS_SECRET` and `DRIVER_SECRET` are set in Cloudflare; `DRIVER_SECRET` is currently hard-coded in `docs/driver.html` (dev-stage trade-off).

## Working preferences and design rules

Carried over from the music app; they apply here too.

How we work together:

- Be concise, plain language, no jargon. Synopsis first, details after.
- Ask before coding. Talk through the plan first; don't jump straight to building.
- One question at a time. Never dump a question right after a big block of text; say questions are coming, then ask them one by one in plain text.
- No praise or filler. Verify facts before stating them; don't guess from memory.
- After a batch of edits to push, give a short commit summary: title, bullets, files touched, and whether a backend/database change is needed.

How we build:

- Prefer explicit user controls over automated or inferred behavior. (Sharing on/off is always Penny's tap.)
- No temporary stand-ins. If a feature waits on something not built yet, build the final version now and leave it dormant, don't make a throwaway interim.
- Keep scope pragmatic; defer complexity (e.g., custom domain) to later phases.
- Iterative design: produce interactive HTML mockups for review before building.

UI / UX and copy:

- Contrast check every time. Before placing any text, popup, toast, or tile, check what's behind it. Never light-on-light or dark-on-dark.
- Toasts and confirmation popups must be on-brand, compact, and specific (name the actual thing, place, or time), never a vague empty box.
- Show complete information, not partial. Don't show half and make the user guess the rest (e.g. show the location AND "updated N min ago").
- No em dashes in user-facing copy. Use commas, periods, or "and."
- Check actual on-screen pixel alignment when things are meant to line up, not just that the math looks right.
- Read this design section before any UI work.

## Tools

- OwnTracks (iOS GPS tracking)
- Cloudflare Workers + D1
- GitHub Pages
- Leaflet.js + OpenStreetMap
