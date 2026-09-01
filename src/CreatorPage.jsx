import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Box, Check, ChevronDown, Copy, Download, FileJson, Grid3X3, Layers3,
  MousePointer2, Move3D, Pause, Play, Plus, Redo2, Rotate3D, RotateCcw, Save,
  Scaling, Search, Sparkles, Trash2, Undo2, Upload, X,
} from "lucide-react";
import LevelScene from "./components/LevelScene";
import { exportLevelExcel, exportLevelJson } from "./exportExcel";
import { withoutLegacyWeapons } from "./levelData";
import { normalizeRoyalSmashLevel } from "./royalSmashLevel";

const clone = (value) => structuredClone(value);
const dataUrl = (path) => `${import.meta.env.BASE_URL}data/${path}`;
const OBJECT_LABELS = { block: "方块", platform: "平台" };

function historyReducer(state, action) {
  if (action.type === "RESET") return { past: [], present: action.value, future: [] };
  if (action.type === "COMMIT") return { past: [...state.past.slice(-79), state.present], present: action.value, future: [] };
  if (action.type === "UNDO" && state.past.length) return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] };
  if (action.type === "REDO" && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}

function IconButton({ title, active, className = "", children, ...props }) {
  return <button className={`icon-button ${active ? "active" : ""} ${className}`} title={title} aria-label={title} {...props}>{children}</button>;
}

function ExistingLevelPicker({ levels, onChoose, onBack }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const filtered = levels.filter((level) => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || String(level.id).includes(needle) || (level.name || "").toLowerCase().includes(needle) || (level.categoryName || level.category || "").toLowerCase().includes(needle);
    return matchesQuery && (category === "all" || level.category === category);
  });
  return <div className="level-picker-shell">
    <header className="topbar creator-topbar level-picker-topbar">
      <a className="icon-button" title="返回关卡浏览" aria-label="返回关卡浏览" href={import.meta.env.BASE_URL}><ArrowLeft size={18} /></a>
      <div className="brand-mark creator-brand"><span><Box size={18} /></span><div><strong>编辑现有关卡</strong><small>LEVEL EDITOR</small></div></div>
      <div className="topbar-spacer" />
      <button className="command-button secondary" onClick={onBack}><ArrowLeft size={15} /><span>返回</span></button>
    </header>
    <main className="level-picker-content">
      <div className="level-picker-heading"><div><span>选择要编辑的关卡</span><small>载入后可调整对象、平台、物理和关卡参数</small></div><b>{filtered.length} / {levels.length}</b></div>
      <div className="level-picker-filters">
        <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索关卡 ID 或分类" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={13} /></button>}</label>
        <label className="select-wrap"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option>{[...new Map(levels.map((item) => [item.category, item.categoryName || item.category])).entries()].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={13} /></label>
      </div>
      <div className="level-picker-grid">{filtered.map((level) => <button key={level.key} className="level-picker-card" onClick={() => onChoose(level)}><span className={`difficulty-dot diff-${level.difficulty.toLowerCase().replace("_", "-")}`} /><div><strong>{level.name || `关卡 ${level.id}`}</strong><small>{level.categoryName || level.category} · {level.counts.blocks} 个物品 · {level.counts.platforms} 个平台</small></div><ArrowRight size={16} /></button>)}{!filtered.length && <div className="empty-state"><Search size={24} /><span>没有匹配的关卡</span></div>}</div>
    </main>
  </div>;
}

function defaultMotion() {
  return {
    rotating: false, rotationSpeed: 0,
    horizontal: false, horizontalMin: 0, horizontalMax: 0, horizontalDirection: "Positive", horizontalSpeed: 0,
    vertical: false, verticalMin: 0, verticalMax: 0, verticalDirection: "Positive", verticalSpeed: 0,
  };
}

function stageMeta(stageIndex) {
  return stageIndex == null
    ? { area: "根关卡", stageIndex: null }
    : { area: "阶段关卡", stageIndex };
}

function profileFor(catalog, { materialId, shapeId, size = [1, 1, 1], colorId } = {}) {
  const profiles = catalog?.profiles || [];
  const sameMaterial = profiles.filter((profile) => profile.materialId === materialId);
  const sameShape = sameMaterial.filter((profile) => profile.shapeId === shapeId);
  const candidates = sameShape.length ? sameShape : sameMaterial;
  return [...candidates].sort((a, b) => {
    const colorPenalty = colorId == null ? 0 : Number(a.colorId !== colorId) - Number(b.colorId !== colorId);
    const sizeA = Math.abs((a.modelSize?.[1] || 1) - (size?.[1] || 1));
    const sizeB = Math.abs((b.modelSize?.[1] || 1) - (size?.[1] || 1));
    return colorPenalty || sizeA - sizeB;
  })[0] || null;
}

function upgradeRoyalSmashModels(level, catalog) {
  if (!level?.objects?.length || !catalog) return level;
  let changed = false;
  const objects = level.objects.map((item) => {
    if (item.type === "platform" && item.dataFamily !== "royal-smash") {
      changed = true;
      return { ...item, dataFamily: "royal-smash", platformShape: item.platformShape || "rect" };
    }
    if (item.type !== "block" || (item.dataFamily === "royal-smash" && item.modelPath)) return item;
    const legacyMaterialMap = { 0: 8, 1: 3, 2: 9, 3: 5, 4: 4, 6: 4, 7: 7, 8: 8, 9: 10 };
    const profile = profileFor(catalog, {
      ...item,
      materialId: catalog.profiles.some((candidate) => candidate.materialId === item.materialId)
        ? item.materialId
        : legacyMaterialMap[item.materialId] ?? 1,
    });
    if (!profile) return item;
    changed = true;
    return {
      ...item,
      dataFamily: "royal-smash",
      catalogId: profile.catalogId ?? profile.id,
      modelPath: profile.modelPath,
      modelSize: profile.modelSize,
      sourceShapeId: profile.sourceShapeId,
      materialId: profile.materialId,
      materialName: profile.material,
      shapeId: profile.shapeId,
      shapeName: profile.shape,
      colorId: profile.colorId,
      colorName: profile.colorName === "-1" ? "材质原色" : profile.colorName,
    };
  });
  return changed ? { ...level, objects } : level;
}

function makePlatform(stageIndex, index = 1) {
  return {
    uid: `platform-custom-${crypto.randomUUID()}`,
    type: "platform",
    dataFamily: "royal-smash",
    platformShape: "rect",
    name: `平台 ${index}`,
    ...stageMeta(stageIndex),
    path: `platforms/${index}`,
    platformIndex: index,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    size: [10, 1, 4],
    motion: defaultMotion(),
  };
}

function blankLevel(id = 1001) {
  return {
    key: `custom:${id}`,
    slug: `custom-${id}`,
    category: "custom",
    id,
    moveCount: 20,
    difficulty: "NORMAL",
    difficultyValue: 0,
    progressionCount: 1,
    firstProgressionLevel: id,
    ballCount: 20,
    counts: { platforms: 1, blocks: 0, barriers: 0, stages: 0, shutters: 0, waves: 0, generatedBlocks: 0, shutterBlocks: 0 },
    stages: [{ key: "root", name: "主关卡", stageIndex: null }],
    objects: [makePlatform(null)],
  };
}

function stagesFor(level) {
  if (level?.stages?.length && level.dataFamily !== "royal-smash") return level.stages;
  const indexes = [...new Set((level?.objects || []).map((item) => item.stageIndex).filter((value) => value != null))].sort((a, b) => a - b);
  if (level?.dataFamily === "royal-smash" && indexes.length) {
    return indexes.map((stageIndex, index) => ({ key: index === 0 ? "root" : `stage-${stageIndex}`, name: index === 0 ? "主关卡" : `子关卡 ${stageIndex}`, stageIndex }));
  }
  return [{ key: "root", name: "主关卡", stageIndex: null }, ...indexes.map((stageIndex) => ({ key: `stage-${stageIndex}`, name: `子关卡 ${stageIndex}`, stageIndex }))];
}

function withCounts(level) {
  const sanitized = withoutLegacyWeapons(level);
  const stages = stagesFor(sanitized);
  const objects = (sanitized.objects || []).map((item) => item.type === "platform"
    && item.uid?.includes("-custom-")
    && Math.abs((item.size?.[1] ?? 1) - 0.5) < 0.001
    ? { ...item, size: [item.size[0], 1, item.size[2]] }
    : item);
  return {
    ...sanitized,
    key: `${sanitized.category || "custom"}:${sanitized.id}`,
    slug: `${sanitized.category || "custom"}-${sanitized.id}`,
    firstProgressionLevel: sanitized.firstProgressionLevel || sanitized.id,
    stages,
    objects,
    counts: {
      ...(sanitized.counts || {}),
      platforms: objects.filter((item) => item.type === "platform").length,
      blocks: objects.filter((item) => item.type === "block").length,
      stages: Math.max(0, stages.length - 1),
    },
  };
}

function NumberField({ label, value, onCommit, step = 0.1, min }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  useEffect(() => setDraft(String(value ?? 0)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(min == null ? parsed : Math.max(min, parsed));
    else setDraft(String(value ?? 0));
  };
  return <label className="number-field"><span>{label}</span><input type="number" value={draft} min={min} step={step} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function VectorEditor({ title, value, onCommit, step = 0.1, min }) {
  return <div className="property-section vector-section"><div className="section-label">{title}</div><div className="vector-grid">{value.map((item, index) => <NumberField key={index} label={["X", "Y", "Z"][index]} value={item} step={step} min={min} onCommit={(next) => { const vector = [...value]; vector[index] = next; onCommit(vector); }} />)}</div></div>;
}

const PATTERNS = [
  { key: "single", label: "单块", description: "1 个" },
  { key: "row", label: "横排", description: "5 个" },
  { key: "column", label: "竖列", description: "5 个" },
  { key: "wall", label: "墙体", description: "5 x 5" },
  { key: "pyramid", label: "金字塔", description: "5 层" },
];

function patternPoints(pattern, size) {
  const [width, height] = size;
  if (pattern === "single") return [[0, height / 2, 0]];
  if (pattern === "row") return Array.from({ length: 5 }, (_, index) => [(index - 2) * width, height / 2, 0]);
  if (pattern === "column") return Array.from({ length: 5 }, (_, index) => [0, height / 2 + index * height, 0]);
  if (pattern === "wall") return Array.from({ length: 25 }, (_, index) => [((index % 5) - 2) * width, height / 2 + Math.floor(index / 5) * height, 0]);
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 - row }, (_, column) => [
    (column - (4 - row) / 2) * width,
    height / 2 + row * height,
    0,
  ])).flat();
}

function BatchInspector({ selectedItems, onApply, onDelete, onDuplicate, onSelectAll, onSelectSameMaterial, onClear }) {
  const [offset, setOffset] = useState([0, 0, 0]);
  const [rotation, setRotation] = useState([0, 0, 0]);
  const [scale, setScale] = useState([1, 1, 1]);
  const vectorFields = (value, setValue, step = 0.5) => <div className="vector-grid">{value.map((item, index) => <NumberField key={index} label={["X", "Y", "Z"][index]} value={item} step={step} onCommit={(next) => { const vector = [...value]; vector[index] = next; setValue(vector); }} />)}</div>;

  return <div className="inspector-scroll batch-inspector">
    <div className="object-heading">
      <span className="object-icon"><MousePointer2 size={17} /></span>
      <div><strong>{selectedItems.length} 个对象</strong><small>共享变换枢轴</small></div>
      <IconButton title="批量复制" onClick={onDuplicate}><Copy size={15} /></IconButton>
      <IconButton title="批量删除" className="danger" onClick={onDelete}><Trash2 size={15} /></IconButton>
    </div>
    <div className="property-section vector-section">
      <div className="section-label">批量位移</div>
      {vectorFields(offset, setOffset)}
      <button className="batch-apply" onClick={() => { onApply({ offset }); setOffset([0, 0, 0]); }}><Move3D size={14} />应用位移</button>
    </div>
    <div className="property-section vector-section">
      <div className="section-label">批量旋转增量（度）</div>
      {vectorFields(rotation, setRotation, 5)}
      <button className="batch-apply" onClick={() => { onApply({ rotation }); setRotation([0, 0, 0]); }}><Rotate3D size={14} />应用旋转</button>
    </div>
    <div className="property-section vector-section">
      <div className="section-label">批量缩放倍数</div>
      {vectorFields(scale, setScale, 0.1)}
      <button className="batch-apply" onClick={() => { onApply({ scale }); setScale([1, 1, 1]); }}><Scaling size={14} />应用缩放</button>
    </div>
    <div className="property-section batch-selection-actions"><div className="section-label">选择工具</div>
      <button onClick={onSelectAll}>全选方块</button>
      <button disabled={selectedItems.at(-1)?.type !== "block"} onClick={onSelectSameMaterial}>同材质</button>
      <button onClick={onClear}>清空选择</button>
    </div>
  </div>;
}

function CreatorInspector({ level, selected, selectedItems, catalog, activeStage, onUpdate, onDelete, onDuplicate, onLevelUpdate, onBatchApply, onSelectAll, onSelectSameMaterial, onClearSelection, open }) {
  const materials = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.materialId, item.material])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const shapes = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.shapeId, item.shape])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const colors = useMemo(() => [...new Map((catalog?.colors || []).map((item) => [item.colorId, item])).values()].sort((a, b) => a.colorId - b.colorId), [catalog]);

  const multiple = selectedItems.length > 1;
  return <aside className={`creator-properties ${open ? "open" : ""}`}>
    <div className="creator-panel-title"><div><strong>{multiple ? "批量编辑" : selected ? "对象属性" : "关卡设置"}</strong><small>{multiple ? `${selectedItems.length} 个对象` : selected ? selected.name : activeStage.name}</small></div></div>
    {multiple ? <BatchInspector selectedItems={selectedItems} onApply={onBatchApply} onDelete={onDelete} onDuplicate={onDuplicate} onSelectAll={onSelectAll} onSelectSameMaterial={onSelectSameMaterial} onClear={onClearSelection} /> : selected ? <div className="inspector-scroll">
      <div className="object-heading">
        <span className={`object-icon ${selected.type}`}><Box size={17} /></span>
        <div><strong>{selected.name}</strong><small>{OBJECT_LABELS[selected.type] || "对象"} · {activeStage.name}</small></div>
        <IconButton title="复制对象" onClick={onDuplicate}><Copy size={15} /></IconButton>
        <IconButton title="删除对象" className="danger" onClick={onDelete}><Trash2 size={15} /></IconButton>
      </div>
      {selected.type === "block" && <div className="property-section"><div className="section-label">外观</div>
        <label className="field-row"><span>材质</span><select value={selected.materialId} onChange={(event) => { const materialId = Number(event.target.value); onUpdate({ materialId, materialName: materials.find((item) => item.id === materialId)?.name || "材质" }); }}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field-row"><span>形状</span><select value={selected.shapeId} onChange={(event) => { const shapeId = Number(event.target.value); onUpdate({ shapeId, shapeName: shapes.find((item) => item.id === shapeId)?.name || "形状" }); }}>{shapes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="field-row color-row"><span>颜色</span><div className="swatches">{colors.map((item) => <button key={item.colorId} className={selected.colorId === item.colorId ? "selected" : ""} title={item.name} style={{ "--swatch": item.hex }} onClick={() => onUpdate({ colorId: item.colorId, colorName: item.name })} />)}</div></div>
      </div>}
      <VectorEditor title="位置" value={selected.position} onCommit={(position) => onUpdate({ position })} />
      <VectorEditor title="旋转（度）" value={selected.rotation} step={1} onCommit={(rotation) => onUpdate({ rotation })} />
      <VectorEditor title="尺寸" value={selected.size} min={0.05} onCommit={(size) => onUpdate({ size })} />
    </div> : <div className="inspector-scroll">
      <div className="property-section"><div className="section-label">关卡信息</div>
        <NumberField label="关卡 ID" value={level.id} min={1} step={1} onCommit={(id) => onLevelUpdate({ id, firstProgressionLevel: id })} />
        <label className="field-row"><span>分类</span><input className="text-field" value={level.category} onChange={(event) => onLevelUpdate({ category: event.target.value || "custom" })} /></label>
        <NumberField label="移动次数" value={level.moveCount} min={1} step={1} onCommit={(moveCount) => onLevelUpdate({ moveCount })} />
        <NumberField label="球数" value={level.ballCount} min={1} step={1} onCommit={(ballCount) => onLevelUpdate({ ballCount })} />
        <label className="field-row"><span>难度</span><select value={level.difficulty} onChange={(event) => { const values = { NORMAL: 0, HARD: 1, SUPER_HARD: 2 }; onLevelUpdate({ difficulty: event.target.value, difficultyValue: values[event.target.value] }); }}><option value="NORMAL">普通</option><option value="HARD">困难</option><option value="SUPER_HARD">超难</option></select></label>
      </div>
      <div className="stats-grid">
        <div><Box size={16} /><b>{level.objects.filter((item) => item.type === "block").length}</b><span>总方块</span></div>
        <div><Layers3 size={16} /><b>{level.objects.filter((item) => item.type === "platform").length}</b><span>总平台</span></div>
        <div><Sparkles size={16} /><b>{Math.max(level.stages.length - 1, 0)}</b><span>子关卡</span></div>
        <div><Move3D size={16} /><b>{level.moveCount}</b><span>移动</span></div>
      </div>
      <div className="selection-hint"><Box size={22} /><span>选择画布中的对象后，可精确修改位置、旋转和尺寸。</span></div>
    </div>}
  </aside>;
}

export default function CreatorPage() {
  const [catalog, setCatalog] = useState(null);
  const [levelIndex, setLevelIndex] = useState([]);
  const [history, dispatch] = useReducer(historyReducer, null, () => {
    const params = new URLSearchParams(window.location.search);
    const requestedSlug = params.get("level");
    const editMode = params.get("mode") === "edit" || Boolean(requestedSlug);
    const stored = editMode ? null : localStorage.getItem("knockout:creator:draft");
    if (stored) {
      try {
        const present = withCounts(JSON.parse(stored));
        const snapshot = JSON.stringify(present);
        if (snapshot !== stored) localStorage.setItem("knockout:creator:draft", snapshot);
        return { past: [], present, future: [] };
      } catch { localStorage.removeItem("knockout:creator:draft"); }
    }
    return { past: [], present: blankLevel(), future: [] };
  });
  const [activeStageKey, setActiveStageKey] = useState("root");
  const [selectedIds, setSelectedIds] = useState([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [mode, setMode] = useState("translate");
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapSize, setSnapSize] = useState(0.5);
  const [cameraCommand, setCameraCommand] = useState({ preset: "back", token: 0 });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [buildPattern, setBuildPattern] = useState(null);
  const [palette, setPalette] = useState({ materialId: 1, shapeId: 0, colorId: 0, size: [1, 1, 1] });
  const [savedSnapshot, setSavedSnapshot] = useState(() => new URLSearchParams(window.location.search).get("level") || new URLSearchParams(window.location.search).get("mode") === "edit" ? "" : localStorage.getItem("knockout:creator:draft") || "");
  const [pickerOpen, setPickerOpen] = useState(() => new URLSearchParams(window.location.search).get("mode") === "edit" && !new URLSearchParams(window.location.search).get("level"));
  const [toast, setToast] = useState("");
  const [physics, setPhysics] = useState({ enabled: false, paused: false, resetToken: 0, impactForce: 10 });
  const [physicsStatus, setPhysicsStatus] = useState("idle");
  const physicsTransformsRef = useRef([]);
  const importRef = useRef(null);
  const level = useMemo(() => withCounts(history.present), [history.present]);
  const stages = level.stages;
  const activeStage = stages.find((stage) => stage.key === activeStageKey) || stages[0];
  const stageObjects = useMemo(() => level.objects.filter((item) => {
    const itemStage = item.stageIndex ?? null;
    const activeStageIndex = activeStage.stageIndex ?? null;
    // Platforms at the root are shared scene geometry and stay visible while
    // editing any child stage; stage-local platforms remain scoped to that stage.
    return itemStage === activeStageIndex || (activeStageIndex != null && item.type === "platform" && itemStage == null);
  }), [level.objects, activeStage.stageIndex]);
  const visibleLevel = useMemo(() => ({ ...level, key: `${level.key}:${activeStage.key}`, objects: stageObjects }), [level, activeStage.key, stageObjects]);
  const selectedItems = selectedIds.map((uid) => level.objects.find((item) => item.uid === uid)).filter(Boolean);
  const selectedId = selectedIds.at(-1) || null;
  const selected = selectedItems.length === 1 ? selectedItems[0] : null;
  const primarySelected = selectedItems.at(-1) || null;
  const dirty = JSON.stringify(level) !== savedSnapshot;

  const materials = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.materialId, item.material])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const shapes = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.shapeId, item.shape])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const colors = useMemo(() => [...new Map((catalog?.colors || []).map((item) => [item.colorId, item])).values()].sort((a, b) => a.colorId - b.colorId), [catalog]);
  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const requestedSlug = params.get("level");
    const editMode = params.get("mode") === "edit" || Boolean(requestedSlug);
    fetch(dataUrl("catalog.json"))
      .then((response) => response.json())
      .then(async (gameCatalog) => {
        if (cancelled) return;
        setCatalog(gameCatalog);
        if (!requestedSlug && editMode) {
          const indexData = await fetch(dataUrl("index.json")).then((response) => response.json());
          if (!cancelled) setLevelIndex(indexData.levels || []);
          return;
        }
        if (!requestedSlug) return;
        try {
          const source = await fetch(dataUrl(`levels/${requestedSlug}.json`)).then((response) => {
            if (!response.ok) throw new Error("missing");
            return response.json();
          });
          const normalized = withCounts(withoutLegacyWeapons(normalizeRoyalSmashLevel(source, gameCatalog)));
          const stored = localStorage.getItem(`knockout:level:${normalized.key}`);
          let loaded = normalized;
          if (stored) {
            try {
              const cached = JSON.parse(stored);
              if (Array.isArray(cached.objects)) loaded = withCounts(withoutLegacyWeapons(cached));
            } catch {
              localStorage.removeItem(`knockout:level:${normalized.key}`);
            }
          }
          if (cancelled) return;
          dispatch({ type: "RESET", value: loaded });
          const firstContentStage = loaded.stages?.find((stage) => loaded.objects.some((item) => item.type === "block" && (item.stageIndex ?? null) === (stage.stageIndex ?? null)));
          setActiveStageKey(firstContentStage?.key || loaded.stages?.[0]?.key || "root");
          setSelectedIds([]);
          setSavedSnapshot(JSON.stringify(loaded));
          notify(`已载入 ${loaded.name || `关卡 ${loaded.id}`}，可直接编辑`);
        } catch {
          if (!cancelled) notify("现有关卡载入失败，已保留当前草稿");
        }
      })
      .catch(() => { if (!cancelled) setToast("模型目录载入失败"); });
    return () => { cancelled = true; };
  }, [notify]);
  const openExistingLevel = useCallback((item) => {
    window.location.href = `${import.meta.env.BASE_URL}?view=creator&mode=edit&level=${encodeURIComponent(item.slug)}`;
  }, []);
  useEffect(() => {
    const upgraded = upgradeRoyalSmashModels(history.present, catalog);
    if (upgraded !== history.present) dispatch({ type: "RESET", value: withCounts(upgraded) });
  }, [catalog, history.present]);
  useEffect(() => {
    const liveIds = new Set(level.objects.map((item) => item.uid));
    setSelectedIds((current) => {
      const valid = current.filter((uid) => liveIds.has(uid));
      return valid.length === current.length ? current : valid;
    });
  }, [history.present.objects]);
  const commit = useCallback((next) => dispatch({ type: "COMMIT", value: withCounts(next) }), []);

  const startPhysics = useCallback(() => {
    if (!stageObjects.some((item) => item.type === "block")) {
      notify("当前关卡没有可模拟对象");
      return;
    }
    physicsTransformsRef.current = [];
    setSelectedIds([]);
    setMultiSelect(false);
    setToolsOpen(false);
    setPropertiesOpen(false);
    setPhysics((current) => ({ ...current, enabled: true, paused: false, resetToken: current.resetToken + 1 }));
  }, [stageObjects, notify]);

  const exitPhysics = useCallback(() => {
    setPhysics((current) => ({ ...current, enabled: false, paused: false }));
    setPhysicsStatus("idle");
    physicsTransformsRef.current = [];
  }, []);

  const resetPhysics = useCallback(() => {
    physicsTransformsRef.current = [];
    setPhysicsStatus("loading");
    setPhysics((current) => ({ ...current, enabled: true, paused: false, resetToken: current.resetToken + 1 }));
  }, []);

  const applyPhysics = useCallback(() => {
    setPhysics((current) => ({ ...current, paused: true }));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (!physicsTransformsRef.current.length) return;
      const transforms = new Map(physicsTransformsRef.current.map((item) => [item.uid, item]));
      const next = clone(level);
      next.objects = next.objects.filter((item) => !transforms.get(item.uid)?.shattered);
      for (const item of next.objects) {
        const transform = transforms.get(item.uid);
        if (!transform) continue;
        item.position = transform.position;
        item.rotation = transform.rotation;
      }
      commit(next);
      setPhysics((current) => ({ ...current, enabled: false, paused: false }));
      setPhysicsStatus("idle");
      physicsTransformsRef.current = [];
      notify("物理落位结果已应用");
    }));
  }, [level, commit, notify]);

  const updateSelected = useCallback((changes) => {
    if (!selected) return;
    const next = clone(level);
    const item = next.objects.find((object) => object.uid === selected.uid);
    if (item) {
      Object.assign(item, changes);
      if (item.type === "block" && ("materialId" in changes || "shapeId" in changes || "colorId" in changes)) {
        const profile = profileFor(catalog, {
          materialId: item.materialId,
          shapeId: item.shapeId,
          size: item.size,
          colorId: item.colorId,
        });
        if (profile) Object.assign(item, {
          dataFamily: "royal-smash",
          catalogId: profile.catalogId ?? profile.id,
          modelPath: profile.modelPath,
          modelSize: profile.modelSize,
          sourceShapeId: profile.sourceShapeId,
          materialId: profile.materialId,
          materialName: profile.material,
          shapeId: profile.shapeId,
          shapeName: profile.shape,
          colorId: profile.colorId,
          colorName: profile.colorName === "-1" ? "材质原色" : profile.colorName,
        });
      }
    }
    commit(next);
  }, [level, selected, catalog, commit]);
  const updateLevel = useCallback((changes) => commit({ ...level, ...changes }), [level, commit]);
  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    commit({ ...level, objects: level.objects.filter((item) => !ids.has(item.uid)) });
    setSelectedIds([]);
  }, [level, selectedIds, commit]);
  const duplicateSelected = useCallback(() => {
    if (!selectedItems.length) return;
    let blockIndex = level.objects.filter((item) => item.type === "block").length;
    let platformIndex = level.objects.filter((item) => item.type === "platform").length;
    const copies = selectedItems.map((item) => {
      const copy = clone(item);
      copy.uid = `${copy.type}-custom-${crypto.randomUUID()}`;
      copy.name = `${copy.name} 副本`;
      copy.position = [copy.position[0] + snapSize, copy.position[1] + snapSize, copy.position[2]];
      if (copy.type === "block") copy.blockIndex = ++blockIndex;
      if (copy.type === "platform") copy.platformIndex = ++platformIndex;
      return copy;
    });
    commit({ ...level, objects: [...level.objects, ...copies] });
    setSelectedIds(copies.map((item) => item.uid));
  }, [level, selectedItems, snapSize, commit]);

  const applyBatch = useCallback(({ offset, rotation, scale }) => {
    if (selectedItems.length < 2) return;
    const ids = new Set(selectedIds);
    const next = clone(level);
    for (const item of next.objects) {
      if (!ids.has(item.uid)) continue;
      if (offset) item.position = item.position.map((value, index) => Number((value + offset[index]).toFixed(4)));
      if (rotation) item.rotation = item.rotation.map((value, index) => Number((value + rotation[index]).toFixed(3)));
      if (scale) item.size = item.size.map((value, index) => Number(Math.max(0.05, value * scale[index]).toFixed(4)));
    }
    commit(next);
  }, [level, selectedIds, selectedItems.length, commit]);

  const updateTransformBatch = useCallback((changes) => {
    if (!changes?.length) return;
    const next = clone(level);
    const byId = new Map(changes.map((change) => [change.uid, change]));
    for (const item of next.objects) {
      const change = byId.get(item.uid);
      if (change) Object.assign(item, { position: change.position, rotation: change.rotation, size: change.size });
    }
    commit(next);
  }, [level, commit]);

  const selectAllBlocks = useCallback(() => setSelectedIds(stageObjects.filter((item) => item.type === "block").map((item) => item.uid)), [stageObjects]);
  const selectSameMaterial = useCallback(() => {
    if (primarySelected?.type !== "block") return;
    setSelectedIds(stageObjects.filter((item) => item.type === "block" && item.materialId === primarySelected.materialId).map((item) => item.uid));
  }, [stageObjects, primarySelected]);

  const handleSceneSelect = useCallback((uid, options = {}) => {
    const additive = multiSelect || options.additive;
    if (!uid) {
      if (!additive) setSelectedIds([]);
      return;
    }
    if (additive) {
      setSelectedIds((current) => current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]);
      return;
    }
    setSelectedIds([uid]);
    setPropertiesOpen(true);
    setToolsOpen(false);
  }, [multiSelect]);

  const addPattern = useCallback((pattern) => {
    const points = patternPoints(pattern, palette.size);
    const start = level.objects.filter((item) => item.type === "block").length;
    const profile = profileFor(catalog, palette);
    const materialName = profile?.material || materials.find((item) => item.id === palette.materialId)?.name || "材质";
    const shapeName = profile?.shape || shapes.find((item) => item.id === palette.shapeId)?.name || "形状";
    const color = colors.find((item) => item.materialId === profile?.materialId && item.colorId === profile?.colorId) || colors.find((item) => item.colorId === palette.colorId);
    const blocks = points.map((position, index) => ({
      uid: `block-custom-${crypto.randomUUID()}`,
      type: "block",
      dataFamily: "royal-smash",
      name: `方块 ${start + index + 1}`,
      ...stageMeta(activeStage.stageIndex),
      platformIndex: null, waveIndex: null, shutterIndex: null, blockIndex: start + index + 1,
      catalogId: profile?.catalogId ?? profile?.id ?? null,
      modelPath: profile?.modelPath || null,
      modelSize: profile?.modelSize || [...palette.size],
      sourceShapeId: profile?.sourceShapeId ?? palette.shapeId,
      materialId: profile?.materialId ?? palette.materialId, materialName,
      shapeId: profile?.shapeId ?? palette.shapeId, shapeName,
      colorId: profile?.colorId ?? palette.colorId, colorName: profile?.colorName === "-1" ? "材质原色" : profile?.colorName || color?.name || "颜色",
      position, rotation: [0, 0, 0], size: [...palette.size],
    }));
    commit({ ...level, objects: [...level.objects, ...blocks] });
    setSelectedIds(blocks.at(-1) ? [blocks.at(-1).uid] : []);
    setCameraCommand((current) => ({ ...current, token: current.token + 1 }));
    notify(`已生成 ${blocks.length} 个方块`);
  }, [level, palette, materials, shapes, colors, activeStage, commit, notify]);

  const addPlatform = useCallback(() => {
    const index = level.objects.filter((item) => item.type === "platform").length + 1;
    const item = makePlatform(activeStage.stageIndex, index);
    commit({ ...level, objects: [...level.objects, item] });
    setSelectedIds([item.uid]);
    setCameraCommand((current) => ({ ...current, token: current.token + 1 }));
  }, [level, activeStage, commit]);

  const addStage = useCallback(() => {
    const indexes = stages.map((stage) => stage.stageIndex).filter((value) => value != null);
    const stageIndex = Math.max(0, ...indexes) + 1;
    const stage = { key: `stage-${stageIndex}`, name: `子关卡 ${stageIndex}`, stageIndex };
    commit({ ...level, stages: [...stages, stage], objects: [...level.objects, makePlatform(stageIndex, level.counts.platforms + 1)] });
    setActiveStageKey(stage.key);
    setSelectedIds([]);
    setCameraCommand((current) => ({ preset: "back", token: current.token + 1 }));
  }, [level, stages, commit]);

  const removeStage = useCallback(() => {
    if (activeStage.stageIndex == null || !window.confirm(`删除${activeStage.name}及其中全部对象？`)) return;
    const nextStages = stages.filter((stage) => stage.key !== activeStage.key);
    commit({ ...level, stages: nextStages, objects: level.objects.filter((item) => item.stageIndex !== activeStage.stageIndex) });
    setActiveStageKey("root");
    setSelectedIds([]);
  }, [level, stages, activeStage, commit]);

  const clearStage = useCallback(() => {
    if (!window.confirm(`清空${activeStage.name}中的全部方块？平台会保留。`)) return;
    commit({ ...level, objects: level.objects.filter((item) => (item.stageIndex ?? null) !== (activeStage.stageIndex ?? null) || item.type === "platform") });
    setSelectedIds([]);
  }, [level, activeStage, commit]);

  const save = useCallback(() => {
    const next = withCounts(level);
    const snapshot = JSON.stringify(next);
    if (next.key && String(next.key).startsWith("custom:")) localStorage.setItem("knockout:creator:draft", snapshot);
    if (next.key && !String(next.key).startsWith("custom:")) localStorage.setItem(`knockout:level:${next.key}`, snapshot);
    setSavedSnapshot(snapshot);
    notify(next.category === "custom" ? "草稿已保存到本地" : "关卡修改已保存到本地");
  }, [level, notify]);

  const resetLevel = useCallback(() => {
    if (dirty && !window.confirm("新建关卡会替换当前未保存内容，继续吗？")) return;
    const next = blankLevel(Number(level.id) + 1);
    dispatch({ type: "RESET", value: next });
    setActiveStageKey("root");
    setSelectedIds([]);
    setSavedSnapshot("");
    setCameraCommand((current) => ({ preset: "back", token: current.token + 1 }));
  }, [dirty, level.id]);

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = withCounts(upgradeRoyalSmashModels(JSON.parse(await file.text()), catalog));
      if (!Array.isArray(data.objects)) throw new Error("invalid");
      dispatch({ type: "RESET", value: data });
      setActiveStageKey(data.stages[0].key);
      setSelectedIds([]);
      setSavedSnapshot("");
      notify("关卡 JSON 已载入");
    } catch { notify("不是有效的关卡 JSON"); }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && buildPattern) { setBuildPattern(null); return; }
      if (event.key === "Escape" && physics.enabled) { exitPhysics(); return; }
      if (event.key === "Escape") { setSelectedIds([]); setMultiSelect(false); return; }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
      if (physics.enabled) return;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "REDO" : "UNDO" }); }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "REDO" }); }
      if ((event.key === "Delete" || event.key === "Backspace") && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) deleteSelected();
      if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, deleteSelected, duplicateSelected, buildPattern, physics.enabled, exitPhysics]);

  const pendingPattern = PATTERNS.find((pattern) => pattern.key === buildPattern);
  const pendingCount = buildPattern ? patternPoints(buildPattern, palette.size).length : 0;

  if (pickerOpen) return <ExistingLevelPicker levels={levelIndex} onChoose={openExistingLevel} onBack={() => { window.location.href = import.meta.env.BASE_URL; }} />;

  return <div className={`app-shell creator-shell ${physics.enabled ? "physics-active" : ""}`}>
    <header className="topbar creator-topbar">
      <a className="icon-button" title="返回关卡浏览" aria-label="返回关卡浏览" href={import.meta.env.BASE_URL}><ArrowLeft size={18} /></a>
      <div className="brand-mark creator-brand"><span><Sparkles size={18} /></span><div><strong>{level.category === "custom" ? "新关卡编辑器" : "关卡编辑器"}</strong><small>{level.category === "custom" ? "LEVEL CREATOR" : "LEVEL EDITOR"}</small></div></div>
      <div className="current-level"><span>关卡 {level.id}</span><small>{activeStage.name}</small>{dirty && <i title="有未保存修改" />}</div>
      <div className="topbar-spacer" />
      <div className="history-tools">
        <IconButton title="撤销" disabled={physics.enabled || !history.past.length} onClick={() => dispatch({ type: "UNDO" })}><Undo2 size={17} /></IconButton>
        <IconButton title="重做" disabled={physics.enabled || !history.future.length} onClick={() => dispatch({ type: "REDO" })}><Redo2 size={17} /></IconButton>
      </div>
      <button className="command-button secondary" disabled={physics.enabled} onClick={resetLevel}><Plus size={16} /><span>新建</span></button>
      <button className="command-button secondary" disabled={physics.enabled} onClick={() => importRef.current?.click()}><Upload size={16} /><span>导入</span></button>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
      <button className="command-button secondary" onClick={() => exportLevelExcel(withCounts(level))}><Download size={16} /><span>Excel</span></button>
      <IconButton title="导出 JSON" onClick={() => exportLevelJson(withCounts(level))}><FileJson size={16} /></IconButton>
      <button className={`command-button save-button ${dirty ? "dirty" : ""}`} onClick={save}><Save size={16} /><span>{dirty ? "保存草稿" : "已保存"}</span></button>
      <IconButton title="打开搭建工具" className="creator-mobile-toggle creator-mobile-tools" onClick={() => { setToolsOpen(true); setPropertiesOpen(false); }}><Layers3 size={18} /></IconButton>
      <IconButton title="打开属性面板" className="creator-mobile-toggle creator-mobile-properties" onClick={() => { setPropertiesOpen(true); setToolsOpen(false); }}><Box size={18} /></IconButton>
    </header>

    <main className="creator-workspace">
      <aside className={`creator-tools ${toolsOpen ? "open" : ""}`}>
        <div className="creator-panel-title"><div><strong>关卡结构</strong><small>主关卡与子关卡</small></div><IconButton title="新增子关卡" onClick={addStage}><Plus size={16} /></IconButton></div>
        <div className="stage-list">
          {stages.map((stage) => {
            const count = level.objects.filter((item) => (item.stageIndex ?? null) === (stage.stageIndex ?? null) && item.type === "block").length;
            return <button key={stage.key} className={stage.key === activeStage.key ? "active" : ""} onClick={() => { setActiveStageKey(stage.key); setSelectedIds([]); setCameraCommand((current) => ({ preset: "back", token: current.token + 1 })); }}><span><Layers3 size={15} />{stage.name}</span><b>{count}</b></button>;
          })}
        </div>
        <div className="stage-actions">
          <button onClick={addStage}><Plus size={14} />子关卡</button>
          <button onClick={clearStage}>清空方块</button>
          {activeStage.stageIndex != null && <IconButton title="删除当前子关卡" className="danger" onClick={removeStage}><Trash2 size={15} /></IconButton>}
        </div>

        <div className="tool-section pattern-section">
          <div className="section-label">快速搭建</div>
          <div className="pattern-grid">{PATTERNS.map((pattern) => <button key={pattern.key} onClick={() => setBuildPattern(pattern.key)}><Box size={16} /><span>{pattern.label}</span><small>{pattern.description}</small></button>)}</div>
          <button className="wide-tool-button" onClick={addPlatform}><Plus size={15} /><Layers3 size={16} />添加平台</button>
        </div>
      </aside>

      <section className="viewport creator-viewport">
        <LevelScene level={visibleLevel} catalog={catalog} selectedId={selectedId} selectedIds={selectedIds} onSelect={handleSceneSelect} onTransform={(uid, changes) => { const next = clone(level); const item = next.objects.find((object) => object.uid === uid); if (item) Object.assign(item, changes); commit(next); }} onTransformBatch={updateTransformBatch} mode={mode} showGrid={showGrid} cameraCommand={cameraCommand} snap={{ enabled: snapEnabled, translation: snapSize, rotation: 15, scale: snapSize }} physics={physics} onPhysicsUpdate={(transforms) => { physicsTransformsRef.current = transforms; }} onPhysicsStatus={setPhysicsStatus} />
        <div className="scene-toolbar" aria-label="场景工具">
          <IconButton title="移动" disabled={physics.enabled} active={mode === "translate"} onClick={() => setMode("translate")}><Move3D size={18} /></IconButton>
          <IconButton title="旋转" disabled={physics.enabled} active={mode === "rotate"} onClick={() => setMode("rotate")}><Rotate3D size={18} /></IconButton>
          <IconButton title="缩放" disabled={physics.enabled} active={mode === "scale"} onClick={() => setMode("scale")}><Scaling size={18} /></IconButton>
          <span />
          <IconButton title="多选对象" disabled={physics.enabled} active={multiSelect} onClick={() => setMultiSelect((value) => !value)}><MousePointer2 size={18} /></IconButton>
          <IconButton title="显示网格" active={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={18} /></IconButton>
          <button className={`snap-toggle ${snapEnabled ? "active" : ""}`} disabled={physics.enabled} onClick={() => setSnapEnabled((value) => !value)}>吸附</button>
          <select className="snap-select" value={snapSize} disabled={physics.enabled || !snapEnabled} onChange={(event) => setSnapSize(Number(event.target.value))}><option value="0.25">0.25</option><option value="0.5">0.5</option><option value="1">1</option></select>
          <span />
          <button className={`physics-launch ${physics.enabled ? "active" : ""}`} disabled={physics.enabled} title="让当前关卡方块按重力和碰撞运行" onClick={startPhysics}><Play size={14} />物理</button>
        </div>
        <div className="camera-toolbar">
          {[["iso", "透视"], ["front", "正视图"], ["side", "右侧视图"], ["back", "背视图"], ["top", "顶视"]].map(([preset, label]) => <button key={preset} onClick={() => setCameraCommand((current) => ({ preset, token: current.token + 1 }))}>{label}</button>)}
        </div>
        {(multiSelect || selectedItems.length > 1) && <div className="batch-toolbar" aria-label="批量选择工具">
          <strong>{selectedItems.length} 已选</strong>
          <button onClick={selectAllBlocks}>全选方块</button>
          <button disabled={primarySelected?.type !== "block"} onClick={selectSameMaterial}>同材质</button>
          <button disabled={!selectedItems.length} onClick={duplicateSelected}>复制</button>
          <button disabled={!selectedItems.length} className="danger" onClick={deleteSelected}>删除</button>
          <IconButton title="清空选择" onClick={() => setSelectedIds([])}><X size={15} /></IconButton>
        </div>}
        {physics.enabled && <div className="physics-toolbar" aria-label="物理预演工具">
          <strong><i className={physicsStatus} />{{ loading: "载入物理", running: "物理运行中", paused: "物理已暂停", error: "物理启动失败" }[physicsStatus] || "物理预演"}</strong>
          <label className="physics-force">
            <span>点击力道</span>
            <input type="range" min="2" max="20" step="1" value={physics.impactForce} aria-label="点击力道" onChange={(event) => setPhysics((current) => ({ ...current, impactForce: Number(event.target.value) }))} />
            <b>{physics.impactForce}</b>
          </label>
          <button disabled={physicsStatus === "loading" || physicsStatus === "error"} onClick={() => setPhysics((current) => ({ ...current, paused: !current.paused }))}>{physics.paused ? <Play size={14} /> : <Pause size={14} />}{physics.paused ? "继续" : "暂停"}</button>
          <button disabled={physicsStatus === "loading"} onClick={resetPhysics}><RotateCcw size={14} />重置</button>
          <button className="apply" disabled={physicsStatus === "loading" || physicsStatus === "error"} onClick={applyPhysics}><Check size={14} />应用结果</button>
          <button onClick={exitPhysics}><X size={14} />退出</button>
        </div>}
        <div className="viewport-status">
          <span className={`status-dot ${dirty ? "dirty" : ""}`} />
          <span>{activeStage.name} · {physics.enabled ? ({ loading: "正在初始化物理", running: "重力与碰撞预演", paused: "物理预演已暂停", error: "物理引擎不可用" }[physicsStatus] || "物理预演") : selectedItems.length > 1 ? `${selectedItems.length} 个对象已选` : selected ? selected.name : multiSelect ? "多选模式" : "点击对象进行编辑"}</span>
          <b>{stageObjects.length} 对象 · 网格 {snapEnabled ? snapSize : "关闭"}</b>
        </div>
      </section>

      <CreatorInspector level={level} selected={selected} selectedItems={selectedItems} catalog={catalog} activeStage={activeStage} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected} onLevelUpdate={updateLevel} onBatchApply={applyBatch} onSelectAll={selectAllBlocks} onSelectSameMaterial={selectSameMaterial} onClearSelection={() => setSelectedIds([])} open={propertiesOpen} />
      {(toolsOpen || propertiesOpen) && <button className="creator-mobile-scrim" aria-label="关闭面板" onClick={() => { setToolsOpen(false); setPropertiesOpen(false); }} />}
    </main>
    {pendingPattern && <div className="build-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setBuildPattern(null); }}>
      <section className="build-dialog" role="dialog" aria-modal="true" aria-labelledby="build-dialog-title">
        <header>
          <div><strong id="build-dialog-title">搭建{pendingPattern.label}</strong><small>{activeStage.name} · {pendingCount} 个方块</small></div>
          <IconButton title="取消搭建" onClick={() => setBuildPattern(null)}><X size={17} /></IconButton>
        </header>
        <div className="build-dialog-body">
          <label className="build-option"><span>材质</span><select value={palette.materialId} onChange={(event) => setPalette((current) => ({ ...current, materialId: Number(event.target.value) }))}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="build-option"><span>形状</span><select value={palette.shapeId} onChange={(event) => setPalette((current) => ({ ...current, shapeId: Number(event.target.value) }))}>{shapes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="build-option build-colors"><span>颜色</span><div className="creator-swatches">{colors.map((item) => <button key={item.colorId} className={palette.colorId === item.colorId ? "active" : ""} title={item.name} aria-label={item.name} style={{ "--swatch": item.hex }} onClick={() => setPalette((current) => ({ ...current, colorId: item.colorId }))} />)}</div></div>
          <div className="build-option"><span>尺寸</span><div className="size-presets">{[[1, 1, 1], [1, 2, 1], [1, 3, 1]].map((size) => <button key={size[1]} className={palette.size[1] === size[1] ? "active" : ""} onClick={() => setPalette((current) => ({ ...current, size }))}>1×{size[1]}×1</button>)}</div></div>
        </div>
        <footer>
          <button className="dialog-cancel" onClick={() => setBuildPattern(null)}>取消</button>
          <button className="dialog-confirm" onClick={() => { addPattern(buildPattern); setBuildPattern(null); setToolsOpen(false); }}>生成 {pendingCount} 个</button>
        </footer>
      </section>
    </div>}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}
