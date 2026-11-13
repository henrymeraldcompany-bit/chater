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

## Direct one-to-one messaging (Tasks 48–49)

Chater uses one deterministic Firestore conversation document per pair of user IDs. Both participants share the same realtime message thread. A signed-in member can start the conversation from any public profile; there is no message-request, accept, or reject state. Either participant may reply whenever they choose.

- Conversation metadata is stored at `conversations/{conversationId}`.
- Text messages are stored at `conversations/{conversationId}/messages/{messageId}`.
- The conversation ID is derived from the two sorted, URL-encoded Firebase user IDs.
- Message text is limited to 4,000 characters.
- Conversation and message reads are restricted to the two participants.
- Messages are realtime Firestore updates; no private content is copied to a public profile.

## Blocking (Task 50)

A member blocks another account by creating `users/{uid}/blocked/{targetUid}`. The block list is readable only by its owner. Firestore rules check both directions before a conversation can be created or a message can be sent. Either participant can still read the existing conversation history, but neither side can send new messages while a block exists. The blocker can remove the block later.

Blocking is enforced by Firestore Security Rules, not merely by hiding the composer in the client. The web deployment does not publish those rules; publish the repository's `firestore.rules` file in Firebase Console before using live messaging in production.

Direct messaging here is authenticated transport and access control. It is **not end-to-end encrypted**; do not describe it as E2EE.

## Conversation overflow menu

Each direct chat includes a top-right options menu for viewing the other member's public Chater identity, searching the current message history, reporting the account, blocking/unblocking, choosing a per-chat wallpaper, and opening secondary chat actions.

- Reports are created under `reports/{reportId}`; Firestore allows a signed-in member to create a narrowly shaped report but does not allow client reads or edits.
- Clear chat is device-local: it hides older messages and the preview on the current device only. It does not delete the shared Firestore messages or the other participant's copy.
- Export chat creates a plain-text download in the browser.
- Per-chat theme and mute preferences are stored locally. Push notifications are not yet connected, so muting is currently a saved preference only.
- Media, links and documents are not available until attachment support exists. Individual conversation shortcuts are also not supported yet.

## Account appearance preferences and chat wallpapers

General appearance settings are stored on the signed-in member's Firestore profile in `users/{uid}.preferences` and are cached locally under keys scoped to that UID. This keeps each account's general Dark/Light/System theme, wallpaper choice, optional general wallpaper image URL, and message-bubble style separate on a shared phone.

- The general wallpaper is inherited by direct conversations using the Default chat theme.
- A personal conversation can override the general wallpaper with one of the built-in themes or its own uploaded image.
- Per-chat appearance is stored privately at `users/{uid}/chatPreferences/{conversationId}`.
- Uploaded wallpaper images are stored in the private Cloudflare R2 bucket under `users/{uid}/wallpapers/general/` or `users/{uid}/wallpapers/chats/{conversationId}/`.
- The authenticated Chater media Worker verifies Firebase ID tokens, assigns the object key from the authenticated UID, and serves media through the Worker. Account deletion removes only objects under that authenticated UID's `users/{uid}/` prefix.
- Message bubble settings affect the actual sent and received text bubbles, not only the settings preview.

The `chatPreferences` Firestore subcollection is owner-readable and owner-writable only. Publish the current `firestore.rules` file before expecting cross-device per-chat preferences to sync.

