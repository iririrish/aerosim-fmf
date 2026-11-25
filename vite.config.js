import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work under any GitHub Pages path
// (https://<user>.github.io/<repo>/) without editing the repo name.
// The app uses hash routing, so no 404.html redirect is needed.
export default defineConfig({
  base: './',
  plugins: [react()],
});
