/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shell:          'var(--shell)',
        panel:          'var(--panel)',
        raised:         'var(--raised)',
        raised2:        'var(--raised2)',
        line:           'var(--line)',
        line2:          'var(--line2)',
        brand:          'var(--brand)',
        'brand-bright': 'var(--brand-bright)',
        'brand-deep':   'var(--brand-deep)',
        txt:            'var(--txt)',
        'txt-mut':      'var(--txt-mut)',
        'txt-dim':      'var(--txt-dim)',
        ok:             'var(--ok)',
        warn:           'var(--warn)',
        risk:           'var(--risk)',
        info:           'var(--info)',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'bar-fill': {
          '0%':   { transform: 'scaleX(0)', transformOrigin: 'left' },
          '100%': { transform: 'scaleX(1)', transformOrigin: 'left' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.25s ease-out both',
        shimmer:      'shimmer 1.6s linear infinite',
        'bar-fill':   'bar-fill 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
