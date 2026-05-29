/**
 * Web Worker: runs SVG path processing off the main thread.
 *
 * Receives a shard of paths + config, runs the shared processing engine, and
 * posts progress + the final result back. Multiple instances run in parallel
 * (see worker-pool.js), each handling a contiguous shard of the path list.
 */

import { processPaths } from './processor.js';
import { setCachedFont, setFontBasePath } from '../../../shared/fonts/index.js';

self.onmessage = async (e) => {
  const { paths, config, attractors, attractorConfig, viewBox, font } = e.data;

  try {
    // text-fill mode needs parsed glyph data. The worker cannot parse SVG
    // fonts (no DOMParser), so the main thread hands us the already-parsed
    // font and we inject it into this worker's font cache.
    if (font && font.id && font.data) {
      setFontBasePath('/fonts');
      setCachedFont(font.id, font.data);
    }

    const result = await processPaths(
      paths,
      config,
      attractors || [],
      attractorConfig || null,
      viewBox || null,
      (current, total) => {
        self.postMessage({ type: 'progress', current, total });
      },
      null // cancellation is handled by terminating the worker
    );

    self.postMessage({
      type: 'result',
      paths: result.paths,
      detectedMinLength: result.detectedMinLength,
      detectedMaxLength: result.detectedMaxLength
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
