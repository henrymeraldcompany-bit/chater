# Chater Cloudflare R2 media Worker

This Worker is the single media gateway for Chater. It serves profile pictures, Moments, and chat wallpapers from the private R2 bucket.

## Deployed resources

- Production Worker: `chater-media`
- Production Worker URL: `https://chater-media.henrymeraldcompany.workers.dev`
- R2 bucket: `chater-media`
- R2 binding: `MEDIA`
- Bucket location: `WEUR`
- Firebase project: `chater-8f834`
- Production app origin: `https://henrymeraldcompany-bit.github.io`

The production bucket and Worker were created and deployed on 2026-11-12. The Cloudflare API confirms that the production Worker has the `MEDIA` binding to the `chater-media` bucket. The branch preview uses a separate `chater-r2-test` Worker (also bound to the `chater-media` bucket). Keep the production Worker and production app unchanged until preview checks and the cutover are approved.

## Worker behavior

- `GET /health`: non-sensitive deployment and bucket-binding check.
- `POST /upload`: streams the raw browser `File` body directly into R2. The request uses `Content-Type`, `Content-Length`, `X-Chater-Media-Category`, and optional wallpaper scope/conversation headers. It requires a verified Firebase ID-token signature; the Worker derives the owner UID from the token and never accepts a user ID or object key from the browser.
- `GET /media/{objectKey}`: streams Chater media through the Worker. The bucket itself remains private; the Worker is the delivery path.
- `POST /delete-account-media`: requires a recently authenticated, email-verified Firebase account and deletes only `users/{token-subject}/` objects.
- `DELETE /object`: deletes one object only when its key belongs to the authenticated account.
- Scheduled expiry sweep: removes Moment media after its 24-hour lifetime. The preview/test Worker `chater-r2-test` is currently configured to run this sweep every 15 minutes. The production Worker `chater-media` is not yet updated; apply the same Worker code and Cron Trigger as part of the production cutover.

Supported uploads:

| Chater use | Category | Limit |
|---|---|---:|
| Profile picture | `profile` | 5 MB |
| General wallpaper | `wallpaper`, scope `general` | 8 MB |
| Personal chat wallpaper | `wallpaper`, scope `chat` | 8 MB |
| Moment image, video, audio | `moment` | 50 MB |

Allowed formats: JPEG, PNG, WebP, GIF, MP4, WebM, QuickTime MOV, MP3, M4A, AAC, OGG, WAV and WebA.

## R2 binding

The deployed Worker has this binding:

- Binding name: `MEDIA`
- Bucket name: `chater-media`

No R2 S3 access key or secret is exposed to the frontend. The Worker uses a native R2 bucket binding.

## Verification before frontend cutover

Open:

`https://chater-media.henrymeraldcompany.workers.dev/health`

Expected response:

`{"ok":true,"storage":"cloudflare-r2","bucketConfigured":true}`

Then verify from a signed-in Chater session:

1. Upload a profile picture and confirm the returned media URL displays.
2. Upload a Moment and confirm it appears and plays/displays; verify it disappears from the feed after 24 hours and its R2 file is removed by the scheduled sweep.
3. Upload a general wallpaper and a personal chat wallpaper.
4. Delete or replace media where the app supports it.
5. Confirm account media deletion succeeds only for the authenticated account.

Do not merge the application-side R2 cutover until the live health check, authenticated upload/download/delete checks, and Moment expiry checks succeed. Before production cutover, deploy the current Worker code to `chater-media`, configure its `*/15 * * * *` Cron Trigger, and change the production app media URL to that Worker. Keep the existing production app and Worker unchanged until then.

## Security notes

- Firebase ID tokens are signature-verified against Google's Secure Token JWKS.
- Upload object prefixes are always derived from the verified Firebase UID.
- Uploads stream directly from the browser through the Worker into R2; the Worker does not buffer a multipart form body in memory. Chater's largest Moment upload is 50 MB.
- The R2 bucket should not be made public and no S3 credentials belong in browser code.
- Media URLs are delivered through the Worker, matching the app's current profile/Moment media behavior. The R2 bucket itself stays private; anyone with a media URL can view that media.
- Account deletion paginates through only the authenticated UID prefix and deletes in bounded batches.
- Moment cleanup is limited to object keys under `users/{uid}/moments/`; profile pictures and wallpapers are not affected.
