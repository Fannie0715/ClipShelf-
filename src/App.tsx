import {
  Archive,
  BookmarkPlus,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderKanban,
  Image,
  Inbox,
  Link,
  MapPin,
  Monitor,
  Pause,
  Power,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClipboardItem, ClipboardKind, ClipboardState } from "./types";

const emptyState: ClipboardState = {
  settings: {
    paused: false,
    vaultPath: "",
    retentionDays: 7
  },
  items: []
};

type Filter = "all" | "today" | ClipboardKind | "saved";

const filters: Array<{ id: Filter; label: string; icon: typeof Inbox }> = [
  { id: "all", label: "全部", icon: Inbox },
  { id: "today", label: "今天", icon: Clock3 },
  { id: "text", label: "文本", icon: FileText },
  { id: "link", label: "链接", icon: Link },
  { id: "image", label: "图片", icon: Image },
  { id: "saved", label: "已入库", icon: Archive }
];

const categories = ["素材", "选题", "写作", "工具", "灵感", "待处理"];
const clipboardLibraryName = "复制素材库";

function isToday(value: string) {
  const target = new Date(value);
  const now = new Date();
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function fileUrl(filePath: string | null | undefined) {
  if (!filePath) return "";
  const encoded = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `file://${encoded}`;
}

function typeLabel(kind: ClipboardKind) {
  if (kind === "link") return "链接";
  if (kind === "image") return "图片";
  return "文本";
}

function TypeIcon({ kind }: { kind: ClipboardKind }) {
  if (kind === "link") return <Link size={15} />;
  if (kind === "image") return <Image size={15} />;
  return <FileText size={15} />;
}

function SourceContext({ item }: { item: ClipboardItem }) {
  const hasUrl = Boolean(item.sourceUrl);
  const hasWindowTitle = Boolean(item.windowTitle);
  const hasScreenshot = Boolean(item.screenshotPath);

  return (
    <div className={item.screenshotPath ? "source-context" : "source-context no-shot"}>
      <div className="source-card">
        <div className="source-card-heading">
          <span>
            <MapPin size={14} />
            复制位置
          </span>
          <small>{formatTime(item.createdAt)}</small>
        </div>
        <strong>{item.sourceApp || "Unknown"}</strong>
        {hasWindowTitle && <span className="source-window">{item.windowTitle}</span>}
        {hasUrl ? (
          <button
            className="source-url"
            type="button"
            title={item.sourceUrl}
            onClick={() => window.clipboardSidebar.openExternal(item.sourceUrl)}
          >
            <span>{item.sourceUrl}</span>
            <ExternalLink size={13} />
          </button>
        ) : (
          <span className="source-url muted">{hasScreenshot ? "未读取网页链接，已保存截图" : "未读取网页链接，截图未授权"}</span>
        )}
      </div>

      {item.screenshotPath ? (
        <img className="screenshot-preview" src={fileUrl(item.screenshotPath)} alt="复制时的窗口截图" />
      ) : (
        <div className="source-empty-preview">
          <Monitor size={28} />
          <span>{item.sourceApp || "Unknown"}</span>
        </div>
      )}
    </div>
  );
}

function useClipboardState() {
  const [state, setState] = useState<ClipboardState>(emptyState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    window.clipboardSidebar.getState().then((nextState) => {
      if (!mounted) return;
      setState(nextState);
      setLoading(false);
    });

    const unsubscribe = window.clipboardSidebar.onStateChanged((nextState) => {
      setState(nextState);
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { state, setState, loading };
}

export function App() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  useEffect(() => {
    document.body.classList.toggle("launcher-body", mode === "launcher");
    return () => document.body.classList.remove("launcher-body");
  }, [mode]);

  if (mode === "launcher") {
    return <FloatingLauncher />;
  }

  const { state, setState, loading } = useClipboardState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [saveTarget, setSaveTarget] = useState<ClipboardItem | null>(null);
  const [project, setProject] = useState(clipboardLibraryName);
  const [category, setCategory] = useState(categories[0]);
  const [editedContent, setEditedContent] = useState("");
  const [statusText, setStatusText] = useState("");

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return state.items.filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "today" && isToday(item.createdAt)) ||
        (filter === "saved" && Boolean(item.savedAt)) ||
        item.kind === filter;
      const haystack = [
        item.preview,
        item.text,
        item.sourceApp,
        item.windowTitle,
        item.sourceUrl,
        item.savedProject,
        item.savedCategory
      ]
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [filter, query, state.items]);

  const selected = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null;
  }, [filteredItems, selectedId]);

  useEffect(() => {
    if (!selected && filteredItems[0]) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (saveTarget) return;
      if (!filteredItems.length) return;
      const index = Math.max(0, filteredItems.findIndex((item) => item.id === selected?.id));

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedId(filteredItems[Math.min(index + 1, filteredItems.length - 1)].id);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedId(filteredItems[Math.max(index - 1, 0)].id);
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && selected) {
        event.preventDefault();
        openSave(selected);
      }

      if (event.key === "Enter" && selected) {
        event.preventDefault();
        openSave(selected);
      }

      if (event.key === "Backspace" && selected) {
        event.preventDefault();
        deleteItem(selected.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredItems, saveTarget, selected]);

  async function togglePaused() {
    const nextState = await window.clipboardSidebar.setPaused(!state.settings.paused);
    setState(nextState);
  }

  async function refresh() {
    const nextState = await window.clipboardSidebar.refresh();
    setState(nextState);
    setStatusText("已刷新");
    window.setTimeout(() => setStatusText(""), 1600);
  }

  async function deleteItem(id: string) {
    const nextState = await window.clipboardSidebar.deleteItem(id);
    setState(nextState);
    setStatusText("已删除");
    window.setTimeout(() => setStatusText(""), 1600);
  }

  async function clearItems() {
    const confirmed = window.confirm("确认清空所有本地暂存记录？已保存到 Obsidian 的素材不会删除。");
    if (!confirmed) return;

    const nextState = await window.clipboardSidebar.clearItems();
    setState(nextState);
    setSelectedId("");
    setStatusText("已清空暂存");
    window.setTimeout(() => setStatusText(""), 1600);
  }

  function openSave(item: ClipboardItem) {
    setSaveTarget(item);
    setProject(clipboardLibraryName);
    setCategory(item.savedCategory || categories[0]);
    setEditedContent(item.text || "");
  }

  async function saveToObsidian() {
    if (!saveTarget) return;
    const result = await window.clipboardSidebar.saveToObsidian({
      itemId: saveTarget.id,
      project,
      category,
      editedContent
    });
    setState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === result.item.id ? result.item : item))
    }));
    setSaveTarget(null);
    setStatusText("已保存到 Obsidian");
    window.setTimeout(() => setStatusText(""), 1800);
  }

  const savedCount = state.items.filter((item) => item.savedAt).length;
  const todayCount = state.items.filter((item) => isToday(item.createdAt)).length;

  return (
    <main className="app-shell">
      <section className="left-rail">
        <header className="app-header">
          <div>
            <p className="eyebrow">Clipboard</p>
            <h1>侧栏暂存</h1>
          </div>
          <div className="header-actions">
            <button
              className={`icon-button ${state.settings.paused ? "danger" : ""}`}
              type="button"
              title={state.settings.paused ? "恢复捕获" : "暂停捕获"}
              onClick={togglePaused}
            >
              {state.settings.paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button className="icon-button" type="button" title="刷新" onClick={refresh}>
              <RefreshCw size={17} />
            </button>
            <button className="icon-button danger" type="button" title="清空暂存记录" onClick={clearItems} disabled={!state.items.length}>
              <Trash2 size={16} />
            </button>
          </div>
        </header>

        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索内容、来源或项目" />
        </div>

        <nav className="filters" aria-label="Clipboard filters">
          {filters.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={filter === item.id ? "filter active" : "filter"}
                type="button"
                onClick={() => setFilter(item.id)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="stats-row">
          <span>{todayCount} 今日</span>
          <span>{savedCount} 已入库</span>
          <span>{state.settings.retentionDays} 天</span>
        </div>

        <section className="item-list">
          {loading ? (
            <div className="empty-state">加载中</div>
          ) : filteredItems.length ? (
            filteredItems.map((item) => (
              <button
                key={item.id}
                className={selected?.id === item.id ? "clip-item selected" : "clip-item"}
                type="button"
                onClick={() => setSelectedId(item.id)}
              >
                <span className={`type-pill ${item.kind}`}>
                  <TypeIcon kind={item.kind} />
                </span>
                <span className="clip-main">
                  <span className="clip-preview">{item.preview}</span>
                  <span className="clip-meta">
                    {item.sourceApp || "Unknown"} · {item.sourceUrl ? "网页 · " : ""}
                    {formatTime(item.createdAt)}
                  </span>
                </span>
                {item.savedAt && (
                  <span className="saved-mark" title="已入库">
                    <Check size={14} />
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="empty-state">暂无内容</div>
          )}
        </section>
      </section>

      <section className="detail-pane">
        {selected ? (
          <>
            <div className="detail-top">
              <div>
                <span className={`detail-type ${selected.kind}`}>{typeLabel(selected.kind)}</span>
                <h2>{selected.preview}</h2>
                <p>
                  {selected.sourceApp || "Unknown"} · {formatTime(selected.createdAt)}
                  {selected.sourceUrl ? ` · ${selected.sourceUrl}` : ""}
                </p>
              </div>
              <div className="detail-actions">
                <button className="ghost-button" type="button" onClick={() => deleteItem(selected.id)}>
                  <Trash2 size={16} />
                  删除
                </button>
                <button className="primary-button" type="button" onClick={() => openSave(selected)}>
                  <BookmarkPlus size={16} />
                  保存
                </button>
              </div>
            </div>

            <div className="preview-grid">
              <div className="preview-block">
                <div className="block-label">内容</div>
                {selected.kind === "image" ? (
                  selected.assetPath ? (
                    <img className="image-preview" src={fileUrl(selected.assetPath)} alt="Copied asset preview" />
                  ) : (
                    <div className="placeholder">图片缺失</div>
                  )
                ) : (
                  <pre>{selected.text}</pre>
                )}
              </div>

              <div className="preview-block compact">
                <div className="block-label">位置</div>
                <SourceContext item={selected} />
              </div>
            </div>

            <div className="metadata-strip">
              <span>{selected.sourceUrl || selected.windowTitle || "未读取窗口标题"}</span>
              <span>{selected.savedAt ? `${selected.savedProject} · ${selected.savedCategory}` : "未入库"}</span>
            </div>
          </>
        ) : (
          <div className="detail-empty">
            <Inbox size={38} />
            <span>等待新的复制内容</span>
          </div>
        )}
      </section>

      {statusText && <div className="toast">{statusText}</div>}

      {saveTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-title">
            <header>
              <div>
                <p className="eyebrow">Obsidian</p>
                <h3 id="save-title">保存到项目库</h3>
              </div>
              <button className="icon-button" type="button" title="关闭" onClick={() => setSaveTarget(null)}>
                <X size={17} />
              </button>
            </header>

            <label className="field">
              <span>项目库</span>
              <input value={project} readOnly />
            </label>

            <label className="field">
              <span>分类</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="field editor-field">
              <span>{saveTarget.kind === "image" ? "图片备注" : "入库内容"}</span>
              <textarea
                className="content-editor"
                value={editedContent}
                onChange={(event) => setEditedContent(event.target.value)}
                placeholder={saveTarget.kind === "image" ? "给这张图片补一段说明" : "保存前可以在这里修改复制内容"}
              />
            </label>

            <div className="save-summary">
              <FolderKanban size={16} />
              <span>{state.settings.vaultPath}</span>
            </div>

            <footer>
              <button className="ghost-button" type="button" onClick={() => setSaveTarget(null)}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={saveToObsidian}>
                <BookmarkPlus size={16} />
                入库
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function FloatingLauncher() {
  const { state, setState } = useClipboardState();
  const todayCount = state.items.filter((item) => isToday(item.createdAt)).length;
  const savedCount = state.items.filter((item) => item.savedAt).length;
  const latest = state.items[0]?.preview || "等待复制";

  async function togglePaused() {
    const nextState = await window.clipboardSidebar.setPaused(!state.settings.paused);
    setState(nextState);
  }

  async function refresh() {
    const nextState = await window.clipboardSidebar.refresh();
    setState(nextState);
  }

  return (
    <main className="launcher-shell" aria-label="复制素材库悬浮插件">
      <button className="launcher-avatar" type="button" title="打开复制素材库" onClick={() => window.clipboardSidebar.showMainWindow()}>
        <ClipboardList size={28} />
        <strong>复制</strong>
      </button>

      <section className="launcher-actions">
        <button className="launcher-action active" type="button" onClick={() => window.clipboardSidebar.showMainWindow()}>
          <span className="launcher-action-icon">
            <Inbox size={20} />
          </span>
          <span>
            <strong>复制库</strong>
            <small>{todayCount} 今日素材</small>
          </span>
        </button>

        <button className="launcher-action" type="button" onClick={refresh}>
          <span className="launcher-action-icon">
            <RefreshCw size={19} />
          </span>
          <span>
            <strong>刷新</strong>
            <small>{latest}</small>
          </span>
        </button>

        <button className="launcher-action" type="button" onClick={togglePaused}>
          <span className="launcher-action-icon">
            {state.settings.paused ? <Play size={19} /> : <Pause size={19} />}
          </span>
          <span>
            <strong>{state.settings.paused ? "恢复" : "暂停"}</strong>
            <small>{state.settings.paused ? "已停止捕获" : "正在捕获"}</small>
          </span>
        </button>

        <button className="launcher-action" type="button" onClick={() => window.clipboardSidebar.revealVault()}>
          <span className="launcher-action-icon">
            <FolderOpen size={20} />
          </span>
          <span>
            <strong>Ob库</strong>
            <small>{savedCount} 已入库</small>
          </span>
        </button>
      </section>

      <footer className="launcher-footer">
        <button className="launcher-round-button" type="button" title="展开/收起" onClick={() => window.clipboardSidebar.toggleMainWindow()}>
          <ChevronRight size={22} />
        </button>
        <button className="launcher-round-button" type="button" title="退出" onClick={() => window.clipboardSidebar.quitApp()}>
          <Power size={20} />
        </button>
      </footer>
    </main>
  );
}
