// The document loads this before Three.js: map transfer and JSON decoding can
// overlap module downloads and renderer initialization. Capture failures here
// and rethrow when main consumes the result, so the normal retry UI owns them.
import { loadSurfaceAsset, surfaceKey } from './surface-assets.js';
import { useStreaming } from './stream-policy.js';
export const params = new URLSearchParams(location.search);
const pathSite = {
  '/': 'mumbai',
  '/mumbai': 'mumbai',
  '/avon': 'avon-extended',
  '/avon-extended': 'avon-extended',
  '/extended': 'avon-extended',
  '/chautauqua': 'chautauqua',
}[(location.pathname.replace(/\/$/, '') || '/')];
const requestedSite = params.get('site')
  || document.querySelector('meta[name="town-site"]')?.content
  || pathSite
  || 'mumbai';
export const siteName = requestedSite === 'avon' ? 'avon-extended' : requestedSite;
export const streamEnabled = useStreaming(params,siteName) && typeof Worker==='function'
  && typeof DecompressionStream==='function' && !!globalThis.crypto?.subtle;
document.getElementById('loading')?.setAttribute('data-loader',streamEnabled?'streaming':'original');
export const streamDirectory = `./data/${encodeURIComponent(siteName)}/stream`;
export const siteRequest = fetch(streamEnabled ? `${streamDirectory}/manifest.json` : `./data/${encodeURIComponent(siteName)}/site.json`)
  .then(async response => {
    if (!response.ok) throw new Error(streamEnabled ? `No prepared streaming map for ${siteName}` : `no site.json for ${siteName}`);
    return response.json();
  })
  .then(async data => {
    const dir = `./data/${encodeURIComponent(siteName)}`;
    if (data.buildings == null) {
      const extra = await fetch(`${dir}/buildings.json`);
      if (!extra.ok) throw new Error(`no buildings.json for ${siteName}`);
      data.buildings = await extra.json();
    }
    if (data.terrain && !data.terrain.values) {
      const extra = await fetch(`${dir}/terrain.json`);
      if (!extra.ok) throw new Error(`no terrain.json for ${siteName}`);
      data.terrain.values = await extra.json();
    }
    return data;
  })
  .then(data => {
    if (streamEnabled) return data;
    const images = new Set();
    function preload(value) {
      if (!value || typeof value !== 'object') return;
      if (typeof value.image === 'string' && value.image && !images.has(value.image)) {
        images.add(value.image);
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.crossOrigin = 'anonymous';
        link.href = value.image;
        document.head.append(link);
      }
      for (const child of Object.values(value)) preload(child);
    }
    for (const building of data.buildings || []) preload(building.blueprint);
    return data;
  })
  .then(data => streamEnabled ? {data:data.map,manifest:data} : { data }, error => ({ error }));

const directory = `./data/${encodeURIComponent(siteName)}`;
const useSurfaces = !streamEnabled && !params.has('procedural') && !params.has('bp') && !params.has('isolate') && !params.has('stage');
let surfaceRequest = useSurfaces ? siteRequest.then(({ data }) => data
  ? loadSurfaceAsset(data, data.seed ?? siteName, directory) : null) : null;

export async function takeSurfaceAsset(data) {
  if (!useSurfaces) return null;
  const request = surfaceRequest;
  surfaceRequest = null;
  const asset = await (request ?? loadSurfaceAsset(data, data.seed ?? siteName, directory));
  return asset && asset.key === await surfaceKey(data, data.seed ?? siteName) ? asset.buffer : null;
}
