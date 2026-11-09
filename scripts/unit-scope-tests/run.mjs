#!/usr/bin/env node
// Roda os testes de isolamento por unidade contra os SERVIÇOS reais do app,
// com o cliente Supabase trocado por um banco em memória (fakeSupabase.js).
// Sem dependências novas: usa o esbuild que já vem com o Vite para resolver
// o alias "@/" e empacotar o teste; executa com `node --test`.
//
//   node scripts/unit-scope-tests/run.mjs

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = mkdtempSync(join(tmpdir(), "unit-scope-tests-"));

const aliasPlugin = {
  name: "app-alias",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabaseClient$/ }, () => ({ path: join(here, "fakeSupabase.js") }));
    // PDF: registra textos/nome do arquivo em vez de gerar o documento.
    b.onResolve({ filter: /^jspdf$/ }, () => ({ path: join(here, "fakeJsPdf.js") }));
    b.onResolve({ filter: /^html2canvas$/ }, () => ({ path: join(here, "fakeJsPdf.js") }));
    b.onResolve({ filter: /^@\// }, async (args) => {
      const r = await b.resolve("./" + args.path.slice(2), { resolveDir: join(root, "src"), kind: args.kind });
      return r.errors.length ? { errors: r.errors } : { path: r.path };
    });
  },
};

try {
  await build({
    entryPoints: [join(here, "unitScope.integration.test.js")],
    outfile: join(out, "unitScope.integration.test.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "error",
    plugins: [aliasPlugin],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": '""',
      "import.meta.env.VITE_SUPABASE_ANON_KEY": '""',
      "import.meta.env.BASE_URL": '"/"',
    },
    loader: { ".png": "empty", ".css": "empty" },
    // Globais mínimos de navegador lidos no carregamento de módulos do app
    // (ex.: src/lib/utils.js lê window.self/top).
    banner: {
      js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" +
        "globalThis.window ??= globalThis; globalThis.navigator ??= { userAgent: 'node' };" +
        "globalThis.location ??= { origin: 'http://localhost', href: 'http://localhost/' };" +
        "globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };",
    },
  });
  const res = spawnSync(process.execPath, ["--test", join(out, "unitScope.integration.test.mjs")], { stdio: "inherit" });
  process.exitCode = res.status ?? 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
