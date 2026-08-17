import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Box, BoxSelect, Check, ChevronDown, Copy, Download, FileJson, FolderOpen,
  Grid3X3, Layers3, Menu, Move3D, PanelLeftClose, PanelRightClose, Pause, Play,
  Plus, Redo2, Rotate3D, RotateCcw, Save, Scaling, Search, Sparkles, Trash2,
  Undo2, Upload, X,
} from "lucide-react";
import LevelScene from "./components/LevelScene";
import CreatorPage from "./CreatorPage";
import { exportLevelExcel, exportLevelJson } from "./exportExcel";

const clone = (value) => structuredClone(value);
const dataUrl = (path) => `${import.meta.env.BASE_URL}data/${path}`;

function historyReducer(state, action) {
  if (action.type === "RESET") return { past: [], present: action.value, future: [] };
  if (action.type === "COMMIT") {
    if (!state.present) return state;
    return { past: [...state.past.slice(-79), state.present], present: action.value, future: [] };
  }
  if (action.type === "UNDO" && state.past.length) {
    return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] };
  }
  if (action.type === "REDO" && state.future.length) {
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  return state;
}

function IconButton({ title, active, className = "", children, ...props }) {
  return <button className={`icon-button ${active ? "active" : ""} ${className}`} title={title} aria-label={title} {...props}>{children}</button>;
}

function LevelSidebar({ levels, selectedKey, onChoose, onClose }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const categories = useMemo(() => [...new Set(levels.map((item) => item.category))], [levels]);
  const filtered = useMemo(() => levels.filter((level) => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || String(level.id).includes(needle) || level.category.toLowerCase().includes(needle);
    return matchesQuery && (category === "all" || level.category === category) && (difficulty === "all" || level.difficulty === difficulty);
  }), [levels, query, category, difficulty]);

  return <aside className="sidebar sidebar-left">
    <div className="sidebar-title">
      <div><span>关卡库</span><small>{levels.length} 个关卡</small></div>
      <IconButton title="关闭关卡库" className="mobile-only" onClick={onClose}><X size={17} /></IconButton>
    </div>
    <label className="search-box">
      <Search size={15} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 ID 或分类" />
      {query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={13} /></button>}
    </label>
    <div className="filter-row">
      <label className="select-wrap"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
      <label className="select-wrap"><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">全部难度</option><option value="NORMAL">普通</option><option value="HARD">困难</option><option value="SUPER_HARD">超难</option></select><ChevronDown size={13} /></label>
    </div>
    <div className="level-list">
      {filtered.map((level) => <button key={level.key} className={`level-row ${selectedKey === level.key ? "selected" : ""}`} onClick={() => onChoose(level)}>
        <span className={`difficulty-dot diff-${level.difficulty.toLowerCase().replace("_", "-")}`} />
        <span className="level-main"><strong>关卡 {level.id}</strong><small>{level.category}</small></span>
        <span className="level-counts"><b>{level.counts.blocks}</b><small>方块</small></span>
        {selectedKey === level.key && <Check size={15} />}
      </button>)}
      {!filtered.length && <div className="empty-state"><Search size={24} /><span>没有匹配的关卡</span></div>}
    </div>
  </aside>;
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

function VectorEditor({ title, labels = ["X", "Y", "Z"], value, onCommit, step = 0.1, min }) {
  return <div className="property-section vector-section"><div className="section-label">{title}</div><div className="vector-grid">{value.map((item, index) => <NumberField key={labels[index]} label={labels[index]} value={item} step={step} min={min} onCommit={(next) => { const vector = [...value]; vector[index] = next; onCommit(vector); }} />)}</div></div>;
}

function Toggle({ checked, onChange, label }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function Inspector({ level, selected, catalog, onUpdate, onDelete, onDuplicate, onLevelUpdate, onClose }) {
  const materialOptions = useMemo(() => {
    const map = new Map();
    for (const profile of catalog?.profiles || []) map.set(profile.materialId, profile.material);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [catalog]);
  const shapeOptions = useMemo(() => {
    const map = new Map();
    for (const profile of catalog?.profiles || []) map.set(profile.shapeId, profile.shape);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [catalog]);
  const colorOptions = useMemo(() => {
    const map = new Map();
    for (const color of catalog?.colors || []) if (!map.has(color.colorId)) map.set(color.colorId, color);
    return [...map.values()].sort((a, b) => a.colorId - b.colorId);
  }, [catalog]);
  const profile = selected?.type === "block" ? catalog?.profiles?.find((item) => item.materialId === selected.materialId && item.shapeId === selected.shapeId && item.size.every((value, index) => Math.abs(value - selected.size[index]) < 0.01)) : null;

  return <aside className="sidebar sidebar-right">
    <div className="sidebar-title">
      <div><span>{selected ? "对象属性" : "关卡属性"}</span><small>{selected ? selected.name : `${level?.category || "-"} / ${level?.id || "-"}`}</small></div>
      <IconButton title="关闭属性面板" className="mobile-only" onClick={onClose}><X size={17} /></IconButton>
    </div>
    {!level ? <div className="empty-state"><Box size={28} /><span>正在载入关卡</span></div> : selected ? <div className="inspector-scroll">
      <div className="object-heading">
        <span className={`object-icon ${selected.type}`}><Box size={17} /></span>
        <div><strong>{selected.name}</strong><small>{selected.type === "block" ? "方块" : "平台"} · {selected.area || "根关卡"}</small></div>
        <IconButton title="复制对象" onClick={onDuplicate}><Copy size={15} /></IconButton>
        <IconButton title="删除对象" className="danger" onClick={onDelete}><Trash2 size={15} /></IconButton>
      </div>
      {selected.type === "block" && <>
        <div className="property-section"><div className="section-label">外观</div>
          <label className="field-row"><span>材质</span><select value={selected.materialId} onChange={(event) => { const materialId = Number(event.target.value); const item = materialOptions.find((option) => option.id === materialId); onUpdate({ materialId, materialName: item?.name || `材质 ${materialId}` }); }}>{materialOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field-row"><span>形状</span><select value={selected.shapeId} onChange={(event) => { const shapeId = Number(event.target.value); const item = shapeOptions.find((option) => option.id === shapeId); onUpdate({ shapeId, shapeName: item?.name || `形状 ${shapeId}` }); }}>{shapeOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <div className="field-row color-row"><span>颜色</span><div className="swatches">{colorOptions.map((item) => <button key={item.colorId} className={selected.colorId === item.colorId ? "selected" : ""} title={item.name} style={{ "--swatch": item.hex }} onClick={() => onUpdate({ colorId: item.colorId, colorName: item.name })} />)}</div></div>
        </div>
      </>}
      <VectorEditor title="位置" value={selected.position} onCommit={(position) => onUpdate({ position })} />
      <VectorEditor title="旋转（度）" value={selected.rotation} step={1} onCommit={(rotation) => onUpdate({ rotation })} />
      <VectorEditor title="尺寸" value={selected.size} min={0.05} onCommit={(size) => onUpdate({ size })} />
      {selected.type === "platform" && <div className="property-section"><div className="section-label">平台运动</div>
        <Toggle label="持续旋转" checked={Boolean(selected.motion?.rotating)} onChange={(rotating) => onUpdate({ motion: { ...selected.motion, rotating } })} />
        {selected.motion?.rotating && <NumberField label="旋转速度" value={selected.motion.rotationSpeed} step={1} onCommit={(rotationSpeed) => onUpdate({ motion: { ...selected.motion, rotationSpeed } })} />}
        <Toggle label="水平移动" checked={Boolean(selected.motion?.horizontal)} onChange={(horizontal) => onUpdate({ motion: { ...selected.motion, horizontal } })} />
        <Toggle label="垂直移动" checked={Boolean(selected.motion?.vertical)} onChange={(vertical) => onUpdate({ motion: { ...selected.motion, vertical } })} />
      </div>}
      {profile && <div className="profile-note"><span>物理档案匹配</span><dl><div><dt>质量</dt><dd>{profile.mass}</dd></div><div><dt>静摩擦</dt><dd>{profile.staticFriction}</dd></div><div><dt>动摩擦</dt><dd>{profile.dynamicFriction}</dd></div></dl></div>}
    </div> : <div className="inspector-scroll">
      <div className="property-section"><div className="section-label">基础设置</div>
        <NumberField label="移动次数" value={level.moveCount} step={1} min={1} onCommit={(moveCount) => onLevelUpdate({ moveCount })} />
        <NumberField label="球数" value={level.ballCount} step={1} min={1} onCommit={(ballCount) => onLevelUpdate({ ballCount })} />
        <label className="field-row"><span>难度</span><select value={level.difficulty} onChange={(event) => { const map = { NORMAL: 0, HARD: 1, SUPER_HARD: 2 }; onLevelUpdate({ difficulty: event.target.value, difficultyValue: map[event.target.value] }); }}><option value="NORMAL">普通</option><option value="HARD">困难</option><option value="SUPER_HARD">超难</option></select></label>
      </div>
      <div className="stats-grid">
        <div><Box size={16} /><b>{level.objects.filter((item) => item.type === "block").length}</b><span>方块</span></div>
        <div><Layers3 size={16} /><b>{level.objects.filter((item) => item.type === "platform").length}</b><span>平台</span></div>
        <div><Move3D size={16} /><b>{level.moveCount}</b><span>移动</span></div>
        <div><BoxSelect size={16} /><b>{level.ballCount}</b><span>球数</span></div>
      </div>
      <div className="selection-hint"><BoxSelect size={22} /><span>在画布中选择对象以编辑详细属性</span></div>
    </div>}
  </aside>;
}

function LibraryApp() {
  const [index, setIndex] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: null, future: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("translate");
  const [showGrid, setShowGrid] = useState(false);
  const [cameraCommand, setCameraCommand] = useState({ preset: "front", token: 0 });
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [physics, setPhysics] = useState({ enabled: false, paused: false, resetToken: 0 });
  const [physicsStatus, setPhysicsStatus] = useState("idle");
  const physicsTransformsRef = useRef([]);
  const importRef = useRef(null);
  const level = history.present;
  const selected = level?.objects.find((item) => item.uid === selectedId) || null;
  const dirty = Boolean(level && JSON.stringify(level) !== savedSnapshot);

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    Promise.all([fetch(dataUrl("index.json")).then((response) => response.json()), fetch(dataUrl("catalog.json")).then((response) => response.json())])
      .then(([levelIndex, gameCatalog]) => {
        setIndex(levelIndex.levels);
        setCatalog(gameCatalog);
        setChosen(levelIndex.levels.find((item) => item.category === "prod" && item.id === 1) || levelIndex.levels[0]);
      })
      .catch(() => notify("配置数据载入失败"));
  }, [notify]);

  useEffect(() => {
    if (!chosen) return;
    const controller = new AbortController();
    setPhysics((current) => ({ ...current, enabled: false, paused: false }));
    setPhysicsStatus("idle");
    physicsTransformsRef.current = [];
    setLoading(true);
    setSelectedId(null);
    fetch(dataUrl(`levels/${chosen.slug}.json`), { signal: controller.signal }).then((response) => response.json()).then((data) => {
      const stored = localStorage.getItem(`knockout:level:${data.key}`);
      let next = data;
      if (stored) {
        try { next = JSON.parse(stored); } catch { localStorage.removeItem(`knockout:level:${data.key}`); }
      }
      dispatch({ type: "RESET", value: next });
      setSavedSnapshot(stored || JSON.stringify(data));
      setCameraCommand((current) => ({ preset: "front", token: current.token + 1 }));
      setLoading(false);
    }).catch((error) => { if (error.name !== "AbortError") notify("关卡载入失败"); });
    return () => controller.abort();
  }, [chosen, notify]);

  const commit = useCallback((next) => dispatch({ type: "COMMIT", value: next }), []);
  const startPhysics = useCallback(() => {
    if (!level?.objects.some((item) => item.type === "block")) {
      notify("当前关卡没有可模拟的方块");
      return;
    }
    physicsTransformsRef.current = [];
    setSelectedId(null);
    setLeftOpen(false);
    setRightOpen(false);
    setPhysics((current) => ({ enabled: true, paused: false, resetToken: current.resetToken + 1 }));
  }, [level, notify]);
  const exitPhysics = useCallback(() => {
    setPhysics((current) => ({ ...current, enabled: false, paused: false }));
    setPhysicsStatus("idle");
    physicsTransformsRef.current = [];
  }, []);
  const resetPhysics = useCallback(() => {
    physicsTransformsRef.current = [];
    setPhysicsStatus("loading");
    setPhysics((current) => ({ enabled: true, paused: false, resetToken: current.resetToken + 1 }));
  }, []);
  const applyPhysics = useCallback(() => {
    setPhysics((current) => ({ ...current, paused: true }));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (!level || !physicsTransformsRef.current.length) return;
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
    if (!history.present || !selectedId) return;
    const next = clone(history.present);
    const item = next.objects.find((object) => object.uid === selectedId);
    if (item) Object.assign(item, changes);
    commit(next);
  }, [history.present, selectedId, commit]);
  const updateTransform = useCallback((uid, changes) => {
    if (!history.present) return;
    const next = clone(history.present);
    const item = next.objects.find((object) => object.uid === uid);
    if (item) Object.assign(item, changes);
    commit(next);
  }, [history.present, commit]);
  const updateLevel = useCallback((changes) => {
    if (!history.present) return;
    commit({ ...history.present, ...changes });
  }, [history.present, commit]);

  const addObject = useCallback((type) => {
    if (!level) return;
    const next = clone(level);
    const uid = `${type}-custom-${crypto.randomUUID()}`;
    const count = next.objects.filter((item) => item.type === type).length + 1;
    const item = type === "block" ? {
      uid, type, name: `方块 ${count}`, area: "根关卡", stageIndex: null, platformIndex: null,
      waveIndex: null, shutterIndex: null, blockIndex: count, materialId: 0, materialName: "木头",
      shapeId: 0, shapeName: "方块", colorId: 0, colorName: "无", position: [0, 1, 0], rotation: [0, 0, 0], size: [1, 1, 1],
    } : {
      uid, type, name: `平台 ${count}`, area: "根关卡", path: `platforms/${count}`, stageIndex: null,
      platformIndex: count, position: [0, 0, 0], rotation: [0, 0, 0], size: [4, 1, 3],
      motion: { rotating: false, rotationSpeed: 0, horizontal: false, horizontalMin: 0, horizontalMax: 0, horizontalDirection: "Positive", horizontalSpeed: 0, vertical: false, verticalMin: 0, verticalMax: 0, verticalDirection: "Positive", verticalSpeed: 0 },
    };
    next.objects.push(item);
    commit(next);
    setSelectedId(uid);
    setRightOpen(true);
  }, [level, commit]);

  const deleteSelected = useCallback(() => {
    if (!level || !selectedId) return;
    const next = clone(level);
    next.objects = next.objects.filter((item) => item.uid !== selectedId);
    commit(next);
    setSelectedId(null);
  }, [level, selectedId, commit]);
  const duplicateSelected = useCallback(() => {
    if (!level || !selected) return;
    const next = clone(level);
    const copy = clone(selected);
    copy.uid = `${copy.type}-custom-${crypto.randomUUID()}`;
    copy.name = `${copy.name} 副本`;
    copy.position = [copy.position[0] + 0.5, copy.position[1] + 0.5, copy.position[2] + 0.5];
    next.objects.push(copy);
    commit(next);
    setSelectedId(copy.uid);
  }, [level, selected, commit]);
  const save = useCallback(() => {
    if (!level) return;
    const snapshot = JSON.stringify(level);
    localStorage.setItem(`knockout:level:${level.key}`, snapshot);
    setSavedSnapshot(snapshot);
    notify("已保存到本地");
  }, [level, notify]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && physics.enabled) { exitPhysics(); return; }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
      if (physics.enabled) return;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "REDO" : "UNDO" }); }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "REDO" }); }
      if ((event.key === "Delete" || event.key === "Backspace") && document.activeElement?.tagName !== "INPUT") deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, deleteSelected, physics.enabled, exitPhysics]);

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.objects) || !data.key) throw new Error("invalid");
      dispatch({ type: "RESET", value: data });
      setSelectedId(null);
      notify("JSON 已导入");
    } catch { notify("不是有效的关卡 JSON"); }
  };

  return <div className={`app-shell ${physics.enabled ? "library-physics-active" : ""}`}>
    <header className="topbar">
      <div className="brand-mark"><span><Box size={18} /></span><div><strong>KnockOut</strong><small>LEVEL STUDIO</small></div></div>
      <div className="topbar-divider" />
      <IconButton title="打开关卡库" className="sidebar-toggle" onClick={() => setLeftOpen(true)}><Menu size={18} /></IconButton>
      <div className="current-level"><span>{level ? `关卡 ${level.id}` : "载入中"}</span><small>{level?.category || "配置数据"}</small>{dirty && <i title="有未保存修改" />}</div>
      <div className="topbar-spacer" />
      <a className="command-button creator-link" href={`${import.meta.env.BASE_URL}?view=creator`}><Sparkles size={16} /><span>新建关卡</span></a>
      <div className="history-tools">
        <IconButton title="撤销" disabled={physics.enabled || !history.past.length} onClick={() => dispatch({ type: "UNDO" })}><Undo2 size={17} /></IconButton>
        <IconButton title="重做" disabled={physics.enabled || !history.future.length} onClick={() => dispatch({ type: "REDO" })}><Redo2 size={17} /></IconButton>
      </div>
      <div className="topbar-divider" />
      <button className="command-button secondary" disabled={physics.enabled} onClick={() => importRef.current?.click()}><Upload size={16} /><span>导入 JSON</span></button>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
      <div className="export-menu">
        <button className="command-button secondary" onClick={() => level && exportLevelExcel(level)}><Download size={16} /><span>导出 Excel</span></button>
        <IconButton title="导出 JSON" onClick={() => level && exportLevelJson(level)}><FileJson size={16} /></IconButton>
      </div>
      <button className={`command-button save-button ${dirty ? "dirty" : ""}`} disabled={!level} onClick={save}><Save size={16} /><span>{dirty ? "保存修改" : "已保存"}</span></button>
      <IconButton title="打开属性面板" className="sidebar-toggle" onClick={() => setRightOpen(true)}><PanelRightClose size={18} /></IconButton>
    </header>

    <main className="workspace">
      <div className={`panel-wrap left-wrap ${leftOpen ? "open" : ""}`}><LevelSidebar levels={index} selectedKey={chosen?.key} onChoose={(item) => { setChosen(item); setLeftOpen(false); }} onClose={() => setLeftOpen(false)} /></div>
      <section className="viewport">
        {loading && <div className="loading-overlay"><span /><p>正在构建关卡 {chosen?.id}</p></div>}
        <LevelScene level={level} catalog={catalog} selectedId={selectedId} onSelect={(uid) => { setSelectedId(uid); if (uid) setRightOpen(true); }} onTransform={updateTransform} mode={mode} showGrid={showGrid} cameraCommand={cameraCommand} physics={physics} onPhysicsUpdate={(transforms) => { physicsTransformsRef.current = transforms; }} onPhysicsStatus={setPhysicsStatus} />
        <div className="scene-toolbar" aria-label="场景工具">
          <IconButton title="移动" disabled={physics.enabled} active={mode === "translate"} onClick={() => setMode("translate")}><Move3D size={18} /></IconButton>
          <IconButton title="旋转" disabled={physics.enabled} active={mode === "rotate"} onClick={() => setMode("rotate")}><Rotate3D size={18} /></IconButton>
          <IconButton title="缩放" disabled={physics.enabled} active={mode === "scale"} onClick={() => setMode("scale")}><Scaling size={18} /></IconButton>
          <span />
          <IconButton title="显示网格" active={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={18} /></IconButton>
          <span />
          <button className={`physics-launch ${physics.enabled ? "active" : ""}`} disabled={physics.enabled || loading || !level} title="让当前关卡方块按重力和碰撞运行" onClick={startPhysics}><Play size={14} />物理</button>
        </div>
        <div className="camera-toolbar">
          {[ ["iso", "透视"], ["front", "正视"], ["back", "背视图"], ["side", "侧视"], ["top", "顶视"] ].map(([preset, label]) => <button key={preset} onClick={() => setCameraCommand((current) => ({ preset, token: current.token + 1 }))}>{label}</button>)}
        </div>
        <div className="add-toolbar">
          <button disabled={physics.enabled} onClick={() => addObject("block")}><Plus size={15} /><Box size={16} /><span>方块</span></button>
          <button disabled={physics.enabled} onClick={() => addObject("platform")}><Plus size={15} /><Layers3 size={16} /><span>平台</span></button>
        </div>
        {physics.enabled && <div className="physics-toolbar" aria-label="物理预演工具">
          <strong><i className={physicsStatus} />{{ loading: "载入物理", running: "物理运行中", paused: "物理已暂停", error: "物理启动失败" }[physicsStatus] || "物理预演"}</strong>
          <button disabled={physicsStatus === "loading" || physicsStatus === "error"} onClick={() => setPhysics((current) => ({ ...current, paused: !current.paused }))}>{physics.paused ? <Play size={14} /> : <Pause size={14} />}{physics.paused ? "继续" : "暂停"}</button>
          <button disabled={physicsStatus === "loading"} onClick={resetPhysics}><RotateCcw size={14} />重置</button>
          <button className="apply" disabled={physicsStatus === "loading" || physicsStatus === "error"} onClick={applyPhysics}><Check size={14} />应用结果</button>
          <button onClick={exitPhysics}><X size={14} />退出</button>
        </div>}
        <div className="viewport-status">
          <span className={`status-dot ${dirty ? "dirty" : ""}`} />
          <span>{physics.enabled ? ({ loading: "正在初始化物理", running: "重力与碰撞预演", paused: "物理预演已暂停", error: "物理引擎不可用" }[physicsStatus] || "物理预演") : selected ? `${selected.name} · ${selected.type === "block" ? selected.materialName : "平台"}` : "未选择对象"}</span>
          <b>{level?.objects.length || 0} 对象</b>
        </div>
      </section>
      <div className={`panel-wrap right-wrap ${rightOpen ? "open" : ""}`}><Inspector level={level} selected={selected} catalog={catalog} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected} onLevelUpdate={updateLevel} onClose={() => setRightOpen(false)} /></div>
      {(leftOpen || rightOpen) && <button className="mobile-scrim" aria-label="关闭面板" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />}
    </main>
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

export default function App() {
  return new URLSearchParams(window.location.search).get("view") === "creator" ? <CreatorPage /> : <LibraryApp />;
}
