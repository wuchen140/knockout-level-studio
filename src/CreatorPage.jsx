import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft, Box, Check, Copy, Download, FileJson, Grid3X3, Layers3,
  Move3D, Plus, Redo2, Rotate3D, Save, Scaling, Sparkles, Trash2,
  Undo2, Upload,
} from "lucide-react";
import LevelScene from "./components/LevelScene";
import { exportLevelExcel, exportLevelJson } from "./exportExcel";

const clone = (value) => structuredClone(value);
const dataUrl = (path) => `${import.meta.env.BASE_URL}data/${path}`;

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

function makePlatform(stageIndex, index = 1) {
  return {
    uid: `platform-custom-${crypto.randomUUID()}`,
    type: "platform",
    name: `平台 ${index}`,
    ...stageMeta(stageIndex),
    path: `platforms/${index}`,
    platformIndex: index,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    size: [10, 0.5, 4],
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
  if (level?.stages?.length) return level.stages;
  const indexes = [...new Set((level?.objects || []).map((item) => item.stageIndex).filter((value) => value != null))].sort((a, b) => a - b);
  return [{ key: "root", name: "主关卡", stageIndex: null }, ...indexes.map((stageIndex) => ({ key: `stage-${stageIndex}`, name: `子关卡 ${stageIndex}`, stageIndex }))];
}

function withCounts(level) {
  const stages = stagesFor(level);
  const objects = level.objects || [];
  return {
    ...level,
    key: `${level.category || "custom"}:${level.id}`,
    slug: `${level.category || "custom"}-${level.id}`,
    firstProgressionLevel: level.firstProgressionLevel || level.id,
    stages,
    counts: {
      ...(level.counts || {}),
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

function CreatorInspector({ level, selected, catalog, activeStage, onUpdate, onDelete, onDuplicate, onLevelUpdate, open }) {
  const materials = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.materialId, item.material])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const shapes = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.shapeId, item.shape])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const colors = useMemo(() => [...new Map((catalog?.colors || []).map((item) => [item.colorId, item])).values()].sort((a, b) => a.colorId - b.colorId), [catalog]);

  return <aside className={`creator-properties ${open ? "open" : ""}`}>
    <div className="creator-panel-title"><div><strong>{selected ? "对象属性" : "关卡设置"}</strong><small>{selected ? selected.name : activeStage.name}</small></div></div>
    {selected ? <div className="inspector-scroll">
      <div className="object-heading">
        <span className={`object-icon ${selected.type}`}><Box size={17} /></span>
        <div><strong>{selected.name}</strong><small>{selected.type === "block" ? "方块" : "平台"} · {activeStage.name}</small></div>
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
  const [history, dispatch] = useReducer(historyReducer, null, () => {
    const stored = localStorage.getItem("knockout:creator:draft");
    if (stored) {
      try { return { past: [], present: withCounts(JSON.parse(stored)), future: [] }; } catch { localStorage.removeItem("knockout:creator:draft"); }
    }
    return { past: [], present: blankLevel(), future: [] };
  });
  const [activeStageKey, setActiveStageKey] = useState("root");
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("translate");
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapSize, setSnapSize] = useState(0.5);
  const [cameraCommand, setCameraCommand] = useState({ preset: "front", token: 0 });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [palette, setPalette] = useState({ materialId: 0, shapeId: 0, colorId: 1, size: [1, 1, 1] });
  const [savedSnapshot, setSavedSnapshot] = useState(() => localStorage.getItem("knockout:creator:draft") || "");
  const [toast, setToast] = useState("");
  const importRef = useRef(null);
  const level = withCounts(history.present);
  const stages = level.stages;
  const activeStage = stages.find((stage) => stage.key === activeStageKey) || stages[0];
  const stageObjects = level.objects.filter((item) => (item.stageIndex ?? null) === (activeStage.stageIndex ?? null));
  const visibleLevel = { ...level, key: `${level.key}:${activeStage.key}`, objects: stageObjects };
  const selected = level.objects.find((item) => item.uid === selectedId) || null;
  const dirty = JSON.stringify(level) !== savedSnapshot;

  const materials = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.materialId, item.material])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const shapes = useMemo(() => [...new Map((catalog?.profiles || []).map((item) => [item.shapeId, item.shape])).entries()].map(([id, name]) => ({ id, name })), [catalog]);
  const colors = useMemo(() => [...new Map((catalog?.colors || []).map((item) => [item.colorId, item])).values()].sort((a, b) => a.colorId - b.colorId), [catalog]);

  useEffect(() => { fetch(dataUrl("catalog.json")).then((response) => response.json()).then(setCatalog).catch(() => setToast("模型目录载入失败")); }, []);
  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2200);
  }, []);
  const commit = useCallback((next) => dispatch({ type: "COMMIT", value: withCounts(next) }), []);

  const updateSelected = useCallback((changes) => {
    if (!selectedId) return;
    const next = clone(level);
    const item = next.objects.find((object) => object.uid === selectedId);
    if (item) Object.assign(item, changes);
    commit(next);
  }, [level, selectedId, commit]);
  const updateLevel = useCallback((changes) => commit({ ...level, ...changes }), [level, commit]);
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit({ ...level, objects: level.objects.filter((item) => item.uid !== selectedId) });
    setSelectedId(null);
  }, [level, selectedId, commit]);
  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = clone(selected);
    copy.uid = `${copy.type}-custom-${crypto.randomUUID()}`;
    copy.name = `${copy.name} 副本`;
    copy.position = [copy.position[0] + snapSize, copy.position[1] + snapSize, copy.position[2]];
    commit({ ...level, objects: [...level.objects, copy] });
    setSelectedId(copy.uid);
  }, [level, selected, snapSize, commit]);

  const addPattern = useCallback((pattern) => {
    const points = patternPoints(pattern, palette.size);
    const start = level.objects.filter((item) => item.type === "block").length;
    const materialName = materials.find((item) => item.id === palette.materialId)?.name || "材质";
    const shapeName = shapes.find((item) => item.id === palette.shapeId)?.name || "形状";
    const color = colors.find((item) => item.colorId === palette.colorId);
    const blocks = points.map((position, index) => ({
      uid: `block-custom-${crypto.randomUUID()}`,
      type: "block",
      name: `方块 ${start + index + 1}`,
      ...stageMeta(activeStage.stageIndex),
      platformIndex: null, waveIndex: null, shutterIndex: null, blockIndex: start + index + 1,
      materialId: palette.materialId, materialName,
      shapeId: palette.shapeId, shapeName,
      colorId: palette.colorId, colorName: color?.name || "颜色",
      position, rotation: [0, 0, 0], size: [...palette.size],
    }));
    commit({ ...level, objects: [...level.objects, ...blocks] });
    setSelectedId(blocks.at(-1)?.uid || null);
    setCameraCommand((current) => ({ ...current, token: current.token + 1 }));
    notify(`已生成 ${blocks.length} 个方块`);
  }, [level, palette, materials, shapes, colors, activeStage, commit, notify]);

  const addPlatform = useCallback(() => {
    const index = level.objects.filter((item) => item.type === "platform").length + 1;
    const item = makePlatform(activeStage.stageIndex, index);
    commit({ ...level, objects: [...level.objects, item] });
    setSelectedId(item.uid);
    setCameraCommand((current) => ({ ...current, token: current.token + 1 }));
  }, [level, activeStage, commit]);

  const addStage = useCallback(() => {
    const indexes = stages.map((stage) => stage.stageIndex).filter((value) => value != null);
    const stageIndex = Math.max(0, ...indexes) + 1;
    const stage = { key: `stage-${stageIndex}`, name: `子关卡 ${stageIndex}`, stageIndex };
    commit({ ...level, stages: [...stages, stage], objects: [...level.objects, makePlatform(stageIndex, level.counts.platforms + 1)] });
    setActiveStageKey(stage.key);
    setSelectedId(null);
    setCameraCommand((current) => ({ preset: "front", token: current.token + 1 }));
  }, [level, stages, commit]);

  const removeStage = useCallback(() => {
    if (activeStage.stageIndex == null || !window.confirm(`删除${activeStage.name}及其中全部对象？`)) return;
    const nextStages = stages.filter((stage) => stage.key !== activeStage.key);
    commit({ ...level, stages: nextStages, objects: level.objects.filter((item) => item.stageIndex !== activeStage.stageIndex) });
    setActiveStageKey("root");
    setSelectedId(null);
  }, [level, stages, activeStage, commit]);

  const clearStage = useCallback(() => {
    if (!window.confirm(`清空${activeStage.name}中的全部方块？平台会保留。`)) return;
    commit({ ...level, objects: level.objects.filter((item) => (item.stageIndex ?? null) !== (activeStage.stageIndex ?? null) || item.type === "platform") });
    setSelectedId(null);
  }, [level, activeStage, commit]);

  const save = useCallback(() => {
    const next = withCounts(level);
    const snapshot = JSON.stringify(next);
    localStorage.setItem("knockout:creator:draft", snapshot);
    setSavedSnapshot(snapshot);
    notify("草稿已保存到本地");
  }, [level, notify]);

  const resetLevel = useCallback(() => {
    if (dirty && !window.confirm("新建关卡会替换当前未保存内容，继续吗？")) return;
    const next = blankLevel(Number(level.id) + 1);
    dispatch({ type: "RESET", value: next });
    setActiveStageKey("root");
    setSelectedId(null);
    setSavedSnapshot("");
    setCameraCommand((current) => ({ preset: "front", token: current.token + 1 }));
  }, [dirty, level.id]);

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = withCounts(JSON.parse(await file.text()));
      if (!Array.isArray(data.objects)) throw new Error("invalid");
      dispatch({ type: "RESET", value: data });
      setActiveStageKey(data.stages[0].key);
      setSelectedId(null);
      setSavedSnapshot("");
      notify("关卡 JSON 已载入");
    } catch { notify("不是有效的关卡 JSON"); }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "REDO" : "UNDO" }); }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "REDO" }); }
      if ((event.key === "Delete" || event.key === "Backspace") && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) deleteSelected();
      if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, deleteSelected, duplicateSelected]);

  return <div className="app-shell creator-shell">
    <header className="topbar creator-topbar">
      <a className="icon-button" title="返回关卡浏览" aria-label="返回关卡浏览" href={import.meta.env.BASE_URL}><ArrowLeft size={18} /></a>
      <div className="brand-mark creator-brand"><span><Sparkles size={18} /></span><div><strong>新关卡编辑器</strong><small>LEVEL CREATOR</small></div></div>
      <div className="current-level"><span>关卡 {level.id}</span><small>{activeStage.name}</small>{dirty && <i title="有未保存修改" />}</div>
      <div className="topbar-spacer" />
      <div className="history-tools">
        <IconButton title="撤销" disabled={!history.past.length} onClick={() => dispatch({ type: "UNDO" })}><Undo2 size={17} /></IconButton>
        <IconButton title="重做" disabled={!history.future.length} onClick={() => dispatch({ type: "REDO" })}><Redo2 size={17} /></IconButton>
      </div>
      <button className="command-button secondary" onClick={resetLevel}><Plus size={16} /><span>新建</span></button>
      <button className="command-button secondary" onClick={() => importRef.current?.click()}><Upload size={16} /><span>导入</span></button>
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
            return <button key={stage.key} className={stage.key === activeStage.key ? "active" : ""} onClick={() => { setActiveStageKey(stage.key); setSelectedId(null); setCameraCommand((current) => ({ preset: "front", token: current.token + 1 })); }}><span><Layers3 size={15} />{stage.name}</span><b>{count}</b></button>;
          })}
        </div>
        <div className="stage-actions">
          <button onClick={addStage}><Plus size={14} />子关卡</button>
          <button onClick={clearStage}>清空方块</button>
          {activeStage.stageIndex != null && <IconButton title="删除当前子关卡" className="danger" onClick={removeStage}><Trash2 size={15} /></IconButton>}
        </div>

        <div className="tool-section">
          <div className="section-label">方块预设</div>
          <label className="creator-select"><span>材质</span><select value={palette.materialId} onChange={(event) => setPalette((current) => ({ ...current, materialId: Number(event.target.value) }))}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="creator-select"><span>形状</span><select value={palette.shapeId} onChange={(event) => setPalette((current) => ({ ...current, shapeId: Number(event.target.value) }))}>{shapes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="creator-swatches">{colors.map((item) => <button key={item.colorId} className={palette.colorId === item.colorId ? "active" : ""} title={item.name} style={{ "--swatch": item.hex }} onClick={() => setPalette((current) => ({ ...current, colorId: item.colorId }))} />)}</div>
          <div className="size-presets">{[[1, 1, 1], [1, 2, 1], [1, 3, 1]].map((size) => <button key={size[1]} className={palette.size[1] === size[1] ? "active" : ""} onClick={() => setPalette((current) => ({ ...current, size }))}>1×{size[1]}</button>)}</div>
        </div>

        <div className="tool-section pattern-section">
          <div className="section-label">快速搭建</div>
          <div className="pattern-grid">{PATTERNS.map((pattern) => <button key={pattern.key} onClick={() => addPattern(pattern.key)}><Box size={16} /><span>{pattern.label}</span><small>{pattern.description}</small></button>)}</div>
          <button className="wide-tool-button" onClick={addPlatform}><Plus size={15} /><Layers3 size={16} />添加平台</button>
        </div>
      </aside>

      <section className="viewport creator-viewport">
        <LevelScene level={visibleLevel} catalog={catalog} selectedId={selectedId} onSelect={(uid) => { setSelectedId(uid); if (uid) { setPropertiesOpen(true); setToolsOpen(false); } }} onTransform={(uid, changes) => { const next = clone(level); const item = next.objects.find((object) => object.uid === uid); if (item) Object.assign(item, changes); commit(next); }} mode={mode} showGrid={showGrid} cameraCommand={cameraCommand} snap={{ enabled: snapEnabled, translation: snapSize, rotation: 15, scale: snapSize }} />
        <div className="scene-toolbar" aria-label="场景工具">
          <IconButton title="移动" active={mode === "translate"} onClick={() => setMode("translate")}><Move3D size={18} /></IconButton>
          <IconButton title="旋转" active={mode === "rotate"} onClick={() => setMode("rotate")}><Rotate3D size={18} /></IconButton>
          <IconButton title="缩放" active={mode === "scale"} onClick={() => setMode("scale")}><Scaling size={18} /></IconButton>
          <span />
          <IconButton title="显示网格" active={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={18} /></IconButton>
          <button className={`snap-toggle ${snapEnabled ? "active" : ""}`} onClick={() => setSnapEnabled((value) => !value)}>吸附</button>
          <select className="snap-select" value={snapSize} disabled={!snapEnabled} onChange={(event) => setSnapSize(Number(event.target.value))}><option value="0.25">0.25</option><option value="0.5">0.5</option><option value="1">1</option></select>
        </div>
        <div className="camera-toolbar">
          {[["iso", "透视"], ["front", "正视"], ["back", "背视图"], ["side", "侧视"], ["top", "顶视"]].map(([preset, label]) => <button key={preset} onClick={() => setCameraCommand((current) => ({ preset, token: current.token + 1 }))}>{label}</button>)}
        </div>
        <div className="viewport-status">
          <span className={`status-dot ${dirty ? "dirty" : ""}`} />
          <span>{activeStage.name} · {selected ? selected.name : "点击对象进行编辑"}</span>
          <b>{stageObjects.length} 对象 · 网格 {snapEnabled ? snapSize : "关闭"}</b>
        </div>
      </section>

      <CreatorInspector level={level} selected={selected} catalog={catalog} activeStage={activeStage} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected} onLevelUpdate={updateLevel} open={propertiesOpen} />
      {(toolsOpen || propertiesOpen) && <button className="creator-mobile-scrim" aria-label="关闭面板" onClick={() => { setToolsOpen(false); setPropertiesOpen(false); }} />}
    </main>
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}
