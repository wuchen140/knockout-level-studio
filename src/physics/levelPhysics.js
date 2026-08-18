import * as THREE from "three";
import { GAME_TUNING } from "../gameTuning.js";

const {
  ammunition: AMMUNITION_TUNING,
  ball: BALL_TUNING,
  physics: PHYSICS_TUNING,
  blocks: BLOCK_TUNING,
} = GAME_TUNING;
const NORMAL_AMMUNITION = AMMUNITION_TUNING.normal;
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

function normalizedVelocity(velocity, speed) {
  const length = speedOf(velocity);
  if (length < 0.0001) return null;
  const scale = speed / length;
  return { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale };
}

export function applyDirectionalImpact(body, direction, strength) {
  if (!body || !direction) return;
  const force = Math.max(0, Number(strength) || 0);
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

function blocksTouch(left, right) {
  const leftSize = normalizedSize(left.size);
  const rightSize = normalizedSize(right.size);
  return [0, 1, 2].every((axis) => (
    Math.abs(Number(left.position?.[axis] || 0) - Number(right.position?.[axis] || 0))
      <= (leftSize[axis] + rightSize[axis]) / 2 + 0.08
  ));
}

function buildBlockClusters(objects) {
  const blocks = objects.filter((item) => item.type === "block");
  const neighbors = new Map(blocks.map((item) => [item.uid, []]));
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      if (!blocksTouch(blocks[left], blocks[right])) continue;
      neighbors.get(blocks[left].uid).push(blocks[right].uid);
      neighbors.get(blocks[right].uid).push(blocks[left].uid);
    }
  }
  const clusters = new Map();
  for (const block of blocks) {
    if (clusters.has(block.uid)) continue;
    const cluster = [];
    const pending = [block.uid];
    const visited = new Set(pending);
    while (pending.length) {
      const uid = pending.pop();
      cluster.push(uid);
      for (const neighbor of neighbors.get(uid) || []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    for (const uid of cluster) clusters.set(uid, cluster);
  }
  return clusters;
}

function applyFirstBallCollision(simulation, ballUid, targetUid, now) {
  const profile = simulation.bodyProfiles.get(ballUid);
  if (profile?.objectType !== "attackBall" || profile.firstCollisionAt != null) return;
  const body = simulation.bodies.get(ballUid);
  if (!body) return;
  profile.firstCollisionAt = now;
  const currentVelocity = body.linvel();
  const previousVelocity = simulation.previousVelocities.get(ballUid) || currentVelocity;
  const launchDirection = normalizedVelocity(
    speedOf(currentVelocity) > 0.01 ? currentVelocity : previousVelocity,
    BALL_TUNING.firstCollisionSpeed,
  );
  if (launchDirection) body.setLinvel(launchDirection, true);
  const angularVelocity = body.angvel();
  body.setAngvel({
    x: angularVelocity.x * BALL_TUNING.firstCollisionAngularMultiplier,
    y: angularVelocity.y * BALL_TUNING.firstCollisionAngularMultiplier,
    z: angularVelocity.z * BALL_TUNING.firstCollisionAngularMultiplier,
  }, true);
  if (!targetUid) {
    profile.expiresAt = now;
  }
}

function markImpactShatter(simulation, handle1, handle2, now) {
  const uid1 = simulation.colliderUids.get(handle1);
  const uid2 = simulation.colliderUids.get(handle2);
  if (!uid1 && !uid2) return;
  const groundHit = handle1 === simulation.groundColliderHandle || handle2 === simulation.groundColliderHandle;
  if (groundHit) {
    // The scene floor is a destruction zone: every movable block that falls
    // off a platform shatters there, regardless of its archive material.
    for (const uid of [uid1, uid2]) {
      if (!uid) continue;
      const profile = simulation.bodyProfiles.get(uid);
      if (profile?.objectType === "attackBall") profile.expiresAt = now;
      else simulation.shattered.add(uid);
    }
    return;
  }
  applyFirstBallCollision(simulation, uid1, uid2, now);
  applyFirstBallCollision(simulation, uid2, uid1, now);
  const speed1 = uid1 ? speedOf(simulation.previousVelocities.get(uid1) || { x: 0, y: 0, z: 0 }) : 0;
  const speed2 = uid2 ? speedOf(simulation.previousVelocities.get(uid2) || { x: 0, y: 0, z: 0 }) : 0;
  const impactSpeed = speed1 + speed2;
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
  const blockClusters = buildBlockClusters(level.objects || []);

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
    // The fixed cannon is a firing fixture rather than level geometry. Keeping
    // it out of Rapier prevents its visual muzzle from immediately colliding
    // with the ball spawned at that exact node.
    if (item.type === "cannon") continue;
    if (item.type === "attackBall") {
      const scale = Math.max(...normalizedSize(item.size));
      const radius = BALL_TUNING.radius * scale * NORMAL_AMMUNITION.visualScale;
      const spawnedAt = 0;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...item.position)
          .setRotation(rotation)
          .setGravityScale(NORMAL_AMMUNITION.gravityMultiplier)
          .setLinearDamping(0.05)
          .setAngularDamping(NORMAL_AMMUNITION.angularDamping)
          .setCcdEnabled(true)
          .setCanSleep(true),
      );
      const colliderHandle = world.createCollider(
        RAPIER.ColliderDesc.ball(radius)
          .setMass(NORMAL_AMMUNITION.mass)
          .setFriction(0.35)
          .setRestitution(0.25),
        body,
      ).handle;
      bodies.set(item.uid, body);
      bodyProfiles.set(item.uid, {
        mass: NORMAL_AMMUNITION.mass,
        ammunitionId: NORMAL_AMMUNITION.id,
        impactShatter: false,
        objectType: "attackBall",
        spawnedAt,
        expiresAt: spawnedAt + BALL_TUNING.lifetime * 1000,
      });
      colliderUids.set(colliderHandle, item.uid);
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
    blockClusters,
    groundColliderHandle,
    eventQueue,
    previousVelocities: new Map(),
    shattered: new Set(),
    removed: new Set(),
    simulationTime: 0,
    accumulator: 0,
    lastTime: performance.now(),
    fixedStep: FIXED_STEP,
  };
}

export function spawnAttackBall(simulation, cannon, muzzlePose = null) {
  if (!simulation || !cannon) return null;
  const cannonRotation = new THREE.Euler(...(cannon.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
  const fallbackDirection = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(8)), Math.cos(THREE.MathUtils.degToRad(8)))
    .applyEuler(cannonRotation)
    .normalize();
  const direction = muzzlePose?.direction
    ? new THREE.Vector3().fromArray(muzzlePose.direction).normalize()
    : fallbackDirection;
  const position = muzzlePose?.position
    ? new THREE.Vector3().fromArray(muzzlePose.position)
    : new THREE.Vector3().fromArray(cannon.position || [0, 0, 5]).add(fallbackDirection.clone().multiplyScalar(1.1));
  const randomAngularVelocity = new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
  ).normalize().multiplyScalar(Math.random() * BALL_TUNING.launchRandomAngularSpeed);
  const uid = `attack-ball-runtime-${crypto.randomUUID()}`;
  const spawnedAt = simulation.simulationTime;
  const body = simulation.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinvel(
        direction.x * NORMAL_AMMUNITION.launchSpeed,
        direction.y * NORMAL_AMMUNITION.launchSpeed,
        direction.z * NORMAL_AMMUNITION.launchSpeed,
      )
      .setAngvel(randomAngularVelocity)
      .setGravityScale(NORMAL_AMMUNITION.gravityMultiplier)
      .setLinearDamping(0)
      .setAngularDamping(NORMAL_AMMUNITION.angularDamping)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(NORMAL_AMMUNITION.launchSpeed * FIXED_STEP)
      .setCanSleep(true),
  );
  const colliderHandle = simulation.world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_TUNING.radius * NORMAL_AMMUNITION.visualScale)
      .setMass(NORMAL_AMMUNITION.mass)
      .setFriction(0.35)
      .setRestitution(0.25),
    body,
  ).handle;
  if (RAPIER.ActiveEvents?.COLLISION_EVENTS != null) body.collider(0).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  simulation.bodies.set(uid, body);
  simulation.bodyProfiles.set(uid, {
    mass: NORMAL_AMMUNITION.mass,
    ammunitionId: NORMAL_AMMUNITION.id,
    impactShatter: false,
    objectType: "attackBall",
    spawnedAt,
    expiresAt: spawnedAt + BALL_TUNING.lifetime * 1000,
    spawnPosition: position.toArray(),
  });
  simulation.colliderUids.set(colliderHandle, uid);
  return {
    uid, type: "attackBall", name: NORMAL_AMMUNITION.name, area: cannon.area || "根关卡",
    position: position.toArray(), rotation: [0, 0, 0],
    size: Array(3).fill(NORMAL_AMMUNITION.visualScale), runtime: true,
  };
}

function removeSimulationBody(simulation, uid, body) {
  const collider = body.collider(0);
  if (collider) simulation.colliderUids.delete(collider.handle);
  simulation.world.removeRigidBody(body);
  simulation.bodies.delete(uid);
  simulation.bodyProfiles.delete(uid);
  simulation.previousVelocities.delete(uid);
  simulation.removed.add(uid);
}

function updateAttackBall(simulation, uid, body, profile, now) {
  let velocity = body.linvel();
  let speed = speedOf(velocity);
  if (speed > PHYSICS_TUNING.maxBallSpeed) {
    const clamped = normalizedVelocity(velocity, PHYSICS_TUNING.maxBallSpeed);
    body.setLinvel(clamped, true);
    velocity = clamped;
    speed = PHYSICS_TUNING.maxBallSpeed;
  }

  const position = body.translation();
  const depthTravelled = Math.abs(position.z - Number(profile.spawnPosition?.[2] ?? position.z));
  body.setLinearDamping(
    BALL_TUNING.farDistanceDampingEnabled && depthTravelled >= BALL_TUNING.dampingDepth
      ? BALL_TUNING.farDistanceDamping
      : 0,
  );

  if (profile.firstCollisionAt != null) {
    if (speed < BALL_TUNING.stationarySpeed) {
      profile.stationarySince ??= now;
      if (now - profile.stationarySince >= BALL_TUNING.stationaryDuration * 1000) {
        profile.expiresAt = Math.min(
          profile.expiresAt,
          now + BALL_TUNING.stationaryRemainingLifetime * 1000,
        );
      }
    } else {
      profile.stationarySince = null;
    }
  }

  const outOfBounds = position.y < PHYSICS_TUNING.fallHeight
    || Math.abs(position.x) > PHYSICS_TUNING.horizontalHalfBoundary
    || Math.abs(position.z) > PHYSICS_TUNING.depthHalfBoundary
    || depthTravelled > BALL_TUNING.outOfBoundsDepth;
  if (now >= profile.expiresAt || outOfBounds) removeSimulationBody(simulation, uid, body);
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
    simulation.simulationTime += simulation.fixedStep * 1000;
    simulation.eventQueue?.drainCollisionEvents((handle1, handle2, started) => {
      if (started) markImpactShatter(simulation, handle1, handle2, simulation.simulationTime);
    });
    simulation.accumulator -= simulation.fixedStep;
    steps += 1;
  }
  for (const [uid, body] of [...simulation.bodies]) {
    const profile = simulation.bodyProfiles.get(uid);
    if (profile?.objectType === "attackBall" && profile.spawnedAt != null) {
      updateAttackBall(simulation, uid, body, profile, simulation.simulationTime);
      continue;
    }
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
