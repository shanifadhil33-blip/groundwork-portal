export type LandingCapabilities = {
  reducedMotion: boolean; smallScreen: boolean; coarsePointer: boolean;
  hardwareConcurrency?: number; deviceMemory?: number; saveData?: boolean; webgl: boolean;
};
export function shouldUse3D(c: LandingCapabilities): boolean {
  return c.webgl && !c.reducedMotion && !c.smallScreen && !c.coarsePointer && !c.saveData
    && (c.hardwareConcurrency === undefined || c.hardwareConcurrency > 4)
    && (c.deviceMemory === undefined || c.deviceMemory > 4);
}
