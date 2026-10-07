import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run dev           -> servidor de desenvolvimento (http://localhost:5173)
// npm run build         -> pasta dist/ (para hospedar)
// npm run build:single  -> dist-single/index.html (arquivo ÚNICO e offline, para o dia da festa)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  server: { host: true, port: 5173, open: true },
  build: {
    target: 'esnext',
    outDir: mode === 'single' ? 'dist-single' : 'dist'
  }
}));
