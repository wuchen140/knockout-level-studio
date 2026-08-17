import * as THREE from "three";

const FIXED_STEP = 1 / 60;
const MATERIAL_PHYSICS = {
  0: { density: 0.7, friction: 0.68, restitution: 0.05 },
  1: { density: 2.2, friction: 0.8, restitution: 0.02 },
  2: { density: 3.2, friction: 0.5, restitution: 0.06 },
  3: { density: 0.9, friction: 0.035, restitution: 0.03 },
  4: { density: 1.25, friction: 0.32, restitution: 0.1 },
  5: { density: 0.85, friction: 0.45, restitution: 0.16 },
};

let rapierReady;
let RAPIER;

function ensureRapier() {
  rapierReady ||= import("@dimforge/rapier3d-compat").then(async (module) => {
    RAPIER = module.default;
    await RAPIER.init();
  });
  return rapierReady;
}

function quaternionFor(rotation = [0, 0, 0]) {
  const euler = new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad));
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function blockCollider(item) {
  const [width, height, depth] = item.size.map((value) => Math.max(0.05, value));
  if (item.shapeId === 1) return RAPIER.ColliderDesc.cylinder(height / 2, Math.max(width, depth) / 2);
  if (item.shapeId === 2) return RAPIER.ColliderDesc.cone(height / 2, Math.max(width, depth) / 2);
  return RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2);
}

export async function createLevelPhysics(level) {
  await ensureRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;
  const bodies = new Map();

  for (const item of level.objects || []) {
    const rotation = quaternionFor(item.rotation);
    if (item.type === "platform") {
      const size = item.size.map((value) => Math.max(0.05, value));
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(...item.position)
          .setRotation(rotation),
      );
      const collider = RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setTranslation(0, -size[1] / 2, 0)
        .setFriction(0.78)
        .setRestitution(0.02);
      world.createCollider(collider, body);
      continue;
    }
    if (item.type !== "block") continue;
    const material = MATERIAL_PHYSICS[item.materialId] || MATERIAL_PHYSICS[0];
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...item.position)
        .setRotation(rotation)
        .setLinearDamping(0.12)
        .setAngularDamping(0.18)
        .setCcdEnabled(true)
        .setCanSleep(true),
    );
    const collider = blockCollider(item)
      .setDensity(material.density)
      .setFriction(material.friction)
      .setRestitution(material.restitution);
    world.createCollider(collider, body);
    bodies.set(item.uid, body);
  }

  return { world, bodies, accumulator: 0, lastTime: performance.now(), fixedStep: FIXED_STEP };
}

export function stepLevelPhysics(simulation, now) {
  const elapsed = Math.min(Math.max((now - simulation.lastTime) / 1000, 0), 0.1);
  simulation.lastTime = now;
  simulation.accumulator += elapsed;
  let steps = 0;
  while (simulation.accumulator >= simulation.fixedStep && steps < 6) {
    simulation.world.step();
    simulation.accumulator -= simulation.fixedStep;
    steps += 1;
  }
}

export function physicsTransforms(simulation) {
  return [...simulation.bodies].map(([uid, body]) => {
    const position = body.translation();
    const rotation = body.rotation();
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return {
      uid,
      position: [position.x, position.y, position.z].map((value) => Number(value.toFixed(4))),
      rotation: [euler.x, euler.y, euler.z].map((value) => Number(THREE.MathUtils.radToDeg(value).toFixed(3))),
    };
  });
}

export function disposeLevelPhysics(simulation) {
  simulation?.world?.free();
}
