# Chater Cloudflare R2 media Worker

This Worker is the single media gateway for Chater. It replaces all direct Cloudinary uploads and keeps the R2 bucket private behind an R2 binding.

## Account setup blocker

The Cloudflare account currently returns API error **10042: "Please enable R2 through the Cloudflare Dashboard."** The R2 service must be activated once in the Cloudflare dashboard before the bucket and Worker binding can be created. Do not switch the production frontend to this Worker before activation and deployment.

## Planned resource names

- Worker: `chater-media`
- Worker URL: `https://chater-media.henrymeraldcompany.workers.dev`
- R2 bucket: `chater-media`
- R2 binding: `MEDIA`
- Firebase project: `chater-8f834`
- Allowed app origin: `https://henrymeraldcompany-bit.github.io`

## Worker behavior

- `GET /health`: non-sensitive deployment and bucket-binding check.
- `POST /upload`: requires a verified Firebase ID-token signature. The Worker derives the owner UID from the token and never accepts a user ID or object key from the browser.
- `GET /media/{objectKey}`: streams public Chater media through the Worker. The bucket itself remains private; the Worker is the only delivery path.
- `POST /delete-account-media`: requires a recently authenticated, email-verified Firebase account and deletes only `users/{token-subject}/` objects.
- `DELETE /object`: deletes one object only when its key belongs to the authenticated account.

Supported uploads:

| Chater use | Category | Limit |
|---|---|---:|
| Profile picture | `profile` | 5 MB |
| General wallpaper | `wallpaper`, scope `general` | 8 MB |
| Personal chat wallpaper | `wallpaper`, scope `chat` | 8 MB |
| Moment image, video, audio | `moment` | 50 MB |

Allowed formats: JPEG, PNG, WebP, GIF, MP4, WebM, QuickTime MOV, MP3, M4A, AAC, OGG, WAV and WebA.

## R2 binding

When R2 is enabled and the bucket exists, bind it to this Worker using:

- Binding name: `MEDIA`
- Bucket name: `chater-media`

No R2 S3 access key or secret is exposed to the frontend. The Worker uses a native R2 bucket binding.

## Deploy

Upload `worker.js` as a module Worker named `chater-media`, with the R2 binding above and Workers.dev enabled. Set compatibility date to `2026-11-12`. The Worker uses the Cloudflare Workers runtime and Web Crypto; it does not need a Node compatibility flag or third-party package.

After deployment, check:

`https://chater-media.henrymeraldcompany.workers.dev/health`

Expected response:

`{"ok":true,"storage":"cloudflare-r2","bucketConfigured":true}`

Do not merge the application-side R2 cutover until this health check succeeds and a real authenticated upload/download/delete test has passed.

## Security notes

- Firebase ID tokens are signature-verified against Google's Secure Token JWKS.
- Upload object prefixes are always derived from the verified Firebase UID.
- The R2 bucket should not be made public and no S3 credentials belong in browser code.
- Media URLs are public through the Worker, matching the current public profile/Moment-image behavior. The R2 bucket itself stays private.
- Account deletion paginates through only the authenticated UID prefix and deletes in bounded batches.
