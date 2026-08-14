import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const assetUrl = (path) => `${import.meta.env.BASE_URL}models/${path}`;
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const modelCache = new Map();
const textureCache = new Map();

const TEXTURE_SETS = {
  "wood-cube": { map: "wood-cube-color", normalMap: "wood-cube-normal", roughness: 0.72 },
  "wood-cylinder": { map: "wood-cylinder-color", normalMap: "wood-cylinder-normal", roughness: 0.76 },
  "stone-cube": { map: "stone-cube-color", normalMap: "stone-cube-normal", roughness: 0.84 },
  "stone-cylinder": { map: "stone-cylinder-color", normalMap: "stone-cylinder-normal", roughness: 0.86 },
  "metal-cube": { map: "metal-cube-color", metalnessMap: "metal-cube-metalness", emissiveMap: "metal-cube-emissive", roughness: 0.3, metalness: 0.92 },
  "metal-cylinder": { map: "metal-cylinder-color", roughnessMap: "metal-cylinder-roughness", roughness: 0.54, metalness: 0.9 },
  // The Unity ice materials use opaque mode (_Mode 0, alpha 1, ZWrite 1).
  "ice-cube": { map: "ice-cube-color", normalMap: "ice-cube-normal", roughness: 0.375, metalness: 0.225 },
  "ice-cylinder": { map: "ice-cylinder-color", normalMap: "ice-cylinder-normal", roughness: 0.375, metalness: 0.225 },
  column: { map: "column-color", normalMap: "column-normal", metalnessMap: "column-metalness", emissiveMap: "column-emissive", roughness: 0.38, metalness: 0.7 },
  jelly: { map: "jelly-color", emissiveMap: "jelly-emissive", roughness: 0.3, metalness: 0.08 },
  shredder: { map: "shredder-color", emissiveMap: "shredder-emissive", roughnessMap: "shredder-roughness", roughness: 0.42, metalness: 0.7 },
};

function nearestLength(value) {
  return THREE.MathUtils.clamp(Math.round(value || 1), 1, 4);
}

export function assetSpecFor(item) {
  if (!item) return null;
  if (item.type === "platform") {
    return {
      key: "platform",
      material: "platform",
      nominalSize: [1, 1, 1],
      parts: [
        "platform-table",
        "platform-pipe",
        "platform-ball-1",
        "platform-ball-2",
        "platform-ball-3",
        "platform-ball-4",
        "platform-mid-gold",
        "platform-bottom-gold",
      ],
    };
  }
  const yLength = nearestLength(item.size?.[1]);
  if (item.materialId === 0) {
    const kind = item.shapeId === 1 ? "cylinder" : "cube";
    return { key: `wood-${kind}-y${yLength}`, material: `wood-${kind}`, nominalSize: [1, yLength, 1] };
  }
  if (item.materialId === 1) {
    const kind = item.shapeId === 1 ? "cylinder" : "cube";
    return { key: `stone-${kind}-y${yLength}`, material: `stone-${kind}`, nominalSize: [1, yLength, 1] };
  }
  if (item.materialId === 2) {
    const kind = item.shapeId === 1 ? "cylinder" : "cube";
    return { key: `metal-${kind}-y${yLength}`, material: `metal-${kind}`, nominalSize: [1, yLength, 1] };
  }
  if (item.materialId === 3) {
    const kind = item.shapeId === 1 ? "cylinder" : "cube";
    return { key: `ice-${kind}-y${yLength}`, material: `ice-${kind}`, nominalSize: [1, yLength, 1] };
  }
  if (item.materialId === 4) {
    return {
      key: `glass-y${Math.min(yLength, 3)}`,
      material: "glass",
      nominalSize: [1, Math.min(yLength, 3), 1],
      parts: [`glass-shell-y${Math.min(yLength, 3)}`, `glass-lid-y${Math.min(yLength, 3)}`],
    };
  }
  if (item.materialId === 6) {
    const kind = item.shapeId === 2 ? "cone" : item.shapeId === 1 ? "cylinder" : "cube";
    return { key: `plastic-${kind}`, material: "plastic", nominalSize: [1, 1, 1] };
  }
  if (item.materialId === 7) {
    return { key: "shredder", material: "shredder", nominalSize: [1, 1, 1] };
  }
  if (item.materialId === 8 || item.materialId === 9) {
    const family = item.materialId === 8 ? "jelly" : "column";
    const xLength = nearestLength(item.size?.[0]);
    const horizontal = xLength > 1 && xLength >= yLength;
    const axis = horizontal ? "x" : "y";
    const length = horizontal ? xLength : yLength;
    return {
      key: `${family}-${axis}${length}`,
      material: family,
      nominalSize: horizontal ? [length, 1, 1] : [1, length, 1],
    };
  }
  return null;
}

function texture(name, color = false) {
  if (!name) return null;
  if (!textureCache.has(name)) {
    const loaded = textureLoader.load(assetUrl(`textures/${name}.webp`));
    // These textures use the UV orientation of the Unity-exported GLB meshes.
    // GLTFLoader applies the same setting to embedded textures.
    loaded.flipY = false;
    loaded.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    loaded.anisotropy = 4;
    textureCache.set(name, loaded);
  }
  return textureCache.get(name);
}

export function loadGameModel(spec) {
  if (!spec) return Promise.resolve(null);
  const modelKeys = spec.parts || [spec.key];
  if (!modelCache.has(spec.key)) {
    modelCache.set(spec.key, Promise.all(modelKeys.map((key) => new Promise((resolve, reject) => {
      gltfLoader.load(assetUrl(`game/${key}.glb`), (gltf) => resolve(gltf.scene), undefined, reject);
    }))).then((scenes) => {
      const scene = new THREE.Group();
      scenes.forEach((part, index) => {
        part.userData.assetPart = modelKeys[index];
        scene.add(part);
      });
      const bounds = new THREE.Box3().setFromObject(scene);
      return { scene, sourceSize: bounds.getSize(new THREE.Vector3()) };
    }));
  }
  return modelCache.get(spec.key);
}

export function materialFor(spec, tint, variant = "body") {
  if (spec?.material === "platform") {
    const settings = {
      gold: { color: 0xffaa01, roughness: 0.3, metalness: 0.5 },
      red: { color: 0xb30000, roughness: 0.5, metalness: 0.02 },
      blue: { color: 0x0044ff, roughness: 0.55, metalness: 0.02 },
    }[variant] || { color: 0xffaa01, roughness: 0.4, metalness: 0.35 };
    const material = new THREE.MeshStandardMaterial(settings);
    material.emissive.set(variant === "blue" ? 0x000b26 : variant === "red" ? 0x1a0000 : 0x281000);
    material.emissiveIntensity = 0.2;
    material.userData.baseEmissive = material.emissive.getHex();
    material.userData.baseEmissiveIntensity = material.emissiveIntensity;
    return material;
  }

  if (spec?.material === "glass") {
    const isLid = variant === "lid";
    const material = new THREE.MeshPhysicalMaterial({
      color: isLid ? 0xd8d8d0 : tint,
      map: texture("glass-color", true),
      roughnessMap: texture("glass-roughness"),
      // Match the opaque Unity toon material: _Mode 0, alpha 1 and ZWrite 1.
      roughness: isLid ? 0.6 : 0.3,
      metalness: 0.1,
      clearcoat: isLid ? 0.35 : 0.72,
      clearcoatRoughness: isLid ? 0.28 : 0.16,
      transparent: false,
      opacity: 1,
      transmission: 0,
      depthWrite: true,
    });
    material.emissive.set(isLid ? 0x11110f : new THREE.Color(tint).multiplyScalar(0.045));
    material.emissiveIntensity = isLid ? 0.18 : 0.35;
    material.userData.baseEmissive = material.emissive.getHex();
    material.userData.baseEmissiveIntensity = material.emissiveIntensity;
    return material;
  }

  if (spec?.material === "plastic") {
    const material = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.3, metalness: 0.06 });
    material.userData.baseEmissive = 0x000000;
    return material;
  }

  const settings = TEXTURE_SETS[spec?.material] || {};
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture(settings.map, true),
    normalMap: texture(settings.normalMap),
    metalnessMap: texture(settings.metalnessMap),
    roughnessMap: texture(settings.roughnessMap),
    emissiveMap: texture(settings.emissiveMap, true),
    roughness: settings.roughness ?? 0.65,
    metalness: settings.metalness ?? 0.05,
    transparent: settings.transparent || false,
    opacity: settings.opacity ?? 1,
  });
  const hasEmission = Boolean(settings.emissiveMap);
  material.emissive.setHex(hasEmission ? 0x262626 : 0x000000);
  material.emissiveIntensity = hasEmission ? 0.65 : 0;
  material.userData.baseEmissive = hasEmission ? 0x262626 : 0x000000;
  material.userData.baseEmissiveIntensity = hasEmission ? 0.65 : 0;
  return material;
}
