# End-to-end tests

Playwright tests that play a whole event day against a running stack and save screenshots to `docs/screenshots`. See [docs/screenshots.md](../docs/screenshots.md) for what each test covers and the pictures it takes.

```bash
docker compose up -d --build
docker compose exec api node dist/seed-demo.js
npm install
npx playwright test
```

- `BASE_URL`: the app's address, default `http://localhost:8090`.
- `PW_CHANNEL`: the installed browser to use, default `chrome` (or `msedge`).
- `ADMIN_PASSWORD`: read from the repo's `.env` if not set.

The tests run in order on one worker because one event moves through its rounds. Each run starts the demo event over (testing mode), so it can be repeated.
