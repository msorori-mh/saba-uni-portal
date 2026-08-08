import manifestData from './release-manifest.json' with { type: 'json' };
import type { ReleaseManifest } from './types.ts';

export const RELEASE_MANIFEST: ReleaseManifest = manifestData as ReleaseManifest;

export function getManifest(): ReleaseManifest {
  return RELEASE_MANIFEST;
}
