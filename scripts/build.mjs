import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

const entryPoints = [
  {
    in: path.join(srcDir, "background", "service-worker.ts"),
    out: path.join(distDir, "background.js")
  },
  {
    in: path.join(srcDir, "content", "controller.ts"),
    out: path.join(distDir, "content.js")
  },
  {
    in: path.join(srcDir, "popup", "popup.ts"),
    out: path.join(distDir, "popup", "popup.js")
  },
  {
    in: path.join(srcDir, "options", "options.ts"),
    out: path.join(distDir, "options", "options.js")
  }
];

async function copyStaticFiles() {
  const staticCopies = [
    ["manifest.json", "manifest.json"],
    ["popup/popup.html", "popup/popup.html"],
    ["popup/popup.css", "popup/popup.css"],
    ["options/options.html", "options/options.html"],
    ["options/options.css", "options/options.css"]
  ];

  await Promise.all(
    staticCopies.map(async ([from, to]) => {
      const source = path.join(srcDir, from);
      const target = path.join(distDir, to);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target);
    })
  );
}

async function copyOptionalDir(relativeDir) {
  const source = path.join(srcDir, relativeDir);
  const target = path.join(distDir, relativeDir);

  try {
    await cp(source, target, { recursive: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function buildEntry(entry) {
  await mkdir(path.dirname(entry.out), { recursive: true });

  await build({
    entryPoints: [entry.in],
    outfile: entry.out,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome130"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "2.0.0")
    }
  });
}

async function copyVisionRuntime() {
  const packageDir = path.join(rootDir, "node_modules", "@mediapipe", "tasks-vision");
  const wasmSource = path.join(packageDir, "wasm");
  const wasmTarget = path.join(distDir, "wasm");

  await cp(wasmSource, wasmTarget, { recursive: true });
}

async function stampHtmlVersion() {
  const htmlTargets = [
    path.join(distDir, "popup", "popup.html"),
    path.join(distDir, "options", "options.html")
  ];

  await Promise.all(
    htmlTargets.map(async (target) => {
      const contents = await readFile(target, "utf8");
      const updated = contents.replaceAll("__APP_VERSION__", process.env.npm_package_version ?? "2.0.0");
      await writeFile(target, updated, "utf8");
    })
  );
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await Promise.all(entryPoints.map(buildEntry));
  await copyStaticFiles();
  await Promise.all([copyOptionalDir("assets"), copyOptionalDir("models")]);
  await copyVisionRuntime();
  await stampHtmlVersion();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
