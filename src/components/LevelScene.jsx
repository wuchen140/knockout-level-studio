import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { assetSpecFor, loadGameModel, materialFor } from "../gameAssets.js";
import { createLevelPhysics, disposeLevelPhysics, physicsTransforms, spawnAttackBall, stepLevelPhysics } from "../physics/levelPhysics.js";

const PLATFORM_COLOR = 0x59656a;
const PLATFORM_PART_TRANSFORMS = {
  "platform-pipe": { position: [0, 1.1042471, 0] },
  "platform-ball-1": { position: [0.29251763, 0.33808148, 0] },
  "platform-ball-2": { position: [0, 0.33808148, 0.2925176] },
  "platform-ball-3": { position: [-0.2925175, 0.33808148, 0] },
  "platform-ball-4": { position: [0, 0.33808148, -0.29251754] },
  "platform-mid-gold": { position: [0, 0.56626093, 0] },
  "platform-bottom-gold": { position: [0, 0.11257279, 0] },
};
const CANNON_PART_TRANSFORMS = {
  "cannon-base": { position: [0, 1.02, 0.1], quaternion: [0.25267732, 0, 0, 0.96755064] },
  "cannon-counter": { position: [0, 0.694, 0.62], quaternion: [-0.17364825, 0, 0, 0.9848078] },
  "cannon-stabilizer": { position: [0, 0.429, -1.725], quaternion: [-0.026131358, 0, 0, 0.9996585], scale: [0.95581, 0.95581, 0.95581] },
};
const DEFAULT_COLORS = {
  0: "#d8d2c6", 1: "#e57373", 2: "#fae58c", 3: "#64b5f6",
  4: "#81c784", 5: "#ffad66", 6: "#f48fb1", 7: "#b39ddb",
};
const GAME_GLASS_COLORS = {
  1: "#e5394f", 2: "#f4cf32", 3: "#2854df", 4: "#35b95c",
  5: "#f2a13e", 6: "#df3db7", 7: "#8b2bd3",
};

function geometryFor(item) {
  if (item.type === "attackBall") return new THREE.SphereGeometry(0.29, 28, 18);
  if (item.type === "cannon") {
    const geometry = new THREE.CylinderGeometry(0.55, 0.72, 2.3, 24);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 1.05, -0.35);
    return geometry;
  }
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
  if (item.type === "cannon") return 0x870001;
  if (item.type === "attackBall") return 0xffffff;
  if (item.materialId === 4 && GAME_GLASS_COLORS[item.colorId]) return GAME_GLASS_COLORS[item.colorId];
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

function releaseSelectionGroup(api) {
  if (!api?.selectionGroup?.children.length) return;
  api.transform.detach();
  api.selectionGroup.updateMatrixWorld(true);
  api.objectGroup.updateMatrixWorld(true);
  for (const object of [...api.selectionGroup.children]) api.objectGroup.attach(object);
  api.selectionGroup.position.set(0, 0, 0);
  api.selectionGroup.rotation.set(0, 0, 0);
  api.selectionGroup.scale.set(1, 1, 1);
  api.selectionGroup.updateMatrixWorld(true);
}

function restoreConfiguredTransforms(api, level) {
  const byId = new Map((level?.objects || []).map((item) => [item.uid, item]));
  releaseSelectionGroup(api);
  for (const object of api.objectGroup.children) {
    const item = byId.get(object.userData.objectId);
    if (!item) continue;
    object.visible = true;
    object.position.fromArray(item.position);
    object.rotation.set(...item.rotation.map(THREE.MathUtils.degToRad));
    applyConfiguredSize(object, item.size);
  }
  api.objectGroup.updateMatrixWorld(true);
}

function stopPhysics(api, level) {
  if (!api) return;
  disposeLevelPhysics(api.physicsSimulation);
  api.physicsSimulation = null;
  api.physicsEnabled = false;
  clearRuntimeObjects(api);
  restoreConfiguredTransforms(api, level);
}

function clearRuntimeObjects(api) {
  for (const object of [...api.objectGroup.children]) {
    if (!object.userData.runtime) continue;
    api.objectGroup.remove(object);
    api.objectsById.delete(object.userData.objectId);
    disposeGroup(object);
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
  root.userData.locked = item.type === "cannon" || item.type === "attackBall";
  root.userData.runtime = Boolean(item.runtime);
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
  if (spec.material === "platform") {
    visual.position.y = -1.9;
    visual.rotation.y = Math.PI;
    const inverseSize = item.size.map((value) => 1 / Math.max(value, 0.05));
    const parts = [...visual.children];
    const base = new THREE.Group();
    base.name = "平台固定支柱";
    base.scale.fromArray(inverseSize);
    visual.add(base);
    for (const part of parts) {
      const key = part.userData.assetPart;
      if (key === "platform-table") {
        part.position.set(0, 1.722669, 0);
        part.scale.set(0.16228999, 1, 0.36993);
      } else {
        base.add(part);
        const transform = PLATFORM_PART_TRANSFORMS[key];
        if (transform) part.position.fromArray(transform.position);
      }
      let meshIndex = 0;
      part.traverse((node) => {
        if (!node.isMesh) return;
        const variant = key === "platform-pipe" ? "blue"
          : key === "platform-table" && meshIndex > 0 ? "red" : "gold";
        node.userData.ownsGeometry = false;
        node.material = materialFor(spec, null, variant);
        node.castShadow = true;
        node.receiveShadow = true;
        meshIndex += 1;
      });
    }
  } else if (spec.material === "cannon") {
    const parts = [...visual.children];
    const base = parts.find((part) => part.userData.assetPart === "cannon-base");
    for (const part of parts) {
      const key = part.userData.assetPart;
      const transform = CANNON_PART_TRANSFORMS[key];
      if (key === "cannon-counter" && base) base.add(part);
      if (transform?.position) part.position.fromArray(transform.position);
      if (transform?.quaternion) part.quaternion.fromArray(transform.quaternion);
      if (transform?.scale) part.scale.fromArray(transform.scale);
      let meshIndex = 0;
      part.traverse((node) => {
        if (!node.isMesh) return;
        node.userData.ownsGeometry = false;
        const variant = key === "cannon-stabilizer" ? "beige" : meshIndex === 0 ? "red" : "gold";
        node.material = materialFor(spec, null, variant);
        node.castShadow = true;
        node.receiveShadow = true;
        meshIndex += 1;
      });
    }
  } else {
    let meshIndex = 0;
    visual.traverse((node) => {
      if (!node.isMesh) return;
      node.userData.ownsGeometry = false;
      const variant = spec.material === "glass" && meshIndex > 0 ? "lid"
        : spec.material === "wood-cube" && meshIndex > 0 ? "secondary"
          : "body";
      node.material = materialFor(spec, colorFor(item, catalog), variant);
      meshIndex += 1;
      node.castShadow = true;
      node.receiveShadow = true;
    });
  }
  return visual;
}

export default function LevelScene({ level, catalog, selectedId, selectedIds, onSelect, onTransform, onTransformBatch, mode, showGrid, cameraCommand, snap, physics, onPhysicsUpdate, onPhysicsStatus }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const transformSnapshot = useRef(null);
  const transformCallbackRef = useRef(onTransform);
  const batchTransformCallbackRef = useRef(onTransformBatch);
  const selectCallbackRef = useRef(onSelect);
  const physicsUpdateCallbackRef = useRef(onPhysicsUpdate);
  const physicsStatusCallbackRef = useRef(onPhysicsStatus);
  const selectedIdsRef = useRef(selectedIds || (selectedId ? [selectedId] : []));
  transformCallbackRef.current = onTransform;
  batchTransformCallbackRef.current = onTransformBatch;
  selectCallbackRef.current = onSelect;
  physicsUpdateCallbackRef.current = onPhysicsUpdate;
  physicsStatusCallbackRef.current = onPhysicsStatus;
  selectedIdsRef.current = selectedIds || (selectedId ? [selectedId] : []);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb9e5f5, 48, 110);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);
    camera.position.set(12, 10, 15);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
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
      transformSnapshot.current = object === apiRef.current?.selectionGroup
        ? object.children.map((child) => child.userData.objectId)
        : object?.userData.objectId || null;
    });
    transform.addEventListener("mouseUp", () => {
      const object = transform.object;
      if (!object || !transformSnapshot.current) return;
      if (object === apiRef.current?.selectionGroup && Array.isArray(transformSnapshot.current)) {
        const changes = [];
        object.updateMatrixWorld(true);
        objectGroup.updateMatrixWorld(true);
        for (const child of [...object.children]) {
          objectGroup.attach(child);
          const nominal = child.userData.nominalSize || [1, 1, 1];
          changes.push({
            uid: child.userData.objectId,
            position: child.position.toArray().map((value) => Number(value.toFixed(4))),
            rotation: [child.rotation.x, child.rotation.y, child.rotation.z].map((value) => Number(THREE.MathUtils.radToDeg(value).toFixed(3))),
            size: child.scale.toArray().map((value, index) => Number(Math.max(0.05, value * nominal[index]).toFixed(4))),
          });
        }
        object.position.set(0, 0, 0);
        object.rotation.set(0, 0, 0);
        object.scale.set(1, 1, 1);
        batchTransformCallbackRef.current?.(changes);
        transformSnapshot.current = null;
        return;
      }
      const nominal = object.userData.nominalSize || [1, 1, 1];
      transformCallbackRef.current?.(object.userData.objectId, {
        position: object.position.toArray().map((value) => Number(value.toFixed(4))),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map((value) => Number(THREE.MathUtils.radToDeg(value).toFixed(3))),
        size: object.scale.toArray().map((value, index) => Number(Math.max(0.05, value * nominal[index]).toFixed(4))),
      });
      transformSnapshot.current = null;
    });

    const hemi = new THREE.HemisphereLight(0xf4fbff, 0x6aa13d, 2.4);
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
    const rim = new THREE.DirectionalLight(0x74c9ff, 1.35);
    rim.position.set(12, 7, -10);
    scene.add(rim);

    const grid = new THREE.GridHelper(60, 60, 0x557174, 0x2b3a3c);
    grid.position.y = -2.04;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.07 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.035;
    ground.receiveShadow = true;
    scene.add(ground);

    const objectGroup = new THREE.Group();
    scene.add(objectGroup);
    const selectionGroup = new THREE.Group();
    selectionGroup.name = "批量选择枢轴";
    scene.add(selectionGroup);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...objectGroup.children, ...selectionGroup.children], true)[0];
      let selected = hit?.object || null;
      while (selected && !selected.userData.objectId) selected = selected.parent;
      if (apiRef.current?.physicsEnabled) {
        const body = apiRef.current.physicsSimulation?.bodies.get(selected?.userData?.objectId);
        if (body) {
          const direction = raycaster.ray.direction;
          const strength = apiRef.current.physicsImpactForce || 10;
          body.applyImpulse({ x: direction.x * strength, y: Math.max(direction.y * strength, strength * 0.2), z: direction.z * strength }, true);
          body.applyTorqueImpulse({ x: -direction.z * strength * 0.12, y: strength * 0.05, z: direction.x * strength * 0.12 }, true);
        }
        return;
      }
      selectCallbackRef.current?.(selected?.userData?.objectId || null, { additive: event.shiftKey || event.metaKey || event.ctrlKey });
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
    let lastPhysicsPublish = 0;
    const animate = (now) => {
      const simulation = apiRef.current?.physicsSimulation;
      if (simulation && !simulation.paused) {
        stepLevelPhysics(simulation, now);
        for (const uid of simulation.removed) {
          const object = apiRef.current.objectsById.get(uid);
          if (object) {
            apiRef.current.objectGroup.remove(object);
            apiRef.current.objectsById.delete(uid);
            disposeGroup(object);
          }
        }
        simulation.removed.clear();
        for (const [uid, body] of simulation.bodies) {
          const object = apiRef.current.objectsById.get(uid);
          if (!object) continue;
          if (simulation.shattered.has(uid)) {
            object.visible = false;
            continue;
          }
          object.visible = true;
          const position = body.translation();
          const rotation = body.rotation();
          object.position.set(position.x, position.y, position.z);
          object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
        if (now - lastPhysicsPublish > 120) {
          physicsUpdateCallbackRef.current?.(physicsTransforms(simulation));
          lastPhysicsPublish = now;
        }
      }
      orbit.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    apiRef.current = { scene, camera, renderer, orbit, transform, objectGroup, selectionGroup, grid, ground, objectsById: new Map(), physicsEnabled: false, physicsSimulation: null, physicsImpactForce: 10 };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      disposeLevelPhysics(apiRef.current?.physicsSimulation);
      releaseSelectionGroup(apiRef.current);
      disposeGroup(objectGroup);
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.physicsImpactForce = Number(physics?.impactForce) || 10;
  }, [physics?.impactForce]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    let cancelled = false;
    if (!physics?.enabled) {
      stopPhysics(api, level);
      physicsStatusCallbackRef.current?.("idle");
      return;
    }
    releaseSelectionGroup(api);
    api.transform.detach();
    api.physicsEnabled = true;
    disposeLevelPhysics(api.physicsSimulation);
    api.physicsSimulation = null;
    restoreConfiguredTransforms(api, level);
    physicsStatusCallbackRef.current?.("loading");
    createLevelPhysics(level, catalog).then((simulation) => {
      if (cancelled || !apiRef.current || !physics?.enabled) {
        disposeLevelPhysics(simulation);
        return;
      }
      disposeLevelPhysics(api.physicsSimulation);
      restoreConfiguredTransforms(api, level);
      simulation.paused = Boolean(physics.paused);
      api.physicsSimulation = simulation;
      physicsUpdateCallbackRef.current?.(physicsTransforms(simulation));
      physicsStatusCallbackRef.current?.(simulation.paused ? "paused" : "running");
    }).catch((error) => {
      console.error("物理引擎初始化失败", error);
      api.physicsEnabled = false;
      physicsStatusCallbackRef.current?.("error");
    });
    return () => { cancelled = true; };
  }, [physics?.enabled, physics?.resetToken, level?.key, catalog]);

  useEffect(() => {
    const simulation = apiRef.current?.physicsSimulation;
    if (!simulation) return;
    simulation.paused = Boolean(physics?.paused);
    simulation.lastTime = performance.now();
    physicsUpdateCallbackRef.current?.(physicsTransforms(simulation));
    physicsStatusCallbackRef.current?.(simulation.paused ? "paused" : "running");
  }, [physics?.paused]);

  useEffect(() => {
    const api = apiRef.current;
    const token = Number(physics?.fireToken || 0);
    if (!api || !api.physicsSimulation || token <= (api.lastFireToken || 0)) return;
    api.lastFireToken = token;
    const cannon = (level?.objects || []).find((item) => item.type === "cannon");
    const projectile = spawnAttackBall(api.physicsSimulation, cannon);
    if (!projectile) return;
    const { root, spec } = makeEditableObject(projectile, catalog);
    api.objectGroup.add(root);
    api.objectsById.set(projectile.uid, root);
    loadGameModel(spec).then((model) => {
      if (!root.parent) return;
      disposeGroup(root);
      root.userData.nominalSize = spec.nominalSize;
      applyConfiguredSize(root, projectile.size);
      root.add(modelVisual(model, spec, projectile, catalog));
    }).catch((error) => console.warn("攻击球模型加载失败", error));
  }, [physics?.fireToken, level, catalog]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !level) return;
    let cancelled = false;
    disposeLevelPhysics(api.physicsSimulation);
    api.physicsSimulation = null;
    releaseSelectionGroup(api);
    api.transform.detach();
    disposeGroup(api.objectGroup);
    api.objectsById.clear();
    const platformFloor = Math.min(
      -2.035,
      ...(level.objects || []).filter((item) => item.type === "platform").map((item) => item.position[1] - 2.035),
    );
    api.grid.position.y = platformFloor - 0.005;
    api.ground.position.y = platformFloor;
    for (const item of level.objects || []) {
      const { root, spec } = makeEditableObject(item, catalog);
      api.objectGroup.add(root);
      api.objectsById.set(item.uid, root);
      if (!spec) continue;
      loadGameModel(spec).then((model) => {
        if (cancelled || !root.parent) return;
        disposeGroup(root);
        root.userData.nominalSize = spec.nominalSize;
        applyConfiguredSize(root, item.size);
        root.add(modelVisual(model, spec, item, catalog));
        setSelected(root, selectedIdsRef.current.includes(root.userData.objectId));
      }).catch((error) => {
        console.warn(`游戏模型加载失败: ${spec.key}`, error);
      });
    }
    return () => { cancelled = true; };
  }, [level, catalog]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    releaseSelectionGroup(api);
    api.transform.detach();
    if (physics?.enabled) return;
    const activeIds = selectedIds || (selectedId ? [selectedId] : []);
    const activeObjects = [];
    for (const object of api.objectGroup.children) {
      const active = activeIds.includes(object.userData.objectId);
      setSelected(object, active);
      if (active && !object.userData.locked) activeObjects.push(object);
    }
    if (activeObjects.length === 1) api.transform.attach(activeObjects[0]);
    if (activeObjects.length > 1) {
      const bounds = new THREE.Box3();
      for (const object of activeObjects) bounds.expandByObject(object);
      api.selectionGroup.position.copy(bounds.getCenter(new THREE.Vector3()));
      api.selectionGroup.rotation.set(0, 0, 0);
      api.selectionGroup.scale.set(1, 1, 1);
      api.selectionGroup.updateMatrixWorld(true);
      for (const object of activeObjects) api.selectionGroup.attach(object);
      api.transform.attach(api.selectionGroup);
    }
  }, [selectedId, selectedIds, level, physics?.enabled]);

  useEffect(() => { apiRef.current?.transform.setMode(mode); }, [mode]);
  useEffect(() => { if (apiRef.current) apiRef.current.grid.visible = showGrid; }, [showGrid]);
  useEffect(() => {
    const transform = apiRef.current?.transform;
    if (!transform) return;
    transform.setTranslationSnap(snap?.enabled ? snap.translation : null);
    transform.setRotationSnap(snap?.enabled ? THREE.MathUtils.degToRad(snap.rotation) : null);
    transform.setScaleSnap(snap?.enabled ? snap.scale : null);
  }, [snap?.enabled, snap?.translation, snap?.rotation, snap?.scale]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !level || !cameraCommand) return;
    const box = new THREE.Box3().setFromObject(api.objectGroup);
    if (api.selectionGroup.children.length) box.expandByObject(api.selectionGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.length() * 1.05, 8);
    const rootPlatforms = level.objects?.filter((item) => item.type === "platform" && item.area === "根关卡") || [];
    const platforms = rootPlatforms.length ? rootPlatforms : level.objects?.filter((item) => item.type === "platform") || [];
    const heading = platforms.reduce((sum, platform) => {
      const yaw = THREE.MathUtils.degToRad(platform.rotation?.[1] || 0);
      const weight = Math.max(Math.abs((platform.size?.[0] || 1) * (platform.size?.[2] || 1)), 0.001);
      sum.sin += Math.sin(yaw) * weight;
      sum.cos += Math.cos(yaw) * weight;
      return sum;
    }, { sin: 0, cos: 0 });
    const levelYaw = platforms.length ? Math.atan2(heading.sin, heading.cos) : 0;
    const frontDirection = new THREE.Vector3(0, 0.25, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), levelYaw);
    const backDirection = new THREE.Vector3(0, 0.25, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), levelYaw);
    const direction = {
      top: new THREE.Vector3(0, 1, 0.001),
      front: frontDirection,
      back: backDirection,
      side: new THREE.Vector3(1, 0.25, 0),
      iso: new THREE.Vector3(0.8, 0.65, 1),
    }[cameraCommand.preset] || new THREE.Vector3(0.8, 0.65, 1);
    api.camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
    api.orbit.target.copy(center);
    api.orbit.update();
  }, [cameraCommand, level?.key]);

  const backgroundImage = `url(${import.meta.env.BASE_URL}models/backgrounds/game-scene.webp)`;
  return <div className="scene-mount" ref={mountRef} data-testid="level-canvas" title={physics?.enabled ? "点击方块施加冲击" : undefined} style={{ backgroundImage }} />;
}
