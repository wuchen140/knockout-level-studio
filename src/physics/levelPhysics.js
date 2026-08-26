import * as THREE from "three";
import { GAME_TUNING } from "../gameTuning.js";

const {
  physics: PHYSICS_TUNING,
  blocks: BLOCK_TUNING,
} = GAME_TUNING;
const FIXED_STEP = PHYSICS_TUNING.fixedStep;
const FALLBACK_PROFILE = {
  mass: 1,
  staticFriction: 0.4,
  dynamicFriction: 0.4,
  physicsMaterial: "BlockPhysic_s0.4_d0.4",
  impactShatter: false,
  shatterThreshold: 8,
  fragmentVelocityMultiplier: 0.15,
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

function normalizedSize(size = [1, 1, 1]) {
  return size.map((value) => Math.max(0.05, Number(value) || 1));
}

function cylinderAxis(size) {
  const [width, height, depth] = size;
  if (width > height && width >= depth) return 0;
  if (depth > height && depth > width) return 2;
  return 1;
}

function shapeVolume(size, shapeId) {
  const [width, height, depth] = normalizedSize(size);
  if (shapeId === 1) {
    const axis = cylinderAxis([width, height, depth]);
    const dimensions = [width, height, depth];
    const length = dimensions[axis];
    const radius = Math.max(...dimensions.filter((_, index) => index !== axis)) / 2;
    return Math.PI * radius * radius * length;
  }
  if (shapeId === 2) return Math.PI * (Math.max(width, depth) / 2) ** 2 * height / 3;
  return width * height * depth;
}

function blockCollider(item) {
  const [width, height, depth] = normalizedSize(item.size);
  if (item.shapeId === 1) {
    const axis = cylinderAxis([width, height, depth]);
    const dimensions = [width, height, depth];
    const length = dimensions[axis];
    const radius = Math.max(...dimensions.filter((_, index) => index !== axis)) / 2;
    const collider = RAPIER.ColliderDesc.cylinder(length / 2, radius);
    // Rapier cylinders are aligned to local Y. Unity also uses the longest
    // scale axis as the cylinder axis for the horizontal column variants.
    if (axis === 0) collider.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
    if (axis === 2) collider.setRotation({ x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
    return collider;
  }
  if (item.shapeId === 2) return RAPIER.ColliderDesc.cone(height / 2, Math.max(width, depth) / 2);
  return RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2);
}

function speedOf(velocity) {
  return Math.hypot(velocity.x, velocity.y, velocity.z);
}

export function applyDirectionalImpact(body, direction, strength) {
  if (!body || !direction) return;
  const force = Math.max(0, Number(strength) || 0);
  body.setGravityScale?.(1, true);
  body.wakeUp?.();
  body.applyImpulse({
    x: direction.x * force,
    y: Math.max(direction.y * force, force * 0.2),
    z: direction.z * force,
  }, true);
  body.applyTorqueImpulse({
    x: -direction.z * force * 0.12,
    y: force * 0.05,
    z: direction.x * force * 0.12,
  }, true);
}

function markImpactShatter(simulation, handle1, handle2) {
  const uid1 = simulation.colliderUids.get(handle1);
  const uid2 = simulation.colliderUids.get(handle2);
  if (!uid1 && !uid2) return;
  const groundHit = handle1 === simulation.groundColliderHandle || handle2 === simulation.groundColliderHandle;
  if (groundHit) {
    // The scene floor is a destruction zone: every movable block that falls
    // off a platform shatters there, regardless of its archive material.
    for (const uid of [uid1, uid2]) {
      if (!uid) continue;
      simulation.shattered.add(uid);
    }
    return;
  }
  const speed1 = uid1 ? speedOf(simulation.previousVelocities.get(uid1) || { x: 0, y: 0, z: 0 }) : 0;
  const speed2 = uid2 ? speedOf(simulation.previousVelocities.get(uid2) || { x: 0, y: 0, z: 0 }) : 0;
  const impactSpeed = speed1 + speed2;
  // Keep gravity enabled across a collision chain. This also covers bodies
  // that were initially sleeping during the authored-pose prewarm.
  const active = [uid1, uid2].some((uid) => {
    const body = uid ? simulation.bodies.get(uid) : null;
    return body?.gravityScale?.() > 0;
  });
  if (active) {
    for (const uid of [uid1, uid2]) {
      const body = uid ? simulation.bodies.get(uid) : null;
      if (body) body.setGravityScale(1, true);
    }
  }
  for (const uid of [uid1, uid2]) {
    if (!uid || simulation.shattered.has(uid)) continue;
    const profile = simulation.bodyProfiles.get(uid);
    if (profile?.impactShatter && impactSpeed >= Number(profile.shatterThreshold || Infinity)) simulation.shattered.add(uid);
  }
}

function sameSize(left, right) {
  return left?.length === right?.length && left.every((value, index) => Math.abs(Number(value) - Number(right[index])) < 0.01);
}

export function profileFor(item, catalog) {
  const profiles = catalog?.profiles || [];
  const exact = profiles.find((profile) => profile.materialId === item.materialId && profile.shapeId === item.shapeId && sameSize(profile.size, item.size));
  if (exact) return exact;
  const candidates = profiles.filter((profile) => profile.materialId === item.materialId && profile.shapeId === item.shapeId);
  if (!candidates.length) return FALLBACK_PROFILE;
  return candidates.reduce((closest, profile) => {
    const distance = profile.size.reduce((total, value, index) => total + Math.abs(Number(value) - Number(item.size?.[index] || 1)), 0);
    return distance < closest.distance ? { profile, distance } : closest;
  }, { profile: candidates[0], distance: Infinity }).profile;
}

export async function createLevelPhysics(level, catalog) {
  await ensureRapier();
  // Build contacts without letting gravity displace the authored structure
  // before its first visible frame.
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = FIXED_STEP;
  const bodies = new Map();
  const bodyProfiles = new Map();
  const colliderUids = new Map();

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
    const profile = profileFor(item, catalog);
    const size = normalizedSize(item.size);
    const volume = shapeVolume(size, item.shapeId);
    const referenceVolume = shapeVolume(profile.size || [1, 1, 1], item.shapeId);
    const mass = Math.max(
      0.001,
      Number(profile.mass || 1) * BLOCK_TUNING.catalogMassMultiplier * volume / Math.max(referenceVolume, 0.0001),
    );
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...item.position)
        .setRotation(rotation)
        // Physics preview starts with every block participating in gravity
        // and collision. The authored pose is still prewarmed and put to
        // sleep below so the first visible frame does not jump.
        .setGravityScale(1)
        .setLinearDamping(0.12)
        .setAngularDamping(0.18)
        .setCcdEnabled(true)
        .setCanSleep(true)
        .setSleeping(PHYSICS_TUNING.blocksStartSleeping),
    );
    const collider = blockCollider(item)
      .setDensity(mass / volume)
      .setFriction(Number(profile.dynamicFriction ?? profile.staticFriction ?? FALLBACK_PROFILE.dynamicFriction))
      // The archive defines static/dynamic friction but no bounciness. Unity's
      // block materials therefore behave as non-bouncy contacts in the preview.
      .setRestitution(0);
    const colliderHandle = world.createCollider(collider, body).handle;
    bodies.set(item.uid, body);
    bodyProfiles.set(item.uid, { ...profile, mass });
    colliderUids.set(colliderHandle, item.uid);
  }

  const groundLevel = Math.min(
    -2.035,
    ...(level.objects || []).filter((item) => item.type === "platform").map((item) => Number(item.position?.[1] || 0) - 2.035),
  );
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundLevel, 0));
  const groundColliderHandle = world.createCollider(
    RAPIER.ColliderDesc.cuboid(50, 0.1, 50)
      .setTranslation(0, -0.1, 0)
      .setFriction(0.78)
      .setRestitution(0),
    groundBody,
  ).handle;

  const eventQueue = new RAPIER.EventQueue(true);
  for (const [uid, body] of bodies) {
    const collider = body.collider(0);
    if (RAPIER.ActiveEvents?.COLLISION_EVENTS != null) collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }
  const prewarmSteps = Math.ceil(PHYSICS_TUNING.prewarmDuration / FIXED_STEP);
  for (let step = 0; step < prewarmSteps; step += 1) world.step(eventQueue);
  for (const item of level.objects || []) {
    if (item.type !== "block") continue;
    const body = bodies.get(item.uid);
    if (!body) continue;
    body.setTranslation({ x: item.position[0], y: item.position[1], z: item.position[2] }, false);
    body.setRotation(quaternionFor(item.rotation), false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    body.sleep();
  }
  world.gravity = { x: 0, y: -PHYSICS_TUNING.gravity, z: 0 };
  eventQueue.drainCollisionEvents(() => {});
  return {
    world,
    bodies,
    bodyProfiles,
    colliderUids,
    groundColliderHandle,
    eventQueue,
    previousVelocities: new Map(),
    shattered: new Set(),
    accumulator: 0,
    lastTime: performance.now(),
    fixedStep: FIXED_STEP,
  };
}

export function stepLevelPhysics(simulation, now) {
  const elapsed = Math.min(
    Math.max((now - simulation.lastTime) / 1000, 0),
    PHYSICS_TUNING.maxFrameCompensation,
  );
  simulation.lastTime = now;
  simulation.accumulator += elapsed;
  let steps = 0;
  const maxSteps = Math.ceil(PHYSICS_TUNING.maxFrameCompensation / simulation.fixedStep);
  while (simulation.accumulator >= simulation.fixedStep && steps < maxSteps) {
    for (const [uid, body] of simulation.bodies) simulation.previousVelocities.set(uid, body.linvel());
    simulation.world.step(simulation.eventQueue);
    simulation.eventQueue?.drainCollisionEvents((handle1, handle2, started) => {
      if (started) markImpactShatter(simulation, handle1, handle2);
    });
    simulation.accumulator -= simulation.fixedStep;
    steps += 1;
  }
  for (const [uid, body] of simulation.bodies) {
    const position = body.translation();
    if (position.y < PHYSICS_TUNING.fallHeight
      || Math.abs(position.x) > PHYSICS_TUNING.horizontalHalfBoundary
      || Math.abs(position.z) > PHYSICS_TUNING.depthHalfBoundary) {
      simulation.shattered.add(uid);
    }
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
      shattered: simulation.shattered.has(uid),
    };
  });
}

export function disposeLevelPhysics(simulation) {
  simulation?.eventQueue?.free();
  simulation?.world?.free();
}
