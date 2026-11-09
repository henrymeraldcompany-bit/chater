# Chater account-deletion Worker

This Worker removes only Cloudinary media in the authenticated Firebase user's Chater folders before the frontend removes their Firestore profile and Firebase Auth account.

## Fixed configuration

- Firebase project: `chater-8f834`
- Allowed browser origin: `https://henrymeraldcompany-bit.github.io`
- Cloudinary cloud: `amzak6nf`
- Folders: `chater/profiles/{uid}` and `chater/moments/{uid}`

## Required Worker secrets

Configure these as Cloudflare Worker secrets (never as plain variables and never in the frontend):

- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Do not put either value in GitHub, source code, a browser build, or a chat message.

## Routes

- `GET /health` — non-sensitive health check.
- `POST /delete-media` — requires `Authorization: Bearer <Firebase ID token>`; verifies the token signature, Firebase project, verified email, and recent authentication before deleting only the caller's profile and Moment media.

The Worker must be deployed as `chater-account-deletion` on the `henrymeraldcompany` workers.dev subdomain. The frontend calls `/delete-media` after password reauthentication and before Firestore/Firebase account deletion.

## Safety behavior

If token verification or Cloudinary cleanup fails, the Worker returns an error and the frontend must stop account deletion. It never accepts a user ID or folder path from the request body. It derives both folders from the verified Firebase token subject.
