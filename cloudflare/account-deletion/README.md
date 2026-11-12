# Chater account-deletion Worker

This Worker removes only Cloudinary media in the authenticated Firebase user's Chater folders before the frontend removes their Firestore profile and Firebase Auth account.

## Fixed configuration

- Worker name: `chater-account-deletion`
- Firebase project: `chater-8f834`
- Allowed browser origin: `https://henrymeraldcompany-bit.github.io`
- Cloudinary cloud: `amzak6nf`
- Folders: `chater/profiles/{uid}` and `chater/moments/{uid}`

## Required Worker secrets

Configure these as Cloudflare Worker secrets (never as plain variables and never in the frontend):

- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Do not put either value in GitHub, source code, a browser build, or a chat message.

## Deploy through the Cloudflare dashboard

The Worker has now been created through the Cloudflare API as a separate Worker named `chater-account-deletion`. No existing GOZIE or Henry Worker was modified. Its deployed entry point is `worker.js`, with compatibility date `2026-11-09` and observability enabled.

## Required next step: add Cloudinary secrets

1. Open **Workers & Pages** in Cloudflare and select `chater-account-deletion`.
2. Open **Settings → Variables and Secrets**.
3. Add `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` as **Secret** values. Obtain them from the Cloudinary Console → Settings → Access Keys. Enter them privately in Cloudflare; never paste them into GitHub or ChatGPT.
4. Save/deploy the secret changes.
5. Open `https://chater-account-deletion.henrymeraldcompany.workers.dev/health`. It should return JSON with `ok: true`.

The Chater frontend has been updated to call `/delete-media` after password reauthentication and before removing Firestore or Firebase Auth records. Wallpaper uploads use the verified UID as a public-ID prefix so this Worker can also delete general and per-chat wallpaper images. If the Worker cannot confirm media cleanup, account deletion stops so it can be retried. Do not test `POST /delete-media` against a real account until the secrets are configured and the health check succeeds.

## Routes

- `GET /health` — non-sensitive health check.
- `POST /delete-media` — requires `Authorization: Bearer <Firebase ID token>`; verifies the token signature, Firebase project, verified email, and recent authentication before deleting only the caller's profile and Moment media.

The frontend must call `/delete-media` after password reauthentication and before Firestore/Firebase account deletion.

## Safety behavior

If token verification or Cloudinary cleanup fails, the Worker returns an error and the frontend must stop account deletion. It never accepts a user ID or folder path from the request body. It derives both folders from the verified Firebase token subject.
