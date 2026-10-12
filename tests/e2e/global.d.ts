interface DebugState { seed: number; tick: number; path: Array<{ x: number; z: number }>; tiles: Array<unknown>; camera: { x: number; zoom: number }; entities: Array<{ kind: string; spawned: boolean; cut: boolean }>; shoot?: { sceneIndex: number; biome: string }; }
interface RenderMetrics { drawCalls: number; triangles: number; }
interface LodDiagnostics { bucketCounts: number[]; tiers: Record<string, number>; visibleRings: number; }

declare global {
  interface Window {
    __cull: {
      state: () => DebugState;
      step: (ticks?: number) => void;
      performance: () => RenderMetrics;
      setTier: (tier: number) => void;
      loadLodDemo: () => void;
      loadShootScene: (sceneIndex: number) => void;
      lod: () => LodDiagnostics;
      setCamera: (x: number, z: number, zoom: number) => void;
    };
  }
}

export {};
