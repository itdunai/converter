# Image Compressor & Converter

Web app for:
- JPG/PNG compression
- PNG -> JPG conversion
- JPG -> WebP conversion
- PNG -> WebP conversion

## Features

- Multi-file upload (limit is configurable via env)
- Two modes: conversion and compression
- Browser-side processing (no backend/API required)
- Client-side processing with per-file progress (no backend required)
- Single-file download and ZIP download for completed jobs

## Tech stack

- Next.js (App Router)
- Browser APIs (Canvas + Blob)
- JSZip for archive download

## Local run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - development mode
- `npm run build` - static export build
- `npm run start` - optional local preview via Node
- `npm run lint` - ESLint

## Deployment notes

- Supports static hosting (`next export` via `output: "export"`).
- `NEXT_PUBLIC_MAX_FILES_PER_BATCH` controls UI upload cap shown in browser.
- No server-side queue or API routes are required.

## Beget deployment (example)

1. Create a static site in Beget panel.
2. Upload project files (Git deploy or archive upload) to the app directory.
3. In Beget shell, install dependencies and build:

```bash
npm ci
npm run build
```

4. Publish contents of the `out` directory as the site root.
5. Configure environment variable before build if needed:
   - `NEXT_PUBLIC_MAX_FILES_PER_BATCH=20`
6. Open the site domain and verify upload/processing in browser.

Подробная инструкция на русском: `DEPLOY_BEGET.md`.
