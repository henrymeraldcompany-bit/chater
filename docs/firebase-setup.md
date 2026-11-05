# Firebase project setup

This repository contains the Firebase Web SDK and a safe, optional app initializer. A real Firebase project must still be created in the owner's Firebase Console; repository access cannot create or configure resources inside a Google account.

## Create the project

1. Open https://console.firebase.google.com/ and sign in with the Google account that will own Chater's Firebase project.
2. Select **Add project** and name it **Chater** (or another name you choose).
3. Complete the project creation flow. Google Analytics is optional for this milestone.
4. In Project settings, add a **Web app** named **Chater Web**.
5. Copy the web app's Firebase configuration values.
6. In the repository's deployment environment, provide the six `VITE_FIREBASE_*` values listed in `.env.example`. For local development, copy that file to `.env.local` and fill it in.
7. Do not commit `.env.local`, service-account JSON, Admin SDK credentials, or private keys. The Firebase web config is intended for client apps; security must be enforced by Firebase Security Rules and trusted backend code.

## Current code behavior

- `src/lib/firebase.ts` initializes the Firebase app only when all six web configuration values are present.
- Without configuration, the app continues to build and run as a frontend preview; Firebase-dependent features must remain unavailable rather than pretending to work.
- Authentication providers and sign-in flows are deliberately left for roadmap Task 32.
- Firestore, Storage, and other services must be enabled and secured in later tasks before use.

## Deployment note

GitHub Pages builds need the six `VITE_FIREBASE_*` values configured as repository Actions variables (or secrets where appropriate) and explicitly passed into the build workflow. Do not place service-account credentials in Vite variables.
