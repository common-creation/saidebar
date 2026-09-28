import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "fs";

const isWatch = process.argv.includes("--watch");

// Ensure dist directory exists
if (!existsSync("dist")) {
  mkdirSync("dist");
}

// Copy static files from root
cpSync("manifest.json", "dist/manifest.json");

// Copy static files from src
const srcFiles = ["sidebar.html", "sidebar.css"];
srcFiles.forEach((file) => {
  cpSync(`src/${file}`, `dist/${file}`);
});

// Copy icons directory
cpSync("icons", "dist/icons", { recursive: true });

// Build timestamp (UTC, YYYYMMDDHHmmss) used for the User-Agent
const buildTimestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

// Build sidebar.js, content.js and background.js with dependencies
const buildOptions = {
  entryPoints: ["src/sidebar.js", "src/content.js", "src/background.js"],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: ["chrome100"],
  minify: !isWatch,
  sourcemap: isWatch,
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete!");
}
