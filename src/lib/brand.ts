// @polsia:user-owned — brand identity. Edit freely. `site.ts` re-exports
// siteName/siteDescription; `manifest.ts` + `opengraph-image.tsx` read `brandVisual`.

export const siteName = 'Heart Lines';
export const siteDescription =
  'Meaningful connections for hearts over 50. A dating app designed for adults seeking genuine, long-term relationships.';

// PWA + social-share colors. HEX only (the oklch() tokens in globals.css aren't
// readable here) — set to match your brand seed.
export const brandVisual = {
  /** PWA browser-UI / status-bar color. */
  themeColor: '#c2654a',
  /** PWA splash + install background. */
  backgroundColor: '#fdf8f5',
  /** Social-share (OG/Twitter) image. */
  og: {
    background: '#fdf8f5',
    foreground: '#2d1608',
    /** Second line under the site name; '' hides it. */
    tagline: 'Meaningful connections for hearts over 50',
  },
} as const;
