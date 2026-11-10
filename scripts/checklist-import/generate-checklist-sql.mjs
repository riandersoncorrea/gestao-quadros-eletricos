#!/usr/bin/env node
// Gera o SQL de importação dos checklists históricos exportados do ValeForms
// (aba "Forms") como inspeções do sistema — com respostas, NCs, ações
// automáticas, flags, Índice de Saúde e fotos (já enviadas ao Storage).
//
// Uso:
//   node scripts/checklist-import/generate-checklist-sql.mjs \
//     --file "<Checklist Quadros Elétricos EFC.xlsx>" \
//     --photos <mapa TAG -> {externa, interna, diagrama} (nomes no Storage).json> \
//     --storage-url https://<projeto>.supabase.co --storage-folder efc-checklists-2026-10 \
//     [--aliases <nomes de inspetor.json>] [--prazo-base importacao|inspecao] [--import-date AAAA-MM-DD] \
//     --out supabase/private/efc_checklists_valeforms.sql
//
// O SQL gerado contém dados reais: fica em supabase/private/ (ignorado pelo
// git). Só lê a planilha; nada é gravado no banco por este script.
// Usa o esbuild do Vite para resolver o alias "@/" das regras de domínio.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = mkdtempSync(join(tmpdir(), "checklist-import-"));

const aliasPlugin = {
  name: "app-alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, async (args) => {
      const r = await b.resolve("./" + args.path.slice(2), { resolveDir: join(root, "src"), kind: args.kind });
      return r.errors.length ? { errors: r.errors } : { path: r.path };
    });
  },
};

let status = 1;
try {
  const entry = process.env.CHECKLIST_IMPORT_ENTRY || join(here, "cli.js");
  const outfile = join(out, "bundle.mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "error",
    plugins: [aliasPlugin],
    external: ["xlsx", "node:*"],
    nodePaths: [join(root, "node_modules")],
    banner: { js: `import { createRequire as __cr } from "node:module"; const require = __cr(${JSON.stringify(join(root, "package.json"))});` },
  });
  const args = process.env.CHECKLIST_IMPORT_ENTRY ? ["--test", outfile] : [outfile, ...process.argv.slice(2)];
  status = spawnSync(process.execPath, args, { stdio: "inherit", cwd: process.cwd() }).status ?? 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(status);
