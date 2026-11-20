/**
 * All brand values in one place so they can be swapped when the humAIn assets arrive.
 * Interim: arcade look with a "humAIn PRESENTS" line. Level colours are reserved for level meaning.
 */
export const brand = {
  presentsLine: 'humAIn PRESENTS',
  title: { first: 'PREDICTION', second: 'ENGINE' },
  logo: null as string | null, // path to a logo file once supplied; null = text title
  colors: {
    bg: '#05010F', panel: '#0B0420', line: '#2A1F55', ink: '#E8F7FF', dim: '#8A86B8',
    level1: '#39FF14', level2: '#00E5FF', level3: '#FFE600', level4: '#FF8A00', level5: '#FF2BD6',
    cyber: '#FFFFFF', ship6: '#B388FF',
  },
  fonts: {
    display: "'Press Start 2P', monospace",
    ui: "'Press Start 2P', monospace",
    body: "'VT323', monospace",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap',
  },
  consentLine: 'By playing, you agree that humAIn may publish and reuse your predictions and callsign in other content.',
  /** Never humain.com.au. */
  joinUrl: 'https://humain.au/predictionengine2027/',
  basePath: '/predictionengine2027/',
} as const;

/** Exposes the colour and font tokens as CSS custom properties. */
export function applyBrand(root: HTMLElement = document.documentElement) {
  const c = brand.colors;
  const vars: Record<string, string> = {
    '--bg': c.bg, '--panel': c.panel, '--line': c.line, '--ink': c.ink, '--dim': c.dim,
    '--g': c.level1, '--c': c.level2, '--y': c.level3, '--o': c.level4, '--m': c.level5,
    '--cyber': c.cyber, '--ship6': c.ship6,
    '--px': brand.fonts.ui, '--tx': brand.fonts.body,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
