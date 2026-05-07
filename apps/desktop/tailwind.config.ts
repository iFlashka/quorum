import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Background layers ─────────────────────────────────── */
        bg: {
          1:       'var(--bg-1)',
          2:       'var(--bg-2)',
          3:       'var(--bg-3)',
          4:       'var(--bg-4)',
          5:       'var(--bg-5)',
          6:       'var(--bg-6)',
          7:       'var(--bg-7)',
          /* backward-compat aliases */
          deepest: 'var(--bg-deepest)',
          darker:  'var(--bg-darker)',
          default: 'var(--bg-default)',
          elevated:'var(--bg-elevated)',
          hover:   'var(--bg-hover)',
          active:  'var(--bg-active)',
        },
        /* ── Text ─────────────────────────────────────────────── */
        text: {
          strong:    'var(--text-strong)',
          normal:    'var(--text-normal)',
          muted:     'var(--text-muted)',
          link:      'var(--text-link)',
          /* backward-compat */
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        /* ── Interactive states ────────────────────────────────── */
        int: {
          normal: 'var(--int-normal)',
          hover:  'var(--int-hover)',
          active: 'var(--int-active)',
          muted:  'var(--int-muted)',
        },
        /* ── Brand ────────────────────────────────────────────── */
        blurple: {
          DEFAULT: 'var(--clr-blurple)',
          hover:   'var(--clr-blurple-hover)',
          press:   'var(--clr-blurple-press)',
        },
        /* ── Status ───────────────────────────────────────────── */
        status: {
          online:  'var(--clr-online)',
          idle:    'var(--clr-idle)',
          dnd:     'var(--clr-dnd)',
          offline: 'var(--clr-offline)',
          stream:  'var(--clr-stream)',
        },
        /* ── Semantic ─────────────────────────────────────────── */
        danger:   'var(--clr-danger)',
        positive: 'var(--clr-positive)',
        pink:     'var(--clr-pink)',
        /* ── Neutral scale ────────────────────────────────────── */
        n: {
          1:  'var(--clr-n1)',
          10: 'var(--clr-n10)',
          20: 'var(--clr-n20)',
          30: 'var(--clr-n30)',
          40: 'var(--clr-n40)',
          50: 'var(--clr-n50)',
          60: 'var(--clr-n60)',
          66: 'var(--clr-n66)',
          69: 'var(--clr-n69)',
          73: 'var(--clr-n73)',
          80: 'var(--clr-n80)',
          90: 'var(--clr-n90)',
        },
        /* ── Borders ──────────────────────────────────────────── */
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        /* ── backward-compat accent.* ─────────────────────────── */
        accent: {
          primary: 'var(--accent-primary)',
          hover:   'var(--accent-hover)',
          success: 'var(--accent-success)',
          warning: 'var(--accent-warning)',
          danger:  'var(--accent-danger)',
        },
      },
      fontFamily: {
        sans: [
          '"sans-me"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        ts:   ['11px', { lineHeight: '14px', letterSpacing: '0' }],
        meta: ['12px', { lineHeight: '16px' }],
        body: ['15px', { lineHeight: '1.375' }],
        title:['16px', { lineHeight: '20px', letterSpacing: '-0.005em' }],
      },
      boxShadow: {
        low:      'var(--shadow-low)',
        mid:      'var(--shadow-mid)',
        high:     'var(--shadow-high)',
        elevated: 'var(--shadow-high)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [animate],
};

export default config;
