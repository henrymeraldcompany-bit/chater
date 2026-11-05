# Chater architecture — foundation

## Application layers

- **Presentation:** React components and responsive mobile-first styles.
- **Feature modules:** accounts, usernames, messaging, attachments, Moments, communities, calls, privacy and settings.
- **Services:** typed interfaces for Firebase and future realtime/calling providers.
- **PWA runtime:** web app manifest, installability metadata, service worker and conservative static-asset caching.

## Planned Firebase integration

- Firebase Authentication for email/password and email verification.
- Cloud Firestore for user profiles, username registry, conversations and metadata.
- Cloud Functions for trusted username reservation, account operations and privileged workflows.
- Cloud Storage for media and documents with resumable transfers.
- Firebase Cloud Messaging for push notifications.

No Firebase project credentials are included in this repository yet.

## Security principles

- Firestore and Storage deny access by default.
- All membership and ownership checks are enforced server-side.
- Username uniqueness is enforced transactionally by trusted backend code.
- Public username discovery exposes only explicitly public profile fields.
- Private message content must not be exposed to administrators or public clients.
- End-to-end encryption must use an established protocol and undergo security review before being claimed as available.

## PWA behavior

The install prompt is shown only when the browser provides an install opportunity and the app is not already running in standalone mode. The service worker caches the application shell, not private messages or authenticated API responses.

## Planned feature boundaries

Each major feature should be implemented behind typed service interfaces and tested independently. Placeholder screens must not be described as functional services.