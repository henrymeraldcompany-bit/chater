# Retired Chater Cloudinary account-deletion Worker

The Cloudinary-based `chater-account-deletion` Worker is retired as part of the move to Cloudflare R2.

The replacement service is documented in [../media/README.md](../media/README.md). The replacement `chater-media` Worker handles authenticated uploads, media delivery, and deletion of an account's own R2 objects.

Do not configure new Cloudinary API credentials or use this Worker for Chater. The legacy Cloudflare Worker should be deleted only after the R2 Worker is deployed, its health check succeeds, and the Chater production app is switched to it.
