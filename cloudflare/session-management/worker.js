const PROJECT_ID = "chater-8f834";
const ALLOWED_ORIGIN = "https://henrymeraldcompany-bit.github.io";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SESSION_COLLECTION = "users";

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-max-age": "86400",
      "vary": "Origin",
      "cache-control": "no-store",
    },
  });
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlJson(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

let cachedJwks;
let cachedJwksAt = 0;
let cachedGoogleToken;
let cachedGoogleTokenAt = 0;

async function getFirebaseJwks() {
  if (cachedJwks && Date.now() - cachedJwksAt < 60 * 60 * 1000) return cachedJwks;
  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error("Firebase signing keys are temporarily unavailable.");
  cachedJwks = await response.json();
  cachedJwksAt = Date.now();
  return cachedJwks;
}

async function verifyFirebaseToken(token, requireRecent = false) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in token.");
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    claims.aud !== PROJECT_ID ||
    claims.iss !== "https://securetoken.google.com/" + PROJECT_ID ||
    typeof claims.sub !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub) ||
    !Number.isFinite(claims.exp) || claims.exp <= now ||
    !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
    !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60 ||
    claims.email_verified !== true ||
    (requireRecent && now - claims.auth_time > 10 * 60)
  ) {
    throw new Error(requireRecent
      ? "For security, sign in again before signing out all devices."
      : "Your verified sign-in session is invalid or expired. Sign in again.");
  }

  const jwks = await getFirebaseJwks();
  let jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    cachedJwks = undefined;
    const refreshed = await getFirebaseJwks();
    jwk = refreshed.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
  }
  if (!jwk) throw new Error("The sign-in token could not be verified.");

  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]),
  );
  if (!valid) throw new Error("The sign-in token could not be verified.");
  return claims;
}

function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getGoogleAccessToken(env) {
  if (cachedGoogleToken && Date.now() - cachedGoogleTokenAt < 50 * 60 * 1000) return cachedGoogleToken;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("The Firebase service-account secret has not been configured in Cloudflare.");
  }

  let serviceAccount;
  try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error("The Firebase service-account secret is not valid JSON."); }

  if (
    serviceAccount.project_id !== PROJECT_ID ||
    typeof serviceAccount.client_email !== "string" ||
    typeof serviceAccount.private_key !== "string"
  ) {
    throw new Error("The configured service account does not match the Chater Firebase project.");
  }

  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64UrlJson({ alg: "RS256", typ: "JWT" }) + "." + base64UrlJson({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(unsigned),
  );
  const assertion = unsigned + "." + base64UrlEncode(new Uint8Array(signature));
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error("Google rejected the service-account credential. Check its IAM roles and JSON key.");
  }
  cachedGoogleToken = data.access_token;
  cachedGoogleTokenAt = Date.now();
  return cachedGoogleToken;
}

async function firestoreRequest(env, path, options = {}) {
  const accessToken = await getGoogleAccessToken(env);
  const response = await fetch(FIRESTORE_ROOT + path, {
    method: options.method || "GET",
    headers: {
      authorization: "Bearer " + accessToken,
      "content-type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || "Firestore session storage request failed.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function sessionDocumentPath(uid, sessionId) {
  return `/${SESSION_COLLECTION}/${uid}/sessions/${sessionId}`;
}

function stringField(fields, name) {
  return fields?.[name]?.stringValue || "";
}

function timestampField(fields, name) {
  return fields?.[name]?.timestampValue || "";
}

async function readSession(env, uid, sessionId) {
  try {
    return await firestoreRequest(env, sessionDocumentPath(uid, sessionId));
  } catch (error) {
    if (error && error.status === 404) return null;
    throw error;
  }
}

async function writeSession(env, uid, sessionId, values, clearRevoked = false) {
  const fields = {};
  for (const [key, value] of Object.entries(values)) {
    fields[key] = typeof value === "string" ? { stringValue: value } : { timestampValue: value };
  }
  const mask = Object.keys(fields);
  if (clearRevoked) mask.push("revokedAt");
  const query = new URLSearchParams();
  for (const field of mask) query.append("updateMask.fieldPaths", field);
  return firestoreRequest(env, sessionDocumentPath(uid, sessionId) + "?" + query.toString(), {
    method: "PATCH",
    body: { fields },
  });
}

async function listUserSessions(env, uid) {
  const sessions = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const data = await firestoreRequest(env, `/${SESSION_COLLECTION}/${uid}/sessions?${query.toString()}`);
    for (const document of data.documents || []) {
      const id = document.name.split("/").pop();
      const fields = document.fields || {};
      sessions.push({
        id,
        deviceName: stringField(fields, "deviceName") || "Unknown device",
        platform: stringField(fields, "platform") || "Unknown platform",
        userAgent: stringField(fields, "userAgent"),
        createdAt: timestampField(fields, "createdAt"),
        lastSeenAt: timestampField(fields, "lastSeenAt"),
        revoked: Boolean(fields.revokedAt?.timestampValue),
      });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return sessions;
}

async function markAllSessionsRevoked(env, uid, revokedAt) {
  const sessions = await listUserSessions(env, uid);
  for (const session of sessions) {
    await writeSession(env, uid, session.id, { revokedAt });
  }
  return sessions.length;
}

async function handleRequest(request, env, url) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Sign-in is required." }, 401);

  const pathname = url.pathname;
  const requireRecent = pathname === "/sessions/revoke-all";
  let claims;
  try { claims = await verifyFirebaseToken(match[1], requireRecent); }
  catch (error) {
    return json({ error: error instanceof Error ? error.message : "Sign-in verification failed." }, 401);
  }

  const uid = claims.sub;

  try {
    if (pathname === "/sessions/register" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const sessionId = body.sessionId;
      if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(sessionId)) {
        return json({ error: "Invalid device session identifier." }, 400);
      }
      const existing = await readSession(env, uid, sessionId);
      const now = new Date().toISOString();
      await writeSession(env, uid, sessionId, {
        deviceName: typeof body.deviceName === "string" ? body.deviceName.slice(0, 80) : "Chater device",
        platform: typeof body.platform === "string" ? body.platform.slice(0, 40) : "Unknown platform",
        userAgent: (request.headers.get("user-agent") || "").slice(0, 240),
        createdAt: existing ? timestampField(existing.fields, "createdAt") || now : now,
        lastSeenAt: now,
      }, true);
      return json({ success: true, sessionId });
    }

    if (pathname === "/sessions/list" && request.method === "GET") {
      const sessions = await listUserSessions(env, uid);
      return json({ success: true, sessions });
    }

    if (pathname === "/sessions/check" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const sessionId = body.sessionId;
      if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(sessionId)) {
        return json({ error: "Invalid device session identifier." }, 400);
      }
      const document = await readSession(env, uid, sessionId);
      const fields = document?.fields || {};
      return json({
        success: true,
        registered: Boolean(document),
        revoked: Boolean(fields.revokedAt?.timestampValue),
      });
    }

    if (pathname === "/sessions/revoke-all" && request.method === "POST") {
      const accessToken = await getGoogleAccessToken(env);
      const revokedAt = new Date().toISOString();
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + accessToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({ localId: uid, validSince: String(Math.floor(Date.now() / 1000)) }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error?.message || "Firebase could not revoke the account sessions.");
      }
      const marked = await markAllSessionsRevoked(env, uid, revokedAt);
      return json({
        success: true,
        revokedSessions: marked,
        message: "All Firebase refresh tokens have been revoked. Sign in again on this device.",
      });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Session management request failed.",
    }, error && error.status >= 400 && error.status < 500 ? error.status : 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "chater-session-management" });
    }
    return handleRequest(request, env, url);
  },
};