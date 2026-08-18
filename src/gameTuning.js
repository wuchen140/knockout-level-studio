export const GAME_TUNING = Object.freeze({
  physics: Object.freeze({
    fixedStep: 0.01666667,
    maxFrameCompensation: 0.05,
    gravity: 25,
    fallHeight: -5,
    horizontalHalfBoundary: 30,
    depthHalfBoundary: 30,
    blocksStartSleeping: true,
    prewarmDuration: 0.1,
    // Unity PhysX source values. Rapier does not expose equivalent
    // position/velocity iteration controls, so these remain reference data.
    sourcePositionSolverIterations: 50,
    sourceVelocitySolverIterations: 12,
    sourceActivePositionIterations: 24,
    sourceActiveVelocityIterations: 6,
    sourceFragmentPositionIterations: 1,
    sourceFragmentVelocityIterations: 1,
  }),
  blocks: Object.freeze({
    catalogMassMultiplier: 0.75,
    solverTierPropagationImpulse: 8,
  }),
  movingPlatform: Object.freeze({
    maxSpeed: 3,
    startupEaseDuration: 0.4,
    pinUndisturbedObjects: true,
    releaseVelocityDifference: 1.5,
  }),
});
