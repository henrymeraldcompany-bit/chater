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

## Profile picture storage rules

Chater uploads profile pictures to `profilePictures/{userId}/`. To enable uploads safely:

1. In Firebase Console, open **Build → Storage** and create/enable the project's Storage bucket.
2. Open the **Rules** tab.
3. Replace the rules with the contents of the repository's `storage.rules` file.
4. Publish the rules.

The rules allow signed-in users to read profile pictures and allow each user to upload only to their own folder. Uploads must be image files under 5 MB. Do not use public write access.

## Email registration prerequisites

In Firebase Console, open **Build → Authentication → Sign-in method** and enable **Email/Password**. Under Authentication settings, add `henrymeraldcompany-bit.github.io` to **Authorized domains**. If either is missing, Chater will show a specific error when registration is attempted.
