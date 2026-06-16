export type ClipboardKind = "text" | "link" | "image";

export type ClipboardItem = {
  id: string;
  kind: ClipboardKind;
  preview: string;
  text: string;
  assetPath: string;
  screenshotPath: string | null;
  sourceApp: string;
  windowTitle: string;
  sourceUrl: string;
  createdAt: string;
  savedAt: string;
  savedProject: string;
  savedCategory: string;
  savedNotePath?: string;
  signature: string;
};

export type ClipboardState = {
  settings: {
    paused: boolean;
    vaultPath: string;
    retentionDays: number;
  };
  items: ClipboardItem[];
};

export type SavePayload = {
  itemId: string;
  project: string;
  category: string;
  editedContent: string;
};

export type SaveResult = {
  inboxPath: string;
  projectPath: string;
  notePath?: string;
  item: ClipboardItem;
};
