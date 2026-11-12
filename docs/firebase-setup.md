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

## Profile picture uploads (Cloudinary)

Chater stores profile-picture image files in Cloudinary using an unsigned upload preset. Firebase Authentication remains responsible for accounts and sign-in; the resulting Cloudinary secure URL is saved to the signed-in Firebase user's `photoURL`.

- **Cloud name:** `amzak6nf`
- **Unsigned upload preset:** `chater_profiles`
- **Upload endpoint:** `https://api.cloudinary.com/v1_1/amzak6nf/image/upload`
- **Client-side validation:** image files only, maximum 5 MB.
- **Folder:** `chater/profiles/{firebase-user-uid}`

The cloud name and unsigned preset name are public client-side configuration. Never put a Cloudinary API secret in frontend code or this repository. The upload preset must remain **Unsigned** for browser uploads. Firebase Storage is not required for Chater profile-picture uploads.

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

Image wallpapers use the existing Cloudinary unsigned upload preset and are stored in account-specific folders:

- General theme: `chater/wallpapers/{uid}/general`
- Individual conversation: `chater/wallpapers/{uid}/chats/{conversationId}`

Image files must be no larger than 8 MB. The uploads use an account-scoped public-ID prefix so the secure `chater-account-deletion` Worker also removes wallpaper images when an account is deleted.

**Publish the latest repository `firestore.rules` file again** in Firebase Console → Firestore Database → Rules → Publish. It contains the owner-only `chatPreferences` rule. The GitHub Pages workflow does not deploy Firestore rules.

