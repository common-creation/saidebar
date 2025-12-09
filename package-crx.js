import crx3 from "crx3";
import { writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";

const distDir = resolve("dist");
const outputFile = resolve("saidebar.crx");
const tempKeyFile = resolve(".tmp-key.pem");

// Check for private key
// In CI, the key is provided via environment variable
// Locally, you can use a key.pem file
let keyPath = null;
let useTempFile = false;

if (process.env.EXTENSION_PRIVATE_KEY) {
  // From environment variable (GitHub Actions secret)
  // Write to temp file since crx3 expects a file path
  writeFileSync(tempKeyFile, process.env.EXTENSION_PRIVATE_KEY);
  keyPath = tempKeyFile;
  useTempFile = true;
} else if (existsSync("key.pem")) {
  // From local file - pass path directly
  keyPath = resolve("key.pem");
}

if (!keyPath) {
  console.error("Error: No private key found.");
  console.error("Either set EXTENSION_PRIVATE_KEY environment variable or create key.pem file.");
  console.error("");
  console.error("To generate a new key:");
  console.error("  openssl genrsa -out key.pem 2048");
  process.exit(1);
}

async function packageExtension() {
  try {
    await crx3([resolve(distDir, "manifest.json")], {
      keyPath: keyPath,
      crxPath: outputFile,
    });

    console.log(`Successfully created ${outputFile}`);
  } catch (error) {
    console.error("Failed to create CRX:", error.message);
    process.exit(1);
  } finally {
    // Clean up temp key file if used
    if (useTempFile && existsSync(tempKeyFile)) {
      unlinkSync(tempKeyFile);
    }
  }
}

packageExtension();
