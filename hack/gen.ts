#!/usr/bin/env -S deno run -A
// Generate release artifacts from coreos-installer-* binaries in <artifacts_dir>:
//   - <artifacts_dir>/coreos-installer-<os>.gz   (gzipped sibling for each binary)
//   - <out_dir>/metadata/assets.json
//   - <out_dir>/metadata/SHA256SUMS
//   - <out_dir>/scripts/installer.sh
//   - <out_dir>/scripts/coreos-installer            (dotslash file)
//
// Usage: gen.ts <version> [artifacts_dir] [out_dir]

import Handlebars from "https://esm.sh/handlebars@4.7.8?dts";

const baseUrl = (() => {
  const server = Deno.env.get("GITHUB_SERVER_URL");
  const repo = Deno.env.get("GITHUB_REPOSITORY");
  if (server && repo) {
    return `${server}/${repo}`;
  }

  return "https://github.com/ZentriaMC/coreos-installer-static";
})();

const osToDotslashPlatform: Record<string, string> = {
  "x86_64-linux": "linux-x86_64",
  "aarch64-linux": "linux-aarch64",
};

interface Asset {
  name: string;
  os: string;
  sha256: string;
  size: number;
  gz_sha256: string;
  gz_size: number;
}

interface AssetsContext {
  version: string;
  assets: Asset[];
}

const [version, artifactsDir = "artifacts", outDir = "."] = Deno.args;
if (!version) {
  console.error("usage: gen.ts <version> [artifacts_dir] [out_dir]");
  Deno.exit(2);
}

const metadataDir = `${outDir}/metadata`;
const scriptsDir = `${outDir}/scripts`;
await Deno.mkdir(metadataDir, { recursive: true });
await Deno.mkdir(scriptsDir, { recursive: true });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function gzip(path: string): Promise<void> {
  const { code, stderr } = await new Deno.Command("gzip", {
    args: ["-nkf", path],
  }).output();
  if (code !== 0) {
    throw new Error(
      `gzip ${path} failed: ${new TextDecoder().decode(stderr)}`,
    );
  }
}

// Build assets metadata: gzip each binary, compute sha256/size for both variants.
const assets: Asset[] = [];
for await (const entry of Deno.readDir(artifactsDir)) {
  if (!entry.isFile) {
    continue;
  }
  if (!entry.name.startsWith("coreos-installer-")) {
    continue;
  }
  if (entry.name.endsWith(".gz")) {
    continue;
  }

  const path = `${artifactsDir}/${entry.name}`;
  const bare = await Deno.readFile(path);
  await gzip(path);
  const gz = await Deno.readFile(`${path}.gz`);

  assets.push({
    name: entry.name,
    os: entry.name.replace(/^coreos-installer-/, ""),
    sha256: await sha256Hex(bare),
    size: bare.byteLength,
    gz_sha256: await sha256Hex(gz),
    gz_size: gz.byteLength,
  });
}
assets.sort((a, b) => a.name.localeCompare(b.name));

const context: AssetsContext = { version, assets };

await Deno.writeTextFile(
  `${metadataDir}/assets.json`,
  JSON.stringify(context, null, 2) + "\n",
);

const installerTemplate = Handlebars.compile(
  await Deno.readTextFile("templates/installer.sh.hbs"),
  { strict: true },
);
const installerScript = installerTemplate(context);
await Deno.writeTextFile(`${scriptsDir}/installer.sh`, installerScript);

const platforms: Record<string, unknown> = {};
for (const asset of context.assets) {
  const platform = osToDotslashPlatform[asset.os];
  if (!platform) {
    console.warn(`No dotslash platform mapping for ${asset.os}, skipping`);
    continue;
  }
  platforms[platform] = {
    size: asset.gz_size,
    hash: "sha256",
    digest: asset.gz_sha256,
    format: "gz",
    path: asset.name,
    providers: [
      {
        url: `${baseUrl}/releases/download/${context.version}/${asset.name}.gz`,
      },
    ],
  };
}
const dotslashContent = `#!/usr/bin/env dotslash\n\n${
  JSON.stringify({ name: "coreos-installer", platforms }, null, 2)
}\n`;
await Deno.writeTextFile(`${scriptsDir}/coreos-installer`, dotslashContent);

const sha256sums: string[] = [];
for (const a of context.assets) {
  sha256sums.push(`${a.sha256}  ${a.name}`);
  sha256sums.push(`${a.gz_sha256}  ${a.name}.gz`);
}
const enc = new TextEncoder();
sha256sums.push(
  `${await sha256Hex(enc.encode(installerScript))}  installer.sh`,
);
sha256sums.push(
  `${await sha256Hex(enc.encode(dotslashContent))}  coreos-installer`,
);
await Deno.writeTextFile(
  `${metadataDir}/SHA256SUMS`,
  sha256sums.join("\n") + "\n",
);

console.log(
  `wrote ${metadataDir}/{assets.json,SHA256SUMS} and ${scriptsDir}/{installer.sh,coreos-installer}`,
);
