const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray
} = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const APP_NAME = "Clipboard Sidebar";
const RETENTION_DAYS = 7;
const CLIPBOARD_LIBRARY_NAME = "复制素材库";
const DEFAULT_VAULT_PATH = path.join(os.homedir(), "Documents", "Obsidian Vault");

function normalizeVaultPath(value) {
  return value || DEFAULT_VAULT_PATH;
}

const VAULT_PATH = normalizeVaultPath(process.env.CLIPBOARD_OBSIDIAN_VAULT);

let mainWindow = null;
let floatingWindow = null;
let tray = null;
let storePath = "";
let assetDir = "";
let screenshotDir = "";
let pollTimer = null;
let lastSignature = "";
let isPollingClipboard = false;
let isQuitting = false;
let state = {
  settings: {
    paused: false,
    vaultPath: VAULT_PATH,
    retentionDays: RETENTION_DAYS
  },
  items: []
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeId() {
  return `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
}

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeTextForSignature(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrlForSignature(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    const trackingKeys = new Set([
      "fbclid",
      "gclid",
      "gbraid",
      "wbraid",
      "gad_source",
      "gad_campaignid",
      "mc_cid",
      "mc_eid"
    ]);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_") || trackingKeys.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }

    const sortedParams = Array.from(parsed.searchParams.entries()).sort(([left], [right]) => left.localeCompare(right));
    parsed.search = "";
    for (const [key, paramValue] of sortedParams) {
      parsed.searchParams.append(key, paramValue);
    }

    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    return normalizeTextForSignature(value);
  }
}

function signatureForText(kind, value) {
  const normalizedKind = kind === "link" || isLikelyLink(value) ? "link" : "text";
  const normalizedValue = normalizedKind === "link" ? normalizeUrlForSignature(value) : normalizeTextForSignature(value);
  return `${normalizedKind}:${hash(normalizedValue)}`;
}

function legacySignatureForText(kind, value) {
  return `${kind}:${hash(String(value || ""))}`;
}

function signaturesForItem(item) {
  const signatures = new Set();
  if (item.signature) signatures.add(item.signature);

  if (item.kind === "image") {
    return signatures;
  }

  const text = item.text || item.preview || "";
  const kind = isLikelyLink(text) ? "link" : item.kind;
  signatures.add(signatureForText(kind, text));
  signatures.add(legacySignatureForText(kind, text));
  signatures.add(legacySignatureForText(item.kind, text));
  return signatures;
}

function canonicalSignatureForItem(item) {
  if (item.kind === "image") return item.signature || "";
  const text = item.text || item.preview || "";
  const kind = isLikelyLink(text) ? "link" : item.kind;
  return signatureForText(kind, text);
}

function isDuplicatePayload(payload) {
  const payloadSignatures = new Set([payload.signature]);
  if (payload.legacySignature) payloadSignatures.add(payload.legacySignature);

  return state.items.some((item) => {
    const itemSignatures = signaturesForItem(item);
    return Array.from(payloadSignatures).some((signature) => itemSignatures.has(signature));
  });
}

function dedupeStoredItems() {
  const bySignature = new Map();

  for (const item of state.items) {
    const signature = canonicalSignatureForItem(item) || item.signature || item.id;
    const existing = bySignature.get(signature);

    if (!existing) {
      bySignature.set(signature, item);
      continue;
    }

    if (!existing.savedAt && item.savedAt) {
      bySignature.set(signature, item);
    }
  }

  state.items = Array.from(bySignature.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function isLikelyLink(value) {
  return /^https?:\/\/\S+$/i.test(value) || /^obsidian:\/\/\S+$/i.test(value);
}

function extractFirstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s)\]}>）】》]+/i);
  return match ? match[0] : "";
}

function truncate(value, max = 280) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}

function safeFileName(value, fallback = "untitled") {
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|#^[\]]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function loadStore() {
  const dataDir = path.join(app.getPath("userData"), "data");
  assetDir = path.join(dataDir, "assets");
  screenshotDir = path.join(dataDir, "screenshots");
  storePath = path.join(dataDir, "clipboard-store.json");

  ensureDir(dataDir);
  ensureDir(assetDir);
  ensureDir(screenshotDir);

  if (!fs.existsSync(storePath)) {
    saveStore();
    return;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const savedVaultPath = parsed.settings?.vaultPath;
    const vaultPath = normalizeVaultPath(savedVaultPath);
    state = {
      settings: {
        paused: Boolean(parsed.settings?.paused),
        vaultPath,
        retentionDays: parsed.settings?.retentionDays || RETENTION_DAYS
      },
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
    const itemCount = state.items.length;
    dedupeStoredItems();
    if (savedVaultPath && savedVaultPath !== vaultPath) {
      saveStore();
    } else if (itemCount !== state.items.length) {
      saveStore();
    }
  } catch (error) {
    const backupPath = `${storePath}.broken-${Date.now()}`;
    fs.copyFileSync(storePath, backupPath);
    state = {
      settings: {
        paused: false,
        vaultPath: VAULT_PATH,
        retentionDays: RETENTION_DAYS
      },
      items: []
    };
    saveStore();
  }

  cleanupExpiredItems();
}

function saveStore() {
  if (!storePath) return;
  fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
}

function emptyDir(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function publicState() {
  return {
    settings: state.settings,
    items: state.items
  };
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("clipboard:state-changed", publicState());
  }
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send("clipboard:state-changed", publicState());
  }
}

function cleanupExpiredItems() {
  const cutoff = Date.now() - state.settings.retentionDays * 24 * 60 * 60 * 1000;
  const nextItems = state.items.filter((item) => item.savedAt || new Date(item.createdAt).getTime() >= cutoff);
  if (nextItems.length !== state.items.length) {
    state.items = nextItems;
    saveStore();
  }
}

function clearClipboardHistory() {
  const currentPayload = clipboardPayload();
  state.items = [];
  lastSignature = currentPayload?.signature || "";
  emptyDir(assetDir);
  emptyDir(screenshotDir);
  ensureDir(assetDir);
  ensureDir(screenshotDir);
  saveStore();
  broadcastState();
  return publicState();
}

function runAppleScript(script) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout: 1800 }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function getBrowserUrl(appName) {
  if (!appName) return "";

  const chromiumBrowsers = new Set([
    "Arc",
    "Brave Browser",
    "Google Chrome",
    "Microsoft Edge",
    "Vivaldi"
  ]);

  if (chromiumBrowsers.has(appName)) {
    return runAppleScript([
      `tell application "${appName}"`,
      "try",
      "return URL of active tab of front window",
      "end try",
      "end tell"
    ].join("\n"));
  }

  if (appName === "Safari") {
    return runAppleScript([
      'tell application "Safari"',
      "try",
      "return URL of front document",
      "end try",
      "end tell"
    ].join("\n"));
  }

  return "";
}

async function getActiveAppInfo() {
  if (process.platform !== "darwin") {
    return { appName: "Unknown", windowTitle: "", sourceUrl: "" };
  }

  const script = [
    'tell application "System Events"',
    "set frontApp to name of first application process whose frontmost is true",
    "set frontWindow to \"\"",
    "try",
    "set frontWindow to name of front window of process frontApp",
    "end try",
    "return frontApp & linefeed & frontWindow",
    "end tell"
  ].join("\n");

  const result = await runAppleScript(script);
  const [appName = "Unknown", windowTitle = ""] = result.split(/\r?\n/);
  const sourceUrl = await getBrowserUrl(appName);
  return {
    appName: appName || "Unknown",
    windowTitle: windowTitle || "",
    sourceUrl
  };
}

function pickWindowSource(sources, appInfo) {
  const appName = appInfo.appName.toLowerCase();
  const windowTitle = appInfo.windowTitle.toLowerCase();

  if (windowTitle) {
    const byTitle = sources.find((source) => source.name.toLowerCase().includes(windowTitle));
    if (byTitle) return byTitle;
  }

  if (appName && appName !== "unknown") {
    const byApp = sources.find((source) => source.name.toLowerCase().includes(appName));
    if (byApp) return byApp;
  }

  return sources.find((source) => !source.name.toLowerCase().includes(APP_NAME.toLowerCase())) || sources[0];
}

async function captureWindowThumbnail(id, appInfo) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 640, height: 420 },
      fetchWindowIcons: false
    });

    if (!sources.length) return null;
    const source = pickWindowSource(sources, appInfo);
    if (!source || source.thumbnail.isEmpty()) return null;

    const fileName = `window-${id}.png`;
    const filePath = path.join(screenshotDir, fileName);
    fs.writeFileSync(filePath, source.thumbnail.toPNG());
    return filePath;
  } catch (_error) {
    return null;
  }
}

async function captureScreenThumbnail(id) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 960, height: 640 },
      fetchWindowIcons: false
    });

    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;

    const fileName = `screen-${id}.png`;
    const filePath = path.join(screenshotDir, fileName);
    fs.writeFileSync(filePath, source.thumbnail.toPNG());
    return filePath;
  } catch (_error) {
    return null;
  }
}

function captureScreenWithSystemTool(id) {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") {
      resolve(null);
      return;
    }

    const fileName = `screen-${id}.png`;
    const filePath = path.join(screenshotDir, fileName);
    execFile("screencapture", ["-x", "-t", "png", filePath], { timeout: 2600 }, (error) => {
      if (error || !fs.existsSync(filePath)) {
        resolve(null);
        return;
      }
      resolve(filePath);
    });
  });
}

async function captureSourceContext(id, appInfo) {
  const windowShot = await captureWindowThumbnail(id, appInfo);
  if (windowShot) return windowShot;

  const screenShot = await captureScreenThumbnail(id);
  if (screenShot) return screenShot;

  return captureScreenWithSystemTool(id);
}

function clipboardPayload() {
  const text = normalizeText(clipboard.readText("clipboard"));

  if (text) {
    const kind = isLikelyLink(text) ? "link" : "text";
    return {
      kind,
      text,
      preview: kind === "link" ? text : truncate(text),
      signature: signatureForText(kind, text),
      legacySignature: legacySignatureForText(kind, text)
    };
  }

  const image = clipboard.readImage("clipboard");
  if (!image || image.isEmpty()) return null;

  const buffer = image.toPNG();
  return {
    kind: "image",
    imageBuffer: buffer,
    preview: "Copied image",
    signature: `image:${hash(buffer)}`,
    legacySignature: `image:${hash(buffer)}`
  };
}

async function pollClipboard() {
  if (state.settings.paused) return;

  const payload = clipboardPayload();
  if (!payload) return;
  if (payload.signature === lastSignature) return;
  if (isDuplicatePayload(payload)) {
    lastSignature = payload.signature;
    return;
  }

  const id = makeId();
  const appInfo = await getActiveAppInfo();
  let assetPath = "";

  if (payload.imageBuffer) {
    assetPath = path.join(assetDir, `clip-${id}.png`);
    fs.writeFileSync(assetPath, payload.imageBuffer);
  }

  const screenshotPath = await captureSourceContext(id, appInfo);
  const sourceUrl = appInfo.sourceUrl || extractFirstUrl(payload.text || "");
  const item = {
    id,
    kind: payload.kind,
    preview: payload.preview,
    text: payload.text || "",
    assetPath,
    screenshotPath,
    sourceApp: appInfo.appName,
    windowTitle: appInfo.windowTitle,
    sourceUrl,
    createdAt: new Date().toISOString(),
    savedAt: "",
    savedProject: "",
    savedCategory: "",
    signature: payload.signature
  };

  state.items = [item, ...state.items].slice(0, 500);
  lastSignature = payload.signature;
  cleanupExpiredItems();
  saveStore();
  broadcastState();
}

async function scanClipboard() {
  if (isPollingClipboard) return;

  isPollingClipboard = true;
  try {
    await pollClipboard();
  } catch (error) {
    console.error("[clipboard-sidebar] clipboard scan failed", error);
  } finally {
    isPollingClipboard = false;
  }
}

function startWatcher() {
  if (pollTimer) clearInterval(pollTimer);
  scanClipboard();
  pollTimer = setInterval(() => {
    scanClipboard();
  }, 900);
}

function markdownDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function fileDate(date = new Date()) {
  return markdownDate(date).replace(":", "-");
}

function markdownFence(value) {
  return String(value || "").replace(/```/g, "'''");
}

function yamlString(value) {
  return JSON.stringify(String(value || ""));
}

const KEYWORD_STOP_WORDS = new Set([
  "the",
  "this",
  "that",
  "with",
  "from",
  "into",
  "onto",
  "and",
  "for",
  "you",
  "your",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "part",
  "thing",
  "things",
  "about"
]);

function truncateKeyword(value, max = 34) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[#[\]()*_`>]+/g, "")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}

function keywordFromUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function keywordFromText(value) {
  const cleaned = String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[“”"']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const cjkMatch = cleaned.match(/[\u3400-\u9fff][\u3400-\u9fffA-Za-z0-9·-]{1,}/);
  if (cjkMatch) {
    return truncateKeyword(cjkMatch[0], 18);
  }

  const firstClause = cleaned.split(/\s+(?:is|are|was|were|will|can|could|should|starts?|feels?)\s+/i)[0] || cleaned;
  const words = (firstClause.match(/[A-Za-z][A-Za-z0-9'-]*/g) || [])
    .filter((word) => word.length > 2 && !KEYWORD_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 4);

  if (words.length >= 2) return truncateKeyword(words.join(" "));

  const fallbackWords = (cleaned.match(/[A-Za-z][A-Za-z0-9'-]*/g) || [])
    .filter((word) => word.length > 2 && !KEYWORD_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 4);

  return truncateKeyword(fallbackWords.join(" "));
}

function entryKeyword(item, typeLabel) {
  const candidates = [item.text, item.preview, item.windowTitle]
    .map((value) => keywordFromText(value))
    .filter(Boolean);

  if (candidates.length) return candidates[0];

  const urlKeyword = keywordFromUrl(item.sourceUrl || item.text);
  if (urlKeyword) return truncateKeyword(urlKeyword);

  return `${typeLabel}素材`;
}

function typeLabelForKind(kind) {
  return {
    text: "文本",
    link: "链接",
    image: "图片"
  }[kind] || kind;
}

function entryTitle(item) {
  const typeLabel = typeLabelForKind(item.kind);
  return `${markdownDate(new Date(item.createdAt))} · ${entryKeyword(item, typeLabel)}`;
}

function copyToObsidianAttachment(filePath, prefix) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const attachmentDir = path.join(normalizeVaultPath(state.settings.vaultPath), CLIPBOARD_LIBRARY_NAME, "附件");
  ensureDir(attachmentDir);
  const fileName = `${prefix}-${path.basename(filePath)}`;
  const dest = path.join(attachmentDir, fileName);
  fs.copyFileSync(filePath, dest);
  return `${CLIPBOARD_LIBRARY_NAME}/附件/${fileName}`;
}

function formatMaterialNote(item, savePayload, links, title) {
  const typeLabel = typeLabelForKind(item.kind);
  const created = markdownDate(new Date(item.createdAt));
  const saved = markdownDate();
  const category = savePayload.category || "未分类";
  const project = savePayload.project || "未归入项目";
  const lines = [
    "---",
    `title: ${yamlString(title)}`,
    `created: ${yamlString(created)}`,
    `saved: ${yamlString(saved)}`,
    `type: ${yamlString(item.kind)}`,
    `category: ${yamlString(category)}`,
    `project: ${yamlString(project)}`,
    `source_app: ${yamlString(item.sourceApp || "Unknown")}`,
    `source_title: ${yamlString(item.windowTitle || "")}`,
    `source_url: ${yamlString(item.sourceUrl || "")}`,
    `clipboard_id: ${yamlString(item.id)}`,
    `content_signature: ${yamlString(item.signature || "")}`,
    "tags:",
    "  - 复制素材库",
    `  - ${category}`,
    "---",
    "",
    `# ${title}`,
    "",
    `- 项目: ${project}`,
    `- 分类: ${category}`,
    `- 来源应用: ${item.sourceApp || "Unknown"}`,
    item.windowTitle ? `- 窗口: ${item.windowTitle}` : "",
    item.sourceUrl ? `- 页面链接: ${item.sourceUrl}` : "",
    `- 保存时间: ${saved}`,
    ""
  ].filter(Boolean);

  if (item.kind === "link") {
    lines.push("### 链接", "", `[${item.text}](${item.text})`, "");
  } else if (item.kind === "image") {
    lines.push("### 图片", "", links.clip ? `![[${links.clip}]]` : "_图片文件缺失_", "");
    if (item.text) {
      lines.push("### 备注", "", "```text", markdownFence(item.text), "```", "");
    }
  } else {
    lines.push("### 内容", "", "```text", markdownFence(item.text), "```", "");
  }

  if (links.screenshot) {
    lines.push("### 复制位置", "", `![[${links.screenshot}]]`, "");
  }

  lines.push("---", "");
  return `${lines.join("\n")}\n`;
}

function projectLibraryPath(vaultPath = normalizeVaultPath(state.settings.vaultPath)) {
  return path.join(vaultPath, CLIPBOARD_LIBRARY_NAME, `${CLIPBOARD_LIBRARY_NAME}.md`);
}

function materialNotesDir(vaultPath = normalizeVaultPath(state.settings.vaultPath)) {
  return path.join(vaultPath, CLIPBOARD_LIBRARY_NAME, "素材");
}

function ensureProjectLibraryNote(filePath) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      `# ${CLIPBOARD_LIBRARY_NAME}\n\n这里会自动追加从复制侧边栏保存的素材。每条素材会单独生成一篇笔记，下面只保留索引。\n\n## 素材索引\n\n`
    );
    return;
  }

  const current = fs.readFileSync(filePath, "utf8");
  if (!current.includes("## 素材索引")) {
    fs.appendFileSync(filePath, "\n## 素材索引\n\n");
  }
}

function notePathForTitle(vaultPath, title, existingPath) {
  if (existingPath && fs.existsSync(existingPath)) return existingPath;

  const notesDir = materialNotesDir(vaultPath);
  ensureDir(notesDir);

  const datePrefix = fileDate(new Date());
  const fileBase = safeFileName(title.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/, "$1 $2-$3"), datePrefix);
  let candidate = path.join(notesDir, `${fileBase}.md`);
  let index = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(notesDir, `${fileBase}-${index}.md`);
    index += 1;
  }

  return candidate;
}

function wikilinkTarget(vaultPath, notePath) {
  return path.relative(vaultPath, notePath).replace(/\\/g, "/").replace(/\.md$/i, "");
}

function indexLineForNote(vaultPath, notePath, title, item, category) {
  const target = wikilinkTarget(vaultPath, notePath);
  const source = item.sourceApp || "Unknown";
  const sourceLink = item.sourceUrl ? ` · [来源](${item.sourceUrl})` : "";
  return `- [[${target}|${title}]] · ${category} · ${source}${sourceLink}`;
}

function appendIndexLine(indexPath, line, notePath, vaultPath) {
  ensureProjectLibraryNote(indexPath);
  const target = wikilinkTarget(vaultPath, notePath);
  const current = fs.readFileSync(indexPath, "utf8");
  if (current.includes(`[[${target}|`) || current.includes(`[[${target}]]`)) return;
  fs.appendFileSync(indexPath, `${line}\n`);
}

async function openObsidianVault() {
  const vaultPath = normalizeVaultPath(state.settings.vaultPath || VAULT_PATH);
  const projectPath = projectLibraryPath(vaultPath);
  state.settings.vaultPath = vaultPath;
  ensureProjectLibraryNote(projectPath);
  saveStore();

  try {
    await shell.openExternal(`obsidian://open?path=${encodeURIComponent(projectPath)}`);
    return;
  } catch (_error) {
    await shell.openPath(projectPath);
  }
}

async function saveItemToObsidian(payload) {
  const item = state.items.find((candidate) => candidate.id === payload.itemId);
  if (!item) {
    throw new Error("Clipboard item not found");
  }

  const vaultPath = normalizeVaultPath(state.settings.vaultPath || VAULT_PATH);
  state.settings.vaultPath = vaultPath;
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Obsidian vault not found: ${vaultPath}`);
  }

  const cleanProject = CLIPBOARD_LIBRARY_NAME;
  const cleanCategory = safeFileName(payload.category || "未分类");
  const editedContent = String(payload.editedContent ?? "").trim();

  if (item.kind === "image") {
    item.text = editedContent;
    item.preview = editedContent ? truncate(editedContent) : "Copied image";
  } else {
    item.text = editedContent || item.text;
    item.kind = isLikelyLink(item.text) ? "link" : "text";
    item.preview = item.kind === "link" ? item.text : truncate(item.text);
    item.signature = signatureForText(item.kind, item.text);
  }

  const links = {
    clip: copyToObsidianAttachment(item.assetPath, "clip"),
    screenshot: copyToObsidianAttachment(item.screenshotPath, "source")
  };
  const title = entryTitle(item);
  const projectPath = projectLibraryPath(vaultPath);
  const notePath = notePathForTitle(vaultPath, title, item.savedNotePath);
  const noteContent = formatMaterialNote(item, { project: cleanProject, category: cleanCategory }, links, title);
  const indexLine = indexLineForNote(vaultPath, notePath, title, item, cleanCategory);

  ensureProjectLibraryNote(projectPath);
  fs.writeFileSync(notePath, noteContent);
  appendIndexLine(projectPath, indexLine, notePath, vaultPath);

  item.savedAt = new Date().toISOString();
  item.savedProject = cleanProject;
  item.savedCategory = cleanCategory;
  item.savedNotePath = notePath;
  saveStore();
  broadcastState();

  return {
    inboxPath: projectPath,
    projectPath,
    notePath,
    item
  };
}

function loadRenderer(window, mode = "main") {
  const devServerUrl = process.env.CLIPBOARD_SIDEBAR_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    if (mode !== "main") url.searchParams.set("mode", mode);
    window.loadURL(url.toString());
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: mode === "main" ? undefined : { mode }
    });
  }
}

function createWindow({ show = false } = {}) {
  const display = screen.getPrimaryDisplay();
  const width = 1020;
  const height = Math.min(760, display.workArea.height - 56);
  const x = display.workArea.x + display.workArea.width - width - 24;
  const y = display.workArea.y + 28;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 820,
    minHeight: 620,
    show,
    title: APP_NAME,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#111113",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  loadRenderer(mainWindow);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ show: true });
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function toggleMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    hideMainWindow();
    return;
  }

  showMainWindow();
}

function createFloatingWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 168;
  const height = 444;
  const x = display.workArea.x + display.workArea.width - width - 22;
  const y = display.workArea.y + Math.max(24, Math.round((display.workArea.height - height) / 2));

  floatingWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: true,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: `${APP_NAME} Launcher`,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  floatingWindow.setAlwaysOnTop(true, "floating");
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(floatingWindow, "launcher");

  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    {
      label: "Show Clipboard Sidebar",
      click: () => {
        showMainWindow();
      }
    },
    {
      label: state.settings.paused ? "Resume Capture" : "Pause Capture",
      click: () => {
        state.settings.paused = !state.settings.paused;
        saveStore();
        broadcastState();
        createTray();
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle("clipboard:get-state", () => publicState());

ipcMain.handle("clipboard:set-paused", async (_event, paused) => {
  state.settings.paused = Boolean(paused);
  saveStore();
  broadcastState();
  createTray();
  if (!state.settings.paused) {
    await scanClipboard();
  }
  return publicState();
});

ipcMain.handle("clipboard:delete-item", (_event, id) => {
  state.items = state.items.filter((item) => item.id !== id);
  saveStore();
  broadcastState();
  return publicState();
});

ipcMain.handle("clipboard:clear-items", () => clearClipboardHistory());

ipcMain.handle("clipboard:save-to-obsidian", (_event, payload) => saveItemToObsidian(payload));

ipcMain.handle("clipboard:reveal-vault", () => openObsidianVault());

ipcMain.handle("clipboard:refresh", async () => {
  await scanClipboard();
  return publicState();
});

ipcMain.handle("window:show-main", () => {
  showMainWindow();
  return publicState();
});

ipcMain.handle("window:toggle-main", () => {
  toggleMainWindow();
  return publicState();
});

ipcMain.handle("shell:open-external", async (_event, url) => {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target) && !/^obsidian:\/\//i.test(target)) {
    return false;
  }

  await shell.openExternal(target);
  return true;
});

ipcMain.handle("app:quit", () => {
  app.quit();
});

app.whenReady().then(() => {
  app.setName(APP_NAME);
  Menu.setApplicationMenu(null);
  loadStore();
  createWindow({ show: false });
  createFloatingWindow();
  createTray();
  startWatcher();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (pollTimer) clearInterval(pollTimer);
});
