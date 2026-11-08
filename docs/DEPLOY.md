# Despliegue (M12-12/13/14)

- Build: `npm run build` → `dist/`.
- Servir `dist/` como estático (GitHub Pages, Netlify, Vercel).
- Para workers/cross-origin isolation (COOP/COEP) configurar en el host:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- PWA: `public/sw.js` registrado automáticamente en producción.
