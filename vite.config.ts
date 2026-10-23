import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Emits sw.js with this build's exact file list so an installed app can start offline.
function offlineShell(): Plugin {
  return {
    name: 'adfirm-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['/', '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png', '/icon-192.png', ...Object.keys(bundle).filter(name => name.startsWith('assets/')).map(name => `/${name}`)].sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync('src/sw-template.js', 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// The Android version code lets the installed app tell when a newer APK has been published.
const androidVersionCode = Number(readFileSync('android/app/build.gradle', 'utf8').match(/versionCode (\d+)/)?.[1] || 0);

export default defineConfig({
  plugins: [react(), offlineShell()],
  define: { __APP_VERSION_CODE__: JSON.stringify(androidVersionCode) },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4100' }, watch: { ignored: ['**/.tools/**','**/android/**','**/data/**','**/artifacts/**'] } },
  build: { outDir: 'dist', sourcemap: false },
});
