interface DebugState { camera: { x: number; zoom: number }; }
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
      lod: () => LodDiagnostics;
    };
  }
}

export {};
