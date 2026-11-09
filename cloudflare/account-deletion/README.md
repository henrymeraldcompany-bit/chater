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

The connected Cloudflare API session did not permit the automated Worker deployment, so the Worker source is committed here but has not been deployed. To deploy it safely:

1. Open the Cloudflare dashboard and go to **Workers & Pages**.
2. Create a new Worker named exactly `chater-account-deletion`. Do not edit or replace any existing GOZIE or Henry Worker.
3. Open the new Worker’s code editor and replace its starter code with the complete contents of `worker.js` in this folder. Save and deploy.
4. Open the Worker’s **Settings → Variables and Secrets**.
5. Add `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` as **Secret** values. Enter them privately in Cloudflare; never paste them into GitHub or ChatGPT.
6. Under **Settings → Domains & Routes**, enable its `workers.dev` subdomain. The expected URL is `https://chater-account-deletion.henrymeraldcompany.workers.dev`.
7. Test `GET https://chater-account-deletion.henrymeraldcompany.workers.dev/health`. It should return JSON with `ok: true`.

Do not test `POST /delete-media` using a real account until the frontend integration and account-deletion test are ready.

## Routes

- `GET /health` — non-sensitive health check.
- `POST /delete-media` — requires `Authorization: Bearer <Firebase ID token>`; verifies the token signature, Firebase project, verified email, and recent authentication before deleting only the caller's profile and Moment media.

The frontend must call `/delete-media` after password reauthentication and before Firestore/Firebase account deletion.

## Safety behavior

If token verification or Cloudinary cleanup fails, the Worker returns an error and the frontend must stop account deletion. It never accepts a user ID or folder path from the request body. It derives both folders from the verified Firebase token subject.
