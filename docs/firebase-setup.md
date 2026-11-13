# Firebase project setup

Chater's Firebase Web configuration is connected in `src/lib/firebase.ts` for the project `chater-8f834`.

## Connected web app

- **Project ID:** `chater-8f834`
- **Auth domain:** `chater-8f834.firebaseapp.com`
- **Storage bucket:** `chater-8f834.firebasestorage.app`
- **Messaging sender ID:** `980191020906`
- **Web app ID:** `1:980191020906:web:697cd47ff87bd6bb624713`
- **Analytics measurement ID:** `G-N36H678CMD`

The six required Firebase web configuration values are embedded as client-side configuration so the GitHub Pages build can initialize Firebase without repository Actions secrets. The Analytics measurement ID is also configured; Analytics initializes only when Firebase reports browser support.

These are Firebase client configuration values, not Admin SDK credentials. They are visible to visitors in any web app that uses Firebase. Do not add service-account JSON, Admin SDK credentials, or private keys to frontend code, Vite variables, or this repository. Protect data with Firebase Authentication and restrictive Firestore/Storage Security Rules, and apply suitable API-key restrictions in Google Cloud.

## Current code behavior

- `src/lib/firebase.ts` initializes the Firebase app using the supplied Chater Web configuration.
- Optional `VITE_FIREBASE_*` variables can override the built-in values for local development; see `.env.example`.
- Firebase Analytics is initialized only in browsers supported by the Analytics SDK.
- Authentication providers and sign-in flows are deliberately left for roadmap Task 32.
- Firestore, Storage, and other services must be enabled and secured before the app uses them.

## Important next step

Confirm in the Firebase Console that the project `chater-8f834` has the Cloud Firestore database created in the intended location, and that Email/Password Authentication is enabled when Task 32 begins. Do not weaken Firestore or Storage rules to make the frontend work.

## Media storage (Cloudflare R2)

Chater uses one Cloudflare R2 bucket for profile pictures, Moments, general chat wallpapers, and individual chat wallpapers. Files are uploaded through the authenticated `chater-media` Worker; the browser never receives an R2 S3 access key or secret. Firebase Authentication remains responsible for accounts and sign-in, and profile image URLs are saved to Firebase Auth's `photoURL` and the Firestore user profile.

- **R2 bucket:** `chater-media` (private bucket)
- **Worker:** `chater-media`
- **Media endpoint:** `https://chater-media.henrymeraldcompany.workers.dev`
- **Worker R2 binding:** `MEDIA`
- **Firebase project:** `chater-8f834`
- **Allowed app origin:** `https://henrymeraldcompany-bit.github.io`

Object prefixes are always generated from the verified Firebase ID token subject:
- Profile pictures: `users/{uid}/profile/{uuid}.{ext}` (maximum 5 MB)
- Moments: `users/{uid}/moments/{uuid}.{ext}` (maximum 50 MB; removed from the feed after 24 hours and physically cleaned from R2 by the scheduled expiry sweep)
- General wallpaper: `users/{uid}/wallpapers/general/{uuid}.{ext}` (maximum 8 MB)
- Individual chat wallpaper: `users/{uid}/wallpapers/chats/{conversationId}/{uuid}.{ext}` (maximum 8 MB)

The Worker verifies Firebase ID-token signatures against Google's Secure Token public keys. Account deletion requires recent authentication and removes only the authenticated user's R2 object prefix before Chater removes the Firebase/Firestore records. The R2 bucket itself remains private; media is delivered through the Worker.

All current Chater media uploads and deletions use the authenticated R2 media Worker. The frontend does not need credentials, SDKs, upload presets, or direct connections to a third-party media host. Any files stored by a previous media service are separate and are not automatically imported into R2.

## Email registration prerequisites

In Firebase Console, open **Build → Authentication → Sign-in method** and enable **Email/Password**. Under Authentication settings, add `henrymeraldcompany-bit.github.io` to **Authorized domains**. If either is missing, Chater will show a specific error when registration is attempted.


## Contact discovery and private contact links (Task 47)

Contact discovery uses the browser Contact Picker only after the user presses **Choose contacts**. Chater requests contact names only, sends the selected names as exact-match search terms against public Chater display names, and labels every result as a possible match for manual review. It does not request or store phone numbers, email addresses, or device contact photos. A confirmed Chater contact is saved only as a private target UID and timestamp under `users/{uid}/contacts/{targetUid}`.

The GitHub Pages workflow publishes the web app only; it does not publish Firestore Security Rules. To enable adding and removing contacts in the live app, open Firebase Console for project `chater-8f834`, select **Firestore Database → Rules**, replace the rules with the current repository `firestore.rules` file, and select **Publish**. The nested contact rules restrict each contact list to its owner. Do not use permissive test rules or make contact subcollections publicly readable.


## Direct messaging and blocking (Tasks 48–50)

Chater now supports direct one-to-one conversations without message requests. Either signed-in participant can start a thread and send a text message; the recipient can reply at any time or block the sender. Messages are stored in Firestore at `conversations/{conversationId}/messages/{messageId}`, and the inbox subscribes to each account's conversation documents.

A block is stored privately at `users/{uid}/blocked/{targetUid}`. Firestore rules check both accounts' block lists before allowing a new conversation or message. A member cannot bypass a block by reopening a profile or using another screen.

**Publish the current repository `firestore.rules` file** in Firebase Console → Firestore Database → Rules → Publish. This updated file contains the contact-list rules from Task 47, private block-list rules, participant-only conversation/message reads, and two-way block enforcement. GitHub Pages only deploys the frontend; it does not deploy Firestore rules. Never replace these rules with public or test-mode rules.

## Conversation options menu

The direct-message screen has a top-right options menu for profile information, in-chat search, reporting, blocking, chat theme selection, and secondary actions. Reports are created in the private `reports` collection. The current `firestore.rules` file allows authenticated report creation with a limited set of reason codes and denies report reads/updates/deletes from the client.

**Publish the latest `firestore.rules` file again** after adding report support. Clear chat only hides history on the current device; it does not delete the other participant's messages. Chat theme and mute preferences are local to the device. Push notifications and message attachments are not connected yet, so the mute option stores a future preference and the media/links/docs option explains that attachments are not available.

## Account appearance and image chat wallpapers

The general Appearance settings (Dark, Light, or System), general wallpaper preset/image, and message-bubble shape are saved in `users/{uid}.preferences`. The same values are cached locally with the UID in the key, so signing in to another account on the same phone loads that account's own choices.

Each direct conversation can also have its own wallpaper. Per-chat theme and image URL are saved in the signed-in owner's private subcollection `users/{uid}/chatPreferences/{conversationId}`. A personal wallpaper overrides the general wallpaper only in that conversation; removing the personal image restores the general theme.

General and personal chat wallpaper images are uploaded through the `chater-media` Worker into the authenticated account's private R2 object prefix. General wallpapers use `users/{uid}/wallpapers/general/`; personal chat wallpapers use `users/{uid}/wallpapers/chats/{conversationId}/`. Each wallpaper must be 8 MB or smaller. The account-deletion endpoint removes these wallpapers along with profile pictures and Moments. A scheduled Worker expiry sweep removes Moment media after 24 hours without affecting profile pictures or wallpapers.

**Publish the latest repository `firestore.rules` file again** in Firebase Console → Firestore Database → Rules → Publish. It contains the owner-only `chatPreferences` rule. The GitHub Pages workflow does not deploy Firestore rules.

