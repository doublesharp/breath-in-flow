module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        breathing: {
          inhale: '#3B82F6', // blue-500
          'inhale-hold': '#8B5CF6', // purple-500
          exhale: '#10B981', // green-500
          'exhale-hold': '#F59E0B', // amber-500
          extended: '#6366F1', // indigo-500
        },
      },
      animation: {
        'breathe-in': 'breatheIn var(--inhale-time) ease-in-out',
        'breathe-out': 'breatheOut var(--exhale-time) ease-in-out',
        hold: 'pulse 2s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        breatheIn: {
          '0%': { transform: 'scale(0.6)', opacity: '0.6' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        breatheOut: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.6)', opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
