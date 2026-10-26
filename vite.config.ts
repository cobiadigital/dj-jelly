import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

// Emits dist/sw.js from src/sw.js, injecting the list of built files to precache
// and a version hash so a new deploy replaces the old app shell cache.
function serviceWorker(): Plugin {
  return {
    name: 'app-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== '_headers');
      const shell = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', ...files.filter((f) => f !== 'index.html').map((f) => '/' + f)];
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 12);
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(shell))
        .replace('self.__VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

function git(args: string) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// Shown in Settings. The commit is supplied by whichever system is building (Cloudflare Workers
// Builds, GitHub Actions) or by git locally, so it changes with every merge without any manual edit.
const appVersion = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const commit = (process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 7) || 'dev';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [svelte(), serviceWorker()],
  build: { target: 'es2022' },
});
