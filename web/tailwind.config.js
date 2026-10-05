/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#f3f0e8',
          900: '#faf8f2',
          850: '#fffdf8',
          800: '#e7e1d5',
          700: '#d7d0c1',
          600: '#beb4a1'
        },
        slate: {
          50: '#17241e',
          100: '#24352d',
          200: '#3e5046',
          300: '#586a60',
          400: '#586a60',
          500: '#5f6f64',
          600: '#5f6f64',
          700: '#c2c8c3'
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-ink-rgb, 31 106 84) / <alpha-value>)',
          soft: '#dce9df'
        },
        emerald: {
          300: '#176b4d',
          400: '#237e5b',
          500: '#2f8b64',
          900: '#c8e3d3',
          950: '#eef7ef'
        },
        amber: {
          200: '#7c4b0c',
          300: '#946016',
          400: '#ad7624',
          500: '#c18a35',
          900: '#e8cda0',
          950: '#fbf3e5'
        },
        red: {
          300: '#a23a32',
          400: '#b94c43',
          500: '#c85d53',
          900: '#e8bdb8',
          950: '#fdf0ee'
        },
        sky: {
          300: '#176184',
          400: '#2c7798',
          500: '#3a89aa',
          900: '#c0dce6',
          950: '#eef7fa'
        },
        violet: {
          300: '#5d4b83',
          400: '#735c9b',
          500: '#866db0',
          900: '#d3c8e7',
          950: '#f5f1fb'
        }
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.7) inset, 0 8px 24px -20px rgb(23 36 30 / 0.4)',
        lift: '0 1px 0 0 rgb(255 255 255 / 0.18) inset, 0 6px 16px -10px rgb(23 36 30 / 0.28)',
      },
      keyframes: {
        'rail-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'rail-in': 'rail-in 0.35s ease-out both',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif']
      }
    }
  },
  plugins: []
};
