/**
 * "This user has finished onboarding" — remembered in a signed, HTTP-only
 * cookie so the middleware doesn't query `profiles` on every request.
 *
 * Value: `<userId>.<expiresAtEpochSec>.<base64url HMAC-SHA256>`. It's bound to
 * one user and expires after ONBOARDED_TTL_SECONDS, after which the next
 * request re-checks the database and re-issues it. Actions that drop the
 * current user back to onboarding (deleting their org, leaving a team,
 * deleting their account) clear it immediately.
 *
 * Other users whose status changes (a deleted org's members, a removed
 * teammate) can't have their cookie cleared from here — but that's harmless:
 * every app page already sends someone with no membership to /onboarding, and
 * RLS scopes all data. This cookie only ever skips a redirect; it grants
 * nothing. It's signed anyway so it can't be forged.
 *
 * Web Crypto only, so it works in the middleware runtime and in server code.
 */

export const ONBOARDED_COOKIE = "onboarded";
export const ONBOARDED_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

let keyPromise: Promise<CryptoKey | null> | null = null;

/** HMAC key. COOKIE_SECRET when set; otherwise derived from the service-role
 *  key (server-only, present in every deploy). Null = can't sign → no caching. */
function signingKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    const secret = process.env.COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    keyPromise = secret
      ? crypto.subtle.importKey(
          "raw",
          // Domain-separated so the derived key is only ever good for this cookie.
          encoder.encode(`onboarded-cookie:v1:${secret}`),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"],
        )
      : Promise.resolve(null);
  }
  return keyPromise;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** A fresh signed cookie value for this user, or null if signing isn't possible. */
export async function signOnboardedCookie(userId: string): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + ONBOARDED_TTL_SECONDS}`;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** True only for an unexpired cookie, signed by us, for exactly this user. */
export async function verifyOnboardedCookie(
  value: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!value) return false;
  const [id, exp, sig] = value.split(".");
  if (!id || !exp || !sig || id !== userId) return false;
  if (!(Number(exp) > Date.now() / 1000)) return false;
  const key = await signingKey();
  const sigBytes = fromBase64Url(sig);
  if (!key || !sigBytes) return false;
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(`${id}.${exp}`));
}
