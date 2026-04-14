# Image Compressor & Converter

Web app for:
- JPG/PNG compression
- PNG -> JPG conversion
- JPG -> WebP conversion
- PNG -> WebP conversion

## Features

- Multi-file upload (limit is configurable via env)
- Adjustable quality, PNG compression, resize options
- Queue-based async processing with per-file progress
- Single-file download and ZIP download for completed jobs
- Health endpoint for deployment checks

## Tech stack

- Next.js (App Router)
- Sharp for image processing
- In-memory queue for jobs

## Local run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - development mode
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - ESLint
- `npm run test` - Vitest tests

## API endpoints

- `POST /api/images/process` - enqueue one file for processing
- `GET /api/jobs/:id` - get job status/progress
- `GET /api/jobs/:id/download` - download processed file
- `POST /api/jobs/download-zip` - download zip archive by `jobIds`
- `GET /api/health` - healthcheck

## Deployment notes

- Requires Node.js runtime (not static hosting).
- `MAX_PARALLEL_JOBS` controls server-side processing concurrency.
- `MAX_FILES_PER_BATCH` controls server-side batch validation limit.
- `NEXT_PUBLIC_MAX_FILES_PER_BATCH` controls UI upload cap shown in browser.
- For horizontal scaling, move queue state from memory to shared storage/queue.

## Beget deployment (example)

1. Create a Node.js site in Beget panel and choose Node 20+.
2. Upload project files (Git deploy or archive upload) to the app directory.
3. In Beget shell, install dependencies and build:

```bash
npm ci
npm run build
```

4. Set start command in Beget app settings:

```bash
npm run start
```

5. Configure environment variables in Beget:
   - `MAX_PARALLEL_JOBS=3`
   - `MAX_FILES_PER_BATCH=20`
   - `NEXT_PUBLIC_MAX_FILES_PER_BATCH=20`
   - `PORT` (if Beget requires a specific internal port)
6. Ensure domain is linked to the Node.js app (reverse proxy to app process in Beget panel).
7. Start/restart the app and check:
   - main page: `https://your-domain`
   - healthcheck: `https://your-domain/api/health`

If static files or "Index of" appears, the domain is pointing to static hosting instead of the Node.js app process.

Подробная инструкция на русском: `DEPLOY_BEGET.md`.
