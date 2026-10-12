interface DebugState { seed: number; tick: number; path: Array<{ x: number; z: number }>; tiles: Array<unknown>; camera: { x: number; zoom: number }; entities: Array<{ kind: string; spawned: boolean; cut: boolean }>; shoot?: { sceneIndex: number; biome: string }; }
interface RenderMetrics { drawCalls: number; triangles: number; }
interface LodDiagnostics { bucketCounts: number[]; tiers: Record<string, number>; visibleRings: number; }
interface DebugDiagnostics { paused: boolean; keys: string[]; hidden: boolean; focused: boolean; dprTier: number; pointerPan: { panX: number; panZ: number } | null; }

declare global {
  interface Window {
    __cull: {
      state: () => DebugState;
      hash: () => string;
      diagnostics: () => DebugDiagnostics;
      step: (ticks?: number) => void;
      input: (frame: { panX: number; panZ: number; zoom: number; rotate: -1 | 0 | 1; hold: boolean; steady: boolean }) => void;
      performance: () => RenderMetrics;
      setTier: (tier: number) => void;
      loadLodDemo: () => void;
      loadShootScene: (sceneIndex: number) => void;
      finishForShare: () => void;
      lod: () => LodDiagnostics;
      setCamera: (x: number, z: number, zoom: number) => void;
    };
  }
}

export {};
