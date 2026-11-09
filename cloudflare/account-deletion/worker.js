const FIREBASE_PROJECT_ID = "chater-8f834";
const ALLOWED_ORIGIN = "https://henrymeraldcompany-bit.github.io";
const CLOUDINARY_CLOUD_NAME = "amzak6nf";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS, GET",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-max-age": "86400",
      "vary": "Origin",
      "cache-control": "no-store",
    },
  });
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

async function getFirebaseJwks() {
  if (cachedJwks && Date.now() - cachedJwksAt < 60 * 60 * 1000) return cachedJwks;
  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error("Firebase signing keys are temporarily unavailable.");
  cachedJwks = await response.json();
  cachedJwksAt = Date.now();
  return cachedJwks;
}

async function verifyFirebaseToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in token.");
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported sign-in token.");
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.aud !== FIREBASE_PROJECT_ID ||
    claims.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 60 ||
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time > now + 60 ||
    now - claims.auth_time > 10 * 60 ||
    claims.email_verified !== true
  ) {
    throw new Error("Your sign-in session is not recent or verified. Sign in again and retry.");
  }

  const jwks = await getFirebaseJwks();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    cachedJwks = undefined;
    const refreshed = await getFirebaseJwks();
    const refreshedKey = refreshed.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!refreshedKey) throw new Error("The sign-in token could not be verified.");
    return verifySignature(parts, refreshedKey, claims);
  }
  return verifySignature(parts, jwk, claims);
}

async function verifySignature(parts, jwk, claims) {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
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

function cloudinaryAuth(env) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary server credentials have not been configured.");
  }
  return "Basic " + btoa(env.CLOUDINARY_API_KEY + ":" + env.CLOUDINARY_API_SECRET);
}

async function cloudinaryRequest(env, path, options = {}) {
  const response = await fetch("https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + path, {
    method: options.method || "GET",
    headers: {
      authorization: cloudinaryAuth(env),
      ...(options.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || "Cloudinary media cleanup failed.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function listFolderAssets(env, folder) {
  const assets = [];
  let cursor;
  do {
    const query = new URLSearchParams({ asset_folder: folder, max_results: "500" });
    if (cursor) query.set("next_cursor", cursor);
    const data = await cloudinaryRequest(env, "/resources/by_asset_folder?" + query.toString());
    const page = Array.isArray(data.resources) ? data.resources : [];
    for (const asset of page) {
      if (asset.asset_folder !== folder) {
        throw new Error("Cloudinary returned an asset outside the requested account folder. Cleanup was stopped.");
      }
      if (
        (asset.resource_type === "image" || asset.resource_type === "video") &&
        typeof asset.public_id === "string" &&
        asset.public_id.length > 0
      ) {
        assets.push({
          public_id: asset.public_id,
          resource_type: asset.resource_type,
          type: ["upload", "private", "authenticated", "fetch"].includes(asset.type) ? asset.type : "upload",
        });
      }
    }
    cursor = data.next_cursor;
    if (assets.length > 10000) throw new Error("This account has too many media files for one safe deletion request.");
  } while (cursor);
  return assets;
}

async function listLegacyPrefixAssets(env, folder) {
  const assets = [];
  for (const resourceType of ["image", "video"]) {
    let cursor;
    do {
      const query = new URLSearchParams({ prefix: folder + "/", max_results: "500" });
      if (cursor) query.set("next_cursor", cursor);
      const data = await cloudinaryRequest(env, "/resources/" + resourceType + "/upload?" + query.toString());
      for (const asset of Array.isArray(data.resources) ? data.resources : []) {
        if (
          typeof asset.public_id === "string" &&
          asset.public_id.startsWith(folder + "/")
        ) {
          assets.push({ public_id: asset.public_id, resource_type: resourceType, type: "upload" });
        }
      }
      cursor = data.next_cursor;
      if (assets.length > 10000) throw new Error("This account has too many media files for one safe deletion request.");
    } while (cursor);
  }
  return assets;
}

async function deleteCloudinaryAssets(env, assets) {
  const groups = new Map();
  for (const asset of assets) {
    const key = asset.resource_type + "/" + asset.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset.public_id);
  }

  let deletedCount = 0;
  for (const [key, publicIds] of groups) {
    const [resourceType, deliveryType] = key.split("/");
    for (let index = 0; index < publicIds.length; index += 100) {
      const batch = publicIds.slice(index, index + 100);
      const body = new URLSearchParams();
      for (const publicId of batch) body.append("public_ids[]", publicId);
      const result = await cloudinaryRequest(
        env,
        "/resources/" + resourceType + "/" + deliveryType,
        { method: "DELETE", body: body.toString() },
      );
      const outcomes = Object.values(result.deleted || {});
      if (outcomes.some((outcome) => outcome !== "deleted" && outcome !== "not_found")) {
        throw new Error("Cloudinary did not confirm deletion of every media file. Account deletion was stopped.");
      }
      deletedCount += outcomes.filter((outcome) => outcome === "deleted").length;
    }
  }
  return deletedCount;
}

async function handleMediaDeletion(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Sign-in is required." }, 401);

  let claims;
  try {
    claims = await verifyFirebaseToken(match[1]);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Sign-in verification failed." }, 401);
  }

  const uid = claims.sub;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return json({ error: "Invalid account identifier." }, 400);

  try {
    const folders = ["chater/profiles/" + uid, "chater/moments/" + uid];
    const allAssets = [];
    for (const folder of folders) {
      try {
        allAssets.push(...await listFolderAssets(env, folder));
      } catch (error) {
        if (error && error.status === 404) {
          allAssets.push(...await listLegacyPrefixAssets(env, folder));
        } else {
          throw error;
        }
      }
    }
    const unique = new Map();
    for (const asset of allAssets) {
      unique.set(asset.resource_type + "/" + asset.type + "/" + asset.public_id, asset);
    }
    const deleted = await deleteCloudinaryAssets(env, [...unique.values()]);
    return json({ success: true, deleted });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Cloudinary media cleanup failed.",
      accountDeletionSafeToRetry: true,
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "chater-account-deletion" });
    }
    if (request.method !== "POST" || url.pathname !== "/delete-media") {
      return json({ error: "Not found." }, 404);
    }
    return handleMediaDeletion(request, env);
  },
};
