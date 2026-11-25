# DragSail — Free Molecular Flow Calculator

Browser-only engineering calculator for drag on a DragSail spacecraft in LEO (250–400 km).
Free to host on GitHub Pages; no backend, accounts or paid services.

**Status: phases 1–8 implemented.** Maxwell and Sentman/DRIA are experimental; CLL is not implemented. PDF export uses the browser's Print → Save as PDF.

## Run locally
```bash
npm install
npm run dev        # development
npm run build      # production build into dist/
npm run preview    # serve the production build
npm test           # validation suite (also runs before every deployment)
```

## Deploy to GitHub Pages
1. Create a GitHub repository and push this folder to the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Each push to `main` runs `.github/workflows/deploy.yml` and publishes `dist/`.
4. The site appears at `https://<user>.github.io/<repo>/`.

The build uses a relative base (`base: './'`) and hash routing (`#/page`), so it works under any repository name with no extra configuration.

## Structure
`src/calculations/` is reserved for the UI-independent scientific engine (phases 3–4, 8).
