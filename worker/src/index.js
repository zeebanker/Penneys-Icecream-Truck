// Pennys Truck - Cloudflare Worker
//
// One small program that answers four kinds of requests:
//   POST /owntracks  - Penny's phone posts her GPS here (secret-protected)
//   POST /share      - driver page turns sharing ON  (driver-secret-protected)
//   POST /disable    - driver page turns sharing OFF (driver-secret-protected)
//   GET  /state      - customer map asks where the truck is (public)
//
// Core rule: coordinates are ONLY ever sent to customers when sharing = 1.

// How far the truck must move (in meters) between two pings before we call it
// "moving". 50m absorbs the normal GPS wobble of a parked truck.
const MOVE_THRESHOLD_METERS = 50;

// Allow the public web pages to call this Worker from the browser.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Secret",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Browser preflight for cross-origin calls.
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (path === "/owntracks" && method === "POST") {
        return await handleOwntracks(request, env, url);
      }
      if (path === "/share" && method === "POST") {
        return await handleToggle(request, env, url, 1);
      }
      if (path === "/disable" && method === "POST") {
        return await handleToggle(request, env, url, 0);
      }
      if (path === "/verify" && method === "POST") {
        return await handleVerify(request, env, url);
      }
      if (path === "/state" && method === "GET") {
        return await handleState(env);
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: "server error", detail: String(err) }, 500);
    }
  },
};

// --- Endpoint handlers -----------------------------------------------------

// Penny's OwnTracks app posts her location here every few minutes.
async function handleOwntracks(request, env, url) {
  if (!secretOk(request, url, env.OWNTRACKS_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));

  // OwnTracks sends many message types; we only care about location reports.
  if (body._type && body._type !== "location") {
    return owntracksOk();
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!isFinite(lat) || !isFinite(lon)) {
    return json({ error: "missing lat/lon" }, 400);
  }

  // OwnTracks 'tst' is a Unix timestamp in seconds. Fall back to now.
  const when = Number(body.tst);
  const updatedAt = (isFinite(when) ? new Date(when * 1000) : new Date()).toISOString();

  // Compare against the previous position to decide moving vs. stationary.
  const prev = await env.DB.prepare(
    "SELECT lat, lon FROM truck_state WHERE id = 1"
  ).first();

  let moving = 1; // first ever ping (no prior position) defaults to moving
  if (prev && prev.lat != null && prev.lon != null) {
    const meters = distanceMeters(prev.lat, prev.lon, lat, lon);
    moving = meters > MOVE_THRESHOLD_METERS ? 1 : 0;
  }

  await env.DB.prepare(
    "UPDATE truck_state SET lat = ?, lon = ?, updated_at = ?, moving = ? WHERE id = 1"
  ).bind(lat, lon, updatedAt, moving).run();

  return owntracksOk();
}

// OwnTracks expects the HTTP response body to be a JSON ARRAY of messages to
// deliver back to the phone (empty = nothing for you). Returning a plain object
// makes the Android client throw "Failed to parse JSON" and re-queue the message,
// which stalls further publishes. iOS is lenient about this; Android is not.
// We never send commands to the phone, so always reply with an empty array.
function owntracksOk() {
  return json([]);
}

// The driver page flips sharing on (value = 1) or off (value = 0).
async function handleToggle(request, env, url, value) {
  if (!secretOk(request, url, env.DRIVER_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  await env.DB.prepare(
    "UPDATE truck_state SET sharing = ? WHERE id = 1"
  ).bind(value).run();
  return json({ status: "ok", sharing: value });
}

// The driver page checks whether a code is valid, WITHOUT changing anything.
// Lets the passphrase entry give instant "code is right / wrong" feedback.
async function handleVerify(request, env, url) {
  if (!secretOk(request, url, env.DRIVER_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  return json({ ok: true });
}

// The customer map asks: where is the truck, and is sharing on?
async function handleState(env) {
  const row = await env.DB.prepare(
    "SELECT lat, lon, updated_at, sharing, moving FROM truck_state WHERE id = 1"
  ).first();

  // Sharing off (or no row yet): reveal nothing but the status.
  if (!row || row.sharing !== 1) {
    return json({ sharing: 0 });
  }

  // Sharing on but no location has ever come in.
  if (row.lat == null || row.lon == null) {
    return json({ sharing: 1, lat: null, lon: null, updated_at: null, moving: row.moving });
  }

  return json({
    sharing: 1,
    lat: row.lat,
    lon: row.lon,
    updated_at: row.updated_at,
    moving: row.moving,
  });
}

// --- Helpers ---------------------------------------------------------------

// Accept the secret from any of: Authorization: Bearer <s>, HTTP Basic auth
// password, an X-Secret header, or a ?secret= query param. This lets both
// OwnTracks (Basic auth) and simple test tools (curl) authenticate.
function secretOk(request, url, expected) {
  if (!expected) return false; // secret not configured = deny

  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    if (auth.slice(7).trim() === expected) return true;
  }
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6).trim()); // "user:password"
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (password === expected) return true;
    } catch (_) { /* ignore malformed header */ }
  }
  if (request.headers.get("X-Secret") === expected) return true;
  if (url.searchParams.get("secret") === expected) return true;

  return false;
}

// Great-circle distance between two lat/lon points, in meters (haversine).
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
