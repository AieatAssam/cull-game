export const TUNING = {
  gateAspect: 1,
  // Portrait phone gate (2:3): visible height over width; fills a portrait phone between pause row and thumb controls. Run config, see DECISIONS 2026-10-14 (phone frame).
  portraitGateTall: 1.5,
  // Portrait takes and scenes start one framing step tighter (medium, zoomSteps[2]) than startZoom so the Talent reads bigger on a phone. DECISIONS 2026-10-14 (phone zoom).
  portraitStartZoom: 24,
  cameraPitch: 55,
  projectionPitchScale: 0.8191520442889918,
  projectionPitchCosine: 0.5735764363510462,
  zoomRangesByScene: [[10, 48], [10, 40], [10, 32]] as const,
  tickRate: 60,
  maxCatchupTicks: 5,
  startFilm: 90,
  // Out-of-frame rule (graded): free for offscreenGrace, then film drains extra while she is lost, and the take fails at offscreenFailSeconds.
  offscreenGrace: 0.5,
  offscreenFilmDrainPerSecond: 4,
  offscreenFailSeconds: 3,
  minZoom: 10,
  maxZoom: 48,
  panSpeed: 0.3,
  panAcceleration: 0.9,
  steadyFactor: 0.35,
  // Zoom speed per second at a light input; the curve below boosts it hard toward full input (DECISIONS 2026-10-13, fast zoom).
  zoomRate: 1.6,
  // Full input zooms ln(zoomRate) × (1 + zoomBoost) per second in log terms: widest→tightest ≈ 0.35 s. Light inputs (bots, fine trims) stay near zoomRate.
  zoomBoost: 8.6,
  // Framing steps a tap snaps between: close-up 10 and 16, medium 24, medium-wide 38 (Urchins dull), wide 48.
  zoomSteps: [10, 16, 24, 38, 48] as const,
  rotationSeconds: 0.18,
  motionThreshold: 0.12,
  popInExclusion: 2,
  callSheetMargin: 0.25,
  lodThresholds: [48, 24, 10, 4] as const,
  lodHysteresis: 0.15,
  talentSpeeds: [2, 2.5, 3.2, 3.6] as const,
  talentRadii: [0.3, 0.4, 0.6, 0.75] as const,
  startZoom: 30,
  sceneFilm: 30,
  reelFilm: 15,
  // Shutter (concept review B1, DECISIONS 2026-10-14). CUT slices every live hazard fully outside the frame, then recharges.
  shutterRechargeSeconds: 1.8,
  // Distance classes from her: close ≤ closeCutRadius < normal ≤ farCutRadius < too-far.
  closeCutRadius: 1.5,
  farCutRadius: 8,
  // Score per hazard by class, times the combo multiplier 1 + comboStep × (combo − 1). Too-far cuts score nothing.
  closeCutScore: 250,
  normalCutScore: 50,
  comboStep: 0.5,
  // Film refunded per close cut; film a missed CUT (nothing cut) wastes; film a CUT costs when she is not framed.
  closeCutFilm: 2,
  missedCutFilm: 2,
  penalisedCutFilm: 4,
  // Off-frame threats (edge indicators) are listed when they would reach her within this many seconds.
  threatHorizonSeconds: 6,
  // Framing an Urchin out no longer stops it (DECISIONS 2026-10-14, shutter pressure): fully off-frame it turns back on her
  // and rolls this many times faster, so a framed-out Urchin is a clock the player must CUT against, not a solved problem.
  offFrameUrchinSpeedFactor: 3,
  // Defang marks stand this far from Glass on the walked side: the close cut at the mark would shatter it.
  glassShatterRadius: 6,
  urchinSpeed: 1.5,
  // Bible M2 "Night/finale hazard density and speed": Urchin roll speed by scene difficulty (Backlot, City, Night, finale).
  urchinSpeedByDifficulty: [1.5, 1.5, 4.4, 4.7] as const,
  urchinRadius: 0.7,
  // Share of generated Urchins that enter ahead on the walked path (bible M2: ≥ 50%), denser at Night and in the finale.
  aheadEntryShare: [0.6, 0.6, 0.9, 0.9] as const,
  // Urchin waves (DECISIONS 2026-10-14, shutter density): followers per ahead-entry Urchin by scene difficulty, spaced this far
  // up the path behind it, so a wave arrives staggered across one shutter recharge. Night and the finale already run 0.9 ahead.
  urchinWaveFollowers: [4, 2, 0, 0] as const,
  urchinWaveGap: 7,
  // From this scene difficulty on (Night, finale), ahead-entry Urchins are already rolling once they are on the call sheet.
  rollingEntryFromDifficulty: 2,
  boulderSpeed: 4,
  boulderRadius: 0.8,
  extrasSpeed: 0.8,
  extrasMemberRadius: 0.18,
  extrasRadius: 2,
  // A Wide crowd tramples on contact with a visible member, not an invisible disc around its centre.
  extrasContactRadius: 0.35,
  swarmRadius: 0.08,
  stagehandSpeed: 3,
  rumourGrowRate: 0.3,
  rumourShrinkRate: 0.5,
  bridgeLength: 14,
  // The hostile camera's tally: it must hold the Talent in its cone, in frame, this long before the take fails.
  hostileLockSeconds: 1,
  hostileOffset: 6,
  hostileRange: 18,
  // Shot-list gates (bible M2): seeded per scene; the defang stand-in waits this far ahead of the held Talent.
  defangGateFraction: [0.14, 0.28] as const,
  portraitGateGap: [0.16, 0.28] as const,
  gateMarkDistance: 1.4,
  // Loop review 2026-10-13 round 2: after the defang cut she holds her mark this long under an "ACTION" cue (with an exit arrow
  // at her feet) before walking on, so the frame the cut left her at the edge of can be brought back to her (it was 0 s: 100% of
  // Backlot/City LOST HER deaths). Per scene index like zoomRangesByScene: Backlot is the tightest; City and Night keep ≥ 0.6 s.
  gateReleaseSecondsByScene: [0.35, 0.9, 0.9, 0.9] as const,
  wrapLastSceneFraction: 0.25,
  wrapSpeeds: [1.8, 2.2, 2.6] as const,
  threatBudgets: [1, 1.6, 2.3, 2.8] as const,
  chunkSize: 16,
  // Bible M2: every scene has at least this many heading changes of ≥ 90°.
  minimumSharpTurns: 2,
  chunkTemplateCount: 40,
  minimumReelsPerScene: 6,
  sceneLength: [120, 220] as const,
  shootSceneCount: 3,
  finalTakeSeconds: 40,
  performance: { maxEntities: 250, maxTiles: 600, maxDrawCalls: 24, maxTriangles: 60_000, maxSimTickMs: 1 },
};
