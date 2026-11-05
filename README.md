# Chater

**Connect. Converse. Share.**

Chater is an email-first, username-discoverable messaging platform planned as an installable Progressive Web App.

## Current milestone

Task 1 establishes the React + TypeScript + Vite + Tailwind CSS v4 foundation, PWA manifest/service worker configuration, brand tokens and initial responsive application shell.

## Brand

- Default theme: dark
- Accent: Amber Gold `#F4A51C`
- Supporting accent: Orange `#FF7629`
- Splash: Chater logo and "from GOZIE" for 1.5 seconds
- Navigation: Chats, Moments, Communities, Calls, You

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Local development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm test
npm run build
```

## Environment

Copy `.env.example` to `.env.local` when Firebase integration is introduced. Never commit private service-account keys or secrets.

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Status

The initial shell is a frontend foundation only. Authentication, live messaging, Moments, communities, calls, encryption and uploads are future implementation tasks and are not represented as operational yet.