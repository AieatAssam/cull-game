export interface GradeMetrics {
  thirdsPercent: number;
  smoothness: number;
  closeCalls: number;
  reelsCollected: number;
  reelsAvailable: number;
}

export function gradeMetrics(metrics: GradeMetrics): 'S' | 'A' | 'B' | 'C' {
  const coverage = metrics.reelsAvailable > 0 ? Math.min(100, metrics.reelsCollected / metrics.reelsAvailable * 100) : 0;
  const closeCallScore = Math.min(100, metrics.closeCalls * 10);
  const overall = (metrics.thirdsPercent + metrics.smoothness + closeCallScore + coverage) / 4;
  return overall >= 90 ? 'S' : overall >= 75 ? 'A' : overall >= 60 ? 'B' : 'C';
}

export function thirdsDistance(x: number, z: number, cameraX: number, cameraZ: number, zoom: number, yaw: number): number {
  const dx = x - cameraX;
  const dz = z - cameraZ;
  const localX = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const localZ = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  const nx = localX / zoom;
  const nz = localZ / zoom;
  let nearest = Number.POSITIVE_INFINITY;
  for (const tx of [-1 / 6, 1 / 6]) for (const tz of [-1 / 6, 1 / 6]) {
    nearest = Math.min(nearest, Math.hypot(nx - tx, nz - tz));
  }
  return nearest;
}

export function smoothnessFromMeanJerk(meanJerk: number): number {
  return Math.max(0, Math.min(100, 100 / (1 + Math.max(0, meanJerk) * 8)));
}
