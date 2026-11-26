import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

/**
 * Dev/preview-only: serves the AI endpoints (llms.txt, /book/<slug>.txt|json,
 * /ai-integration/SKILL.md, …) with the SAME code Vercel runs in production
 * (api/ai.js), using the rewrite table from vercel.json.
 */
function aiEndpoints(mode: string): Plugin {
  const rules = (JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites as { source: string; destination: string }[])
    .filter((r) => r.destination.startsWith('/api/'))
    .map((r) => {
      const names: string[] = [];
      const re = new RegExp(
        '^' + r.source.replace(/[.]/g, '\\.').replace(/:([a-zA-Z]+)/g, (_m, n) => { names.push(n); return '([^/]+?)'; }) + '$'
      );
      return { re, names, dest: r.destination };
    });
  const attach = (server: { middlewares: { use: (fn: any) => void } }, load: () => Promise<any>) => {
    Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
    server.middlewares.use(async (req: any, res: any, next: () => void) => {
      const url = new URL(req.url, 'http://local');
      for (const r of rules) {
        const m = r.re.exec(decodeURIComponent(url.pathname));
        if (!m) continue;
        const dest = new URL(r.dest, 'http://local');
        r.names.forEach((n, i) => dest.searchParams.set(n, m[i + 1]));
        // dest has ":slug" placeholders — substitute captured values
        let q = dest.search;
        r.names.forEach((n, i) => { q = q.replace(`%3A${n}`, encodeURIComponent(m[i + 1])); });
        const merged = new URLSearchParams(q);
        url.searchParams.forEach((v, k) => merged.set(k, v));
        req.url = `${dest.pathname}?${merged.toString()}`;
        const mod = await load();
        return mod.default(req, res);
      }
      next();
    });
  };
  return {
    name: 'ai-endpoints',
    configureServer(server) { attach(server, () => server.ssrLoadModule('/api/ai.js')); },
    configurePreviewServer(server) { attach(server, () => import(/* @vite-ignore */ new URL('./api/ai.js', import.meta.url).href)); },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), aiEndpoints(mode)],
}));
