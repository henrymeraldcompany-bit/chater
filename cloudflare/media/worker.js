const FIREBASE_PROJECT_ID = "chater-8f834";
const ALLOWED_ORIGIN = "https://henrymeraldcompany-bit.github.io";
const PUBLIC_MEDIA_BASE = "https://chater-media.henrymeraldcompany.workers.dev";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "weba",
};

const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const MAX_WALLPAPER_BYTES = 8 * 1024 * 1024;
const MAX_MOMENT_BYTES = 50 * 1024 * 1024;

function isAllowedOrigin(origin) {
  return !origin ||
    origin === ALLOWED_ORIGIN ||
    origin === "http://localhost:5173" ||
    origin === "http://127.0.0.1:5173";
}

function corsHeaders(origin, publicMedia = false) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, HEAD, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, X-Chater-Media-Category, X-Chater-Media-Scope, X-Chater-Conversation-Id",
    "access-control-max-age": "86400",
    "vary": "Origin",
  });
  if (publicMedia) {
    headers.set("access-control-allow-origin", "*");
  } else if (origin && isAllowedOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
  } else if (!origin) {
    headers.set("access-control-allow-origin", ALLOWED_ORIGIN);
  }
  return headers;
}

function json(data, status = 200, origin = null) {
  const headers = corsHeaders(origin);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

let cachedJwks;
let cachedJwksAt = 0;

async function getFirebaseJwks() {
  if (cachedJwks && Date.now() - cachedJwksAt < 60 * 60 * 1000) return cachedJwks;
  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error("Firebase signing keys are temporarily unavailable.");
  cachedJwks = await response.json();
  cachedJwksAt = Date.now();
  return cachedJwks;
}

async function verifyFirebaseToken(token, requireRecentAuth = false) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in token.");
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Unsupported sign-in token.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.aud !== FIREBASE_PROJECT_ID ||
    claims.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID ||
    typeof claims.sub !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub) ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 60 ||
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time > now + 60
  ) {
    throw new Error("Your Chater sign-in session is invalid or expired. Sign in again.");
  }
  if (requireRecentAuth && (
    claims.email_verified !== true ||
    now - claims.auth_time > 15 * 60
  )) {
    throw new Error("Please verify your email and sign in again before deleting your media.");
  }

  let jwks = await getFirebaseJwks();
  let jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    cachedJwks = undefined;
    jwks = await getFirebaseJwks();
    jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
  }
  if (!jwk) throw new Error("The sign-in token could not be verified.");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]),
  );
  if (!valid) throw new Error("The sign-in token could not be verified.");
  return claims;
}

async function requireUser(request, origin, requireRecentAuth = false) {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return { response: json({ error: "Sign in to continue." }, 401, origin) };
  try {
    const claims = await verifyFirebaseToken(match[1], requireRecentAuth);
    return { uid: claims.sub };
  } catch (error) {
    return {
      response: json(
        { error: error instanceof Error ? error.message : "Sign-in verification failed." },
        401,
        origin,
      ),
    };
  }
}

function safeConversationId(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    /^[A-Za-z0-9_%-]+$/.test(value);
}

function mediaObjectKey(uid, category, scope, conversationId, extension) {
  const filename = crypto.randomUUID() + "." + extension;
  if (category === "profile") return "users/" + uid + "/profile/" + filename;
  if (category === "moment") return "users/" + uid + "/moments/" + filename;
  if (category === "wallpaper" && scope === "general") {
    return "users/" + uid + "/wallpapers/general/" + filename;
  }
  if (category === "wallpaper" && scope === "chat" && safeConversationId(conversationId)) {
    return "users/" + uid + "/wallpapers/chats/" + conversationId + "/" + filename;
  }
  throw new Error("Choose a valid Chater media category.");
}

function publicMediaUrl(key) {
  return PUBLIC_MEDIA_BASE + "/media/" + key.split("/").map(encodeURIComponent).join("/");
}

async function uploadMedia(request, env, origin) {
  if (!env.MEDIA) return json({ error: 'Chater media storage is not configured yet.' }, 503, origin);
  const authenticated = await requireUser(request, origin);
  if (authenticated.response) return authenticated.response;

  const category = request.headers.get('x-chater-media-category') || '';
  const scope = request.headers.get('x-chater-media-scope') || '';
  const conversationId = request.headers.get('x-chater-conversation-id') || '';
  const mimeType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const extension = Object.hasOwn(MIME_EXTENSIONS, mimeType) ? MIME_EXTENSIONS[mimeType] : undefined;
  const contentLength = Number(request.headers.get('content-length'));

  if (!['profile', 'moment', 'wallpaper'].includes(category)) {
    return json({ error: 'Choose a valid Chater media category.' }, 400, origin);
  }
  if (!extension) {
    return json({ error: 'This image, video or audio format is not supported.' }, 415, origin);
  }
  if (!request.body || !Number.isSafeInteger(contentLength) || contentLength < 1) {
    return json({ error: 'The upload must include a readable file and a valid content length.' }, 411, origin);
  }

  const isImage = mimeType.startsWith('image/');
  if (category === 'profile' && (!isImage || contentLength > MAX_PROFILE_BYTES)) {
    return json({ error: 'Profile pictures must be JPG, PNG, WebP or GIF and no larger than 5 MB.' }, 413, origin);
  }
  if (category === 'wallpaper' && (!isImage || contentLength > MAX_WALLPAPER_BYTES)) {
    return json({ error: 'Chat wallpapers must be JPG, PNG, WebP or GIF and no larger than 8 MB.' }, 413, origin);
  }
  if (category === 'moment' && contentLength > MAX_MOMENT_BYTES) {
    return json({ error: 'Moments must be 50 MB or smaller.' }, 413, origin);
  }

  let key;
  try {
    key = mediaObjectKey(authenticated.uid, category, scope, conversationId, extension);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid upload details.' }, 400, origin);
  }

  try {
    await env.MEDIA.put(key, request.body, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        owner: authenticated.uid,
        category,
        uploadedAt: new Date().toISOString(),
      },
    });
    return json({ success: true, url: publicMediaUrl(key), objectKey: key }, 201, origin);
  } catch {
    return json({ error: 'Cloudflare R2 could not save this file. Check your connection and retry.' }, 502, origin);
  }
}

function decodeMediaKey(pathname) {
  const raw = pathname.slice("/media/".length);
  if (!raw || raw.length > 1200) return null;
  try {
    const key = raw.split("/").map(decodeURIComponent).join("/");
    const allowed = new RegExp(
      "^users/[A-Za-z0-9_-]{1,128}/(?:profile/[A-Za-z0-9_.-]+|moments/[A-Za-z0-9_.-]+|wallpapers/(?:general/[A-Za-z0-9_.-]+|chats/[A-Za-z0-9_%-]{1,512}/[A-Za-z0-9_.-]+))$",
    );
    if (!allowed.test(key) || key.includes("..") || key.includes("//")) return null;
    return key;
  } catch {
    return null;
  }
}

async function serveMedia(request, env, url) {
  if (!env.MEDIA) return new Response("Media storage is unavailable.", { status: 503 });
  const key = decodeMediaKey(url.pathname);
  if (!key) return new Response("Not found.", { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", "inline");
  if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");

  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

async function deleteAccountMedia(request, env, origin) {
  if (!env.MEDIA) return json({ error: "Chater media storage is not configured yet." }, 503, origin);
  const authenticated = await requireUser(request, origin, true);
  if (authenticated.response) return authenticated.response;

  const prefix = "users/" + authenticated.uid + "/";
  let cursor;
  let deletedCount = 0;
  try {
    do {
      const page = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
      if (page.objects.length > 0) {
        const keys = page.objects.map(object => object.key);
        await env.MEDIA.delete(keys);
        deletedCount += keys.length;
      }
      cursor = page.truncated ? page.cursor : undefined;
      if (page.truncated && !cursor) throw new Error("R2 did not return a continuation cursor.");
    } while (cursor);
    return json({ success: true, deleted: deletedCount }, 200, origin);
  } catch {
    return json({
      error: "Cloudflare R2 could not confirm deletion of all your media. Your Chater account has not been deleted; please retry.",
      accountDeletionSafeToRetry: true,
    }, 502, origin);
  }
}

async function deleteOneMediaObject(request, env, origin) {
  if (!env.MEDIA) return json({ error: "Chater media storage is not configured yet." }, 503, origin);
  const authenticated = await requireUser(request, origin);
  if (authenticated.response) return authenticated.response;
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "Send a valid object key." }, 400, origin);
  }
  const key = body?.objectKey;
  if (
    typeof key !== "string" ||
    !key.startsWith("users/" + authenticated.uid + "/") ||
    key.includes("..") ||
    key.length > 1200
  ) {
    return json({ error: "You can only delete your own Chater media." }, 403, origin);
  }
  try {
    await env.MEDIA.delete(key);
    return json({ success: true }, 200, origin);
  } catch {
    return json({ error: "R2 could not delete this file. Please retry." }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (!isAllowedOrigin(origin)) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, storage: "cloudflare-r2", bucketConfigured: Boolean(env.MEDIA) }, 200, origin);
    }
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/media/")) {
      return serveMedia(request, env, url);
    }
    if (request.method === "POST" && url.pathname === "/upload") {
      return uploadMedia(request, env, origin);
    }
    if (request.method === "POST" && url.pathname === "/delete-account-media") {
      return deleteAccountMedia(request, env, origin);
    }
    if (request.method === "DELETE" && url.pathname === "/object") {
      return deleteOneMediaObject(request, env, origin);
    }
    return json({ error: "Not found." }, 404, origin);
  },
};
