import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const PLATFORM_COLOR = 0x59656a;
const DEFAULT_COLORS = {
  0: "#d8d2c6", 1: "#e57373", 2: "#fae58c", 3: "#64b5f6",
  4: "#81c784", 5: "#ffad66", 6: "#f48fb1", 7: "#b39ddb",
};

function geometryFor(item) {
  if (item.type === "platform") return new THREE.BoxGeometry(1, 1, 1);
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
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  }
}

export default function LevelScene({ level, catalog, selectedId, onSelect, onTransform, mode, showGrid, cameraCommand }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const transformSnapshot = useRef(null);
  const transformCallbackRef = useRef(onTransform);
  const selectCallbackRef = useRef(onSelect);
  transformCallbackRef.current = onTransform;
  selectCallbackRef.current = onSelect;

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
      transformCallbackRef.current?.(object.userData.objectId, {
        position: object.position.toArray().map((value) => Number(value.toFixed(4))),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map((value) => Number(THREE.MathUtils.radToDeg(value).toFixed(3))),
        size: object.scale.toArray().map((value) => Number(Math.max(0.05, value).toFixed(4))),
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
      const hit = raycaster.intersectObjects(objectGroup.children, false)[0];
      selectCallbackRef.current?.(hit?.object?.userData?.objectId || null);
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
    api.transform.detach();
    disposeGroup(api.objectGroup);
    for (const item of level.objects || []) {
      const material = new THREE.MeshStandardMaterial({
        color: colorFor(item, catalog),
        roughness: item.materialId === 2 ? 0.34 : 0.64,
        metalness: item.materialId === 2 ? 0.72 : 0.05,
        transparent: item.materialId === 4,
        opacity: item.materialId === 4 ? 0.72 : 1,
      });
      const mesh = new THREE.Mesh(geometryFor(item), material);
      mesh.name = item.name;
      mesh.userData.objectId = item.uid;
      mesh.position.fromArray(item.position);
      mesh.rotation.set(...item.rotation.map(THREE.MathUtils.degToRad));
      mesh.scale.fromArray(item.size.map((value) => Math.max(0.05, value)));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      api.objectGroup.add(mesh);
    }
  }, [level, catalog]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.transform.detach();
    for (const mesh of api.objectGroup.children) {
      const active = mesh.userData.objectId === selectedId;
      mesh.material.emissive?.set(active ? 0x214f4c : 0x000000);
      mesh.material.emissiveIntensity = active ? 0.75 : 0;
      if (active) api.transform.attach(mesh);
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
