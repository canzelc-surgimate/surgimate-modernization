# Surgimate Modernization Demo

Single-page visual demo for the **Launch Pad** / modern UI rollout (`modern_ui_ux_enabled` feature flag).

## GitHub Pages

1. Push this repo to `canzelc-surgimate/surgimate-modernization`
2. In GitHub: **Settings → Pages → Build and deployment → Branch: `main` / root**
3. Site URL: `https://canzelc-surgimate.github.io/surgimate-modernization/`

## Local preview

```bash
cd demo/surgimate-modernization
python3 -m http.server 8080
# open http://localhost:8080
```

## Updating

Edit `index.html` and `assets/`. Replace the Jotform CTA link in the feedback section when ready.

### Regenerating screenshots

Requires local **Rails** (`127.0.0.1:3000`) and **Angular** (`127.0.0.1:4200`) dev servers.

```bash
cd demo/surgimate-modernization
npm install && npm run screenshots:install
npm run screenshots
```

This toggles `modern_ui_ux_enabled` on the ZTEST dev client, logs in as `green@surgimate.com`, and writes PNGs to `assets/screenshots/`. The dev password is reset to `ScreenshotDemo1!` for capture only (restore your own password afterward if needed).
