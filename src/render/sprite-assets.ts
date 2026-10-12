import * as THREE from 'three';

export interface SpriteAssets {
  talent: THREE.Texture;
  stagehand: THREE.Texture;
  boulder: THREE.Texture;
  reel: THREE.Texture;
  rumour: THREE.Texture;
  swarmMoth: THREE.Texture;
  monitorTeal: THREE.Texture;
  monitorRed: THREE.Texture;
  glass: THREE.Texture;
  bridge: THREE.Texture;
  continuity: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture];
  urchinTiers: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture];
  extras: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture];
}

const spritePaths = {
  talent: 'talent/idle/01.png',
  stagehand: 'stagehand/idle/01.png',
  boulder: 'boulder/default/01.png',
  reel: 'reel/default/01.png',
  rumour: 'rumour/default/01.png',
  swarmMoth: 'swarm/default/01.png',
  monitorTeal: 'monitor/teal/01.png',
  monitorRed: 'monitor/red/01.png',
  glass: 'glass/floor/01.png',
  bridge: 'bridge/01.png',
  urchinTiers: ['urchin/tiers/01.png', 'urchin/tiers/02.png', 'urchin/tiers/03.png', 'urchin/tiers/04.png'],
  extras: ['extras/costumes/01.png', 'extras/costumes/02.png', 'extras/costumes/03.png', 'extras/costumes/04.png'],
  continuity: ['continuity/props/01.png', 'continuity/props/02.png', 'continuity/props/03.png', 'continuity/props/04.png'],
} as const;

export async function loadSpriteAssets(baseUrl: string): Promise<SpriteAssets> {
  const loader = new THREE.TextureLoader();
  const load = async (path: string) => {
    const texture = await loader.loadAsync(`${baseUrl}assets/sprites/${path}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  const [talent, stagehand, boulder, reel, rumour, swarmMoth, monitorTeal, monitorRed, glass, bridge, ...loaded] = await Promise.all([
    load(spritePaths.talent), load(spritePaths.stagehand), load(spritePaths.boulder), load(spritePaths.reel),
    load(spritePaths.rumour), load(spritePaths.swarmMoth), load(spritePaths.monitorTeal), load(spritePaths.monitorRed),
    load(spritePaths.glass), load(spritePaths.bridge),
    ...spritePaths.urchinTiers.map(load),
    ...spritePaths.extras.map(load),
    ...spritePaths.continuity.map(load),
  ]);
  return {
    talent: talent!, stagehand: stagehand!, boulder: boulder!, reel: reel!,
    rumour: rumour!, swarmMoth: swarmMoth!, monitorTeal: monitorTeal!, monitorRed: monitorRed!,
    glass: glass!, bridge: bridge!,
    urchinTiers: loaded.slice(0, 4) as SpriteAssets['urchinTiers'],
    extras: loaded.slice(4, 8) as SpriteAssets['extras'],
    continuity: loaded.slice(8, 12) as SpriteAssets['continuity'],
  };
}
