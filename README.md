# Surgimate Modernization Demo

Company-facing preview of **Classic** vs **Modern Light** (default) vs **Modern Dark** UI.

Live screenshots are captured from the running Angular + Rails dev stack (ZTESTATHENA client).

## GitHub Pages

Site: `https://canzelc-surgimate.github.io/surgimate-modernization/`

## Regenerating screenshots

Requires **Rails** (`127.0.0.1:3000`) and **Angular** (`127.0.0.1:4200`) running locally.

Credentials are read from `koala-rails/.env.development` (`USERNAME` / `PASSWORD`). Client defaults to **ZTESTATHENA**.

```bash
cd demo/surgimate-modernization
npm install && npm run screenshots:install
npm run screenshots
```

Output: `assets/screenshots/{classic,modern-light,modern-dark}/*.png`

The setup script toggles `modern_ui_ux_enabled` on ZTESTATHENA only (restored to `true` when finished).

## Local preview

```bash
python3 -m http.server 8080
# open http://localhost:8080
```
