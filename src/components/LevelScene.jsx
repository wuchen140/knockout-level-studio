import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { assetSpecFor, loadGameModel, materialFor } from "../gameAssets.js";

const PLATFORM_COLOR = 0x59656a;
const DEFAULT_COLORS = {
  0: "#d8d2c6", 1: "#e57373", 2: "#fae58c", 3: "#64b5f6",
  4: "#81c784", 5: "#ffad66", 6: "#f48fb1", 7: "#b39ddb",
};

function geometryFor(item) {
  if (item.type === "platform") {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    // Platform coordinates describe the top surface in the source level data.
    // Keep the mesh origin at that coordinate so blocks sit on, rather than in, it.
    geometry.translate(0, -0.5, 0);
    return geometry;
  }
  if (item.shapeId === 1) return new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
  if (item.shapeId === 2) return new THREE.ConeGeometry(0.58, 1, 28);
  return new THREE.BoxGeometry(1, 1, 1);
}

function colorFor(item, catalog) {
  if (item.type === "platform") return PLATFORM_COLOR;
  const match = catalog?.colors?.find((color) => color.materialId === item.materialId && color.colorId === item.colorId)
    || catalog?.colors?.find((color) => color.colorId === item.colorId);
  return match?.hex || DEFAULT_COLORS[item.colorId] || "#d8d2c6";
}

function disposeGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((node) => {
      if (node.geometry && node.userData.ownsGeometry !== false) node.geometry.dispose();
      if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
      else node.material?.dispose();
    });
  }
}

function applyConfiguredSize(object, size) {
  const nominal = object.userData.nominalSize || [1, 1, 1];
  object.scale.set(...size.map((value, index) => Math.max(0.05, value) / Math.max(nominal[index], 0.0001)));
}

function setSelected(object, selected) {
  object.traverse((node) => {
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of materials) {
      const base = material.userData.baseEmissive ?? 0x000000;
      material.emissive?.setHex(base);
      if (selected) material.emissive?.lerp(new THREE.Color(0x2d7771), 0.72);
      material.emissiveIntensity = selected ? 1.05 : (material.userData.baseEmissiveIntensity ?? 0);
    }
  });
}

function makeEditableObject(item, catalog) {
  const root = new THREE.Group();
  root.name = item.name;
  root.userData.objectId = item.uid;
  root.userData.nominalSize = [1, 1, 1];
  root.position.fromArray(item.position);
  root.rotation.set(...item.rotation.map(THREE.MathUtils.degToRad));
  applyConfiguredSize(root, item.size);

  const spec = assetSpecFor(item);
  const fallbackMaterial = item.type === "platform"
    ? new THREE.MeshStandardMaterial({ color: PLATFORM_COLOR, roughness: 0.72, metalness: 0.05 })
    : materialFor(spec, colorFor(item, catalog));
  fallbackMaterial.userData.baseEmissive ??= 0x000000;
  const fallback = new THREE.Mesh(geometryFor(item), fallbackMaterial);
  fallback.userData.fallback = true;
  fallback.castShadow = true;
  fallback.receiveShadow = true;
  root.add(fallback);
  return { root, spec };
}

function modelVisual(model, spec, item, catalog) {
  const visual = model.scene.clone(true);
  visual.name = `${item.name} 游戏模型`;
  let meshIndex = 0;
  visual.traverse((node) => {
    if (!node.isMesh) return;
    node.userData.ownsGeometry = false;
    node.material = materialFor(spec, colorFor(item, catalog));
    if (spec.material === "glass" && meshIndex > 0) {
      node.material.opacity = 1;
      node.material.transmission = 0;
      node.material.roughness = 0.32;
      node.material.depthWrite = true;
    }
    meshIndex += 1;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return visual;
}

export default function LevelScene({ level, catalog, selectedId, onSelect, onTransform, mode, showGrid, cameraCommand }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const transformSnapshot = useRef(null);
  const transformCallbackRef = useRef(onTransform);
  const selectCallbackRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  transformCallbackRef.current = onTransform;
  selectCallbackRef.current = onSelect;
  selectedRef.current = selectedId;

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x182022);
    scene.fog = new THREE.Fog(0x182022, 28, 72);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);
    camera.position.set(12, 10, 15);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x182022, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.minDistance = 2;
    orbit.maxDistance = 90;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.82);
    scene.add(transform.getHelper());
    transform.addEventListener("dragging-changed", (event) => { orbit.enabled = !event.value; });
    transform.addEventListener("mouseDown", () => {
      const object = transform.object;
      transformSnapshot.current = object ? object.userData.objectId : null;
    });
    transform.addEventListener("mouseUp", () => {
      const object = transform.object;
      if (!object || !transformSnapshot.current) return;
      const nominal = object.userData.nominalSize || [1, 1, 1];
      transformCallbackRef.current?.(object.userData.objectId, {
        position: object.position.toArray().map((value) => Number(value.toFixed(4))),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map((value) => Number(THREE.MathUtils.radToDeg(value).toFixed(3))),
        size: object.scale.toArray().map((value, index) => Number(Math.max(0.05, value * nominal[index]).toFixed(4))),
      });
      transformSnapshot.current = null;
    });

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x24302d, 2.4);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1d6, 4.2);
    key.position.set(-8, 16, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x63bfc4, 1.6);
    rim.position.set(12, 7, -10);
    scene.add(rim);

    const grid = new THREE.GridHelper(60, 60, 0x557174, 0x2b3a3c);
    grid.position.y = -0.52;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.515;
    ground.receiveShadow = true;
    scene.add(ground);

    const objectGroup = new THREE.Group();
    scene.add(objectGroup);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(objectGroup.children, true)[0];
      let selected = hit?.object || null;
      while (selected && !selected.userData.objectId) selected = selected.parent;
      selectCallbackRef.current?.(selected?.userData?.objectId || null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = Math.max(width / Math.max(height, 1), 0.1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame;
    const animate = () => {
      orbit.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    apiRef.current = { scene, camera, renderer, orbit, transform, objectGroup, grid };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      disposeGroup(objectGroup);
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !level) return;
    let cancelled = false;
    api.transform.detach();
    disposeGroup(api.objectGroup);
    for (const item of level.objects || []) {
      const { root, spec } = makeEditableObject(item, catalog);
      api.objectGroup.add(root);
      if (!spec) continue;
      loadGameModel(spec).then((model) => {
        if (cancelled || !root.parent) return;
        disposeGroup(root);
        root.userData.nominalSize = spec.nominalSize;
        applyConfiguredSize(root, item.size);
        root.add(modelVisual(model, spec, item, catalog));
        setSelected(root, root.userData.objectId === selectedRef.current);
      }).catch((error) => {
        console.warn(`游戏模型加载失败: ${spec.key}`, error);
      });
    }
    return () => { cancelled = true; };
  }, [level, catalog]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.transform.detach();
    for (const object of api.objectGroup.children) {
      const active = object.userData.objectId === selectedId;
      setSelected(object, active);
      if (active) api.transform.attach(object);
    }
  }, [selectedId, level]);

  useEffect(() => { apiRef.current?.transform.setMode(mode); }, [mode]);
  useEffect(() => { if (apiRef.current) apiRef.current.grid.visible = showGrid; }, [showGrid]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !level || !cameraCommand) return;
    const box = new THREE.Box3().setFromObject(api.objectGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.length() * 1.05, 8);
    const direction = {
      top: new THREE.Vector3(0, 1, 0.001),
      front: new THREE.Vector3(0, 0.25, 1),
      side: new THREE.Vector3(1, 0.25, 0),
      iso: new THREE.Vector3(0.8, 0.65, 1),
    }[cameraCommand.preset] || new THREE.Vector3(0.8, 0.65, 1);
    api.camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
    api.orbit.target.copy(center);
    api.orbit.update();
  }, [cameraCommand, level?.key]);

  return <div className="scene-mount" ref={mountRef} data-testid="level-canvas" />;
}
