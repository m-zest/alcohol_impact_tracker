import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const distClient = resolve(root, "dist/client");
const distServer = resolve(root, "dist/server/server.js");
const outputRoot = resolve(root, ".vercel/output");
const outputStatic = resolve(outputRoot, "static");
const renderFunc = resolve(outputRoot, "functions/_render.func");

if (!existsSync(distClient) || !existsSync(distServer)) {
  console.error("Vite build output missing. Run `vite build` first.");
  process.exit(1);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputStatic, { recursive: true });
await mkdir(renderFunc, { recursive: true });

await cp(distClient, outputStatic, { recursive: true });

await build({
  entryPoints: [distServer],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: resolve(renderFunc, "server.mjs"),
  banner: {
    js: "import { createRequire as __cjsCompatCreateRequire } from 'node:module';const require = __cjsCompatCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});

const handler = `import server from "./server.mjs";

export default async function handler(req, res) {
  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const url = new URL(req.url ?? "/", protocol + "://" + host);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  let body;
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length) body = Buffer.concat(chunks);
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body,
    duplex: "half",
  });

  const response = await server.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}
`;
await writeFile(resolve(renderFunc, "index.mjs"), handler);

await writeFile(
  resolve(renderFunc, "package.json"),
  JSON.stringify({ type: "module" }, null, 2) + "\n",
);

await writeFile(
  resolve(renderFunc, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ) + "\n",
);

await writeFile(
  resolve(outputRoot, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/_render" },
      ],
    },
    null,
    2,
  ) + "\n",
);

console.log("Vercel Build Output written to .vercel/output");
