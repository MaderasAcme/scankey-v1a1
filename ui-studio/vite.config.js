import path from 'path';
import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

// Transform .js files with JSX so Rollup can parse them (NO TS rule).
function jsxInJs() {
  return {
    name: 'jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.match(/\.js$/)) return null;
      if (!/<[A-Za-z]/.test(code)) return null;
      return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      esbuild: {
        loader: { '.js': 'jsx' },
      },
      server: {
        port: 5173,
        host: true,
      },
      plugins: [jsxInJs(), react({ include: /\.(jsx|js|ts|tsx)$/ })],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
