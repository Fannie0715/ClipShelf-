import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const arch = process.arch === "arm64" ? "arm64" : "x64";
const releaseDir = path.join(root, "release");
const appName = "ClipShelf";
const appPath = path.join(releaseDir, `${appName}.app`);
const zipName = `${appName}-mac-${arch}.zip`;
const zipPath = path.join(releaseDir, zipName);
const electronTemplate = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const distIndex = path.join(root, "dist", "index.html");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options
  });
}

function setPlistValue(plistPath, key, value) {
  const buddy = "/usr/libexec/PlistBuddy";
  try {
    execFileSync(buddy, ["-c", `Set :${key} ${value}`, plistPath]);
  } catch (_error) {
    execFileSync(buddy, ["-c", `Add :${key} string ${value}`, plistPath]);
  }
}

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true });
}

if (!fs.existsSync(electronTemplate)) {
  throw new Error("Electron runtime not found. Run npm install first.");
}

if (!fs.existsSync(distIndex)) {
  throw new Error("Renderer build not found. Run npm run build first.");
}

fs.rmSync(appPath, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(releaseDir, { recursive: true });

fs.cpSync(electronTemplate, appPath, { recursive: true });

const contentsDir = path.join(appPath, "Contents");
const resourcesDir = path.join(contentsDir, "Resources");
const appResourcesDir = path.join(resourcesDir, "app");
const plistPath = path.join(contentsDir, "Info.plist");
const oldExecutable = path.join(contentsDir, "MacOS", "Electron");
const newExecutable = path.join(contentsDir, "MacOS", appName);

if (fs.existsSync(oldExecutable)) {
  fs.renameSync(oldExecutable, newExecutable);
}

setPlistValue(plistPath, "CFBundleName", appName);
setPlistValue(plistPath, "CFBundleDisplayName", appName);
setPlistValue(plistPath, "CFBundleExecutable", appName);
setPlistValue(plistPath, "CFBundleIdentifier", "dev.fannie0715.clipshelf");
setPlistValue(plistPath, "CFBundleShortVersionString", packageJson.version);
setPlistValue(plistPath, "CFBundleVersion", packageJson.version);
setPlistValue(
  plistPath,
  "NSAppleEventsUsageDescription",
  "ClipShelf reads the active browser URL to save source context for copied materials."
);
setPlistValue(
  plistPath,
  "NSScreenCaptureDescription",
  "ClipShelf captures a screenshot thumbnail to preserve copy context."
);
setPlistValue(
  plistPath,
  "NSDocumentsFolderUsageDescription",
  "ClipShelf writes selected materials into your local Obsidian vault."
);

fs.rmSync(path.join(resourcesDir, "default_app.asar"), { force: true });
fs.rmSync(appResourcesDir, { recursive: true, force: true });
fs.mkdirSync(appResourcesDir, { recursive: true });

copyIfExists(path.join(root, "dist"), path.join(appResourcesDir, "dist"));
copyIfExists(path.join(root, "electron"), path.join(appResourcesDir, "electron"));
copyIfExists(path.join(root, "LICENSE"), path.join(appResourcesDir, "LICENSE"));
copyIfExists(path.join(root, "PRIVACY.md"), path.join(appResourcesDir, "PRIVACY.md"));
copyIfExists(path.join(root, "README.md"), path.join(appResourcesDir, "README.md"));

fs.writeFileSync(
  path.join(appResourcesDir, "package.json"),
  JSON.stringify(
    {
      name: packageJson.name,
      productName: appName,
      version: packageJson.version,
      description: packageJson.description,
      license: packageJson.license,
      main: packageJson.main,
      private: true
    },
    null,
    2
  )
);

try {
  run("codesign", ["--force", "--deep", "--sign", "-", appPath]);
} catch (_error) {
  console.warn("Ad-hoc codesign failed; continuing with unsigned app package.");
}

run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", `${appName}.app`, zipName], {
  cwd: releaseDir
});

console.log(`Packaged ${zipPath}`);
