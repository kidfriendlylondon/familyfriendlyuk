// Geolocation helpers shared by the home and city maps. The browser API
// has a few sharp edges that this module smooths over:
//
//  * The Permissions API is queried before getCurrentPosition so we can
//    distinguish "browser blocked location" from "couldn't get a fix".
//  * If the first call fails with PERMISSION_DENIED but Permissions API
//    has since resolved to "granted" (the user just clicked allow on the
//    browser prompt), we retry once.
//  * Postcode entry is offered as a manual fallback.

export type LocateOutcome =
  | { kind: 'success'; lat: number; lng: number }
  | { kind: 'blocked' }
  | { kind: 'failed' };

type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

async function getPermissionState(): Promise<PermState> {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

function getCurrentPositionOnce(): Promise<LocateOutcome> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ kind: 'failed' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ kind: 'success', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => resolve({ kind: err.code === err.PERMISSION_DENIED ? 'blocked' : 'failed' }),
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
    );
  });
}

export async function locateUser(): Promise<LocateOutcome> {
  const state = await getPermissionState();
  if (state === 'denied') return { kind: 'blocked' };

  const first = await getCurrentPositionOnce();
  if (first.kind === 'success') return first;

  // Retry once when the first attempt was denied but the permission has
  // since resolved to "granted" — the user can take a moment to click
  // through the browser prompt and hit our error path before allowing.
  if (first.kind === 'blocked') {
    const after = await getPermissionState();
    if (after === 'granted') return await getCurrentPositionOnce();
  }
  return first;
}

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function looksLikeUkPostcode(s: string): boolean {
  return UK_POSTCODE_RE.test((s ?? '').trim());
}

export async function geocodePostcode(
  postcode: string,
  token: string
): Promise<{ lat: number; lng: number } | null> {
  const cleaned = (postcode ?? '').trim();
  if (!cleaned || !token) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json` +
    `?country=GB&types=postcode&limit=1&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data?.features?.[0];
    if (!f?.center || f.center.length < 2) return null;
    const [lng, lat] = f.center;
    return { lng, lat };
  } catch {
    return null;
  }
}
