// Adds the cross-origin isolation headers the emulator needs (SharedArrayBuffer, and the
// threaded wasm build) to every response this site serves. They are added here rather than by
// the server, so the games run on any plain static host -- a CDN, a shared drive, GitHub Pages
// -- instead of one configured to send COOP and COEP.
//
// Isolation is decided when a document is created, so the first visit is never isolated: coi.js
// registers this worker and reloads once, and the reload is served through here.
const COOP = 'same-origin';
const COEP = 'require-corp';
const CORP = 'same-origin';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Only GETs are rewritten: everything the player needs is fetched that way, and a request with
  // a body or another method must reach the network untouched.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(isolated(request));
});

async function isolated(request) {
  let response;
  try {
    response = await send(request);
  } catch (error) {
    // The host closed the socket mid-request: a server that is not running, one that was just
    // restarted, or a reset on a multi-gigabyte Range read of the disc. Answering here keeps the
    // failure out of the page as an uncaught "Failed to fetch" and says what actually happened.
    return unreachable(request, error);
  }
  // Opaque and error responses have no usable headers to copy.
  if (response.type === 'opaque' || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', COOP);
  headers.set('Cross-Origin-Embedder-Policy', COEP);
  headers.set('Cross-Origin-Resource-Policy', CORP);
  // Partial responses keep their Content-Range: the disc is streamed with Range requests.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// A reset connection is usually transient -- the host is busy streaming a disc, or the server was
// restarted a moment ago -- so retry a few times before giving up. The request is a GET, so it has
// no disturbed body and can be replayed through fetch().
const DELAYS = [150, 400, 900, 2000];

async function send(request) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(request);
    } catch (error) {
      if (attempt >= DELAYS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, DELAYS[attempt]));
    }
  }
}

function unreachable(request, error) {
  console.warn('[sw] ' + request.url + ' could not be fetched: ' + error);
  if (request.mode !== 'navigate') return Response.error();
  const page = `<!doctype html>
<meta charset="utf-8">
<title>Could not reach the game files</title>
<style>
 body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d12;
        color: #e8ecf5; font: 16px/1.55 system-ui, -apple-system, Segoe UI, sans-serif; }
 main { max-width: 34rem; padding: 2rem; }
 h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
 code { background: #171b24; padding: .15rem .4rem; border-radius: 4px; }
 p { margin: .6rem 0; color: #b9c2d4; }
</style>
<main>
 <h1>Could not reach the game files</h1>
 <p>The page loaded, but the files it streams from (the disc image and the emulator wasm) did
    not answer. That usually means the file server stopped.</p>
 <p>Start it again with <code>python C:\\ps2-web\\serve.py</code>. This page checks again every
    four seconds and loads the game as soon as the files answer.</p>
 <p style="color:#6f7a90" id=retry>${new URL(request.url).pathname}</p>
</main>
<script>
  // Nothing to do but wait: the worker keeps serving this page until the host answers again.
  setInterval(function () { location.reload(); }, 4000);
</script>`;
  return new Response(page, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': COOP,
      'Cross-Origin-Embedder-Policy': COEP,
    },
  });
}
