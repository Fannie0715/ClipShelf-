import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const launcherPath = path.join(os.homedir(), "Desktop", "复制素材库.app");
const contentsDir = path.join(launcherPath, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const runnerPath = path.join(root, "scripts", "run-app.sh");
const executableName = "ClipboardSidebarLauncher";
const executablePath = path.join(macosDir, executableName);

fs.chmodSync(runnerPath, 0o755);
fs.rmSync(launcherPath, { recursive: true, force: true });
fs.mkdirSync(macosDir, { recursive: true });

fs.writeFileSync(
  path.join(contentsDir, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>复制素材库</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleIdentifier</key>
  <string>local.clipboard-sidebar.launcher</string>
  <key>CFBundleName</key>
  <string>复制素材库</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`
);

fs.writeFileSync(
  executablePath,
  `#!/usr/bin/env bash
exec /bin/bash "${runnerPath}"
`
);
fs.chmodSync(executablePath, 0o755);

console.log(`Created ${launcherPath}`);
