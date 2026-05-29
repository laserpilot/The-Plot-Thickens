/**
 * Web Worker pool for SVG path processing.
 *
 * Path processing is embarrassingly parallel — each path is independent — so we
 * split the path list into contiguous shards and process them across a pool of
 * workers (one per CPU core, capped). This keeps the main thread fully
 * responsive and uses all available cores for speed.
 */

import { getCachedFont, loadFont, setFontBasePath } from '../../../shared/fonts/index.js';

const SMALL_JOB_THRESHOLD = 200; // below this, a single worker is faster than spawning a pool
const MAX_WORKERS = 8;

/**
 * Process paths across a pool of workers.
 * @param {Array} paths - Path objects (each carries a `length` from the loader)
 * @param {Object} config - Processing config
 * @param {Array} attractors
 * @param {Object} attractorConfig
 * @param {Object} viewBox
 * @param {Function} onProgress - (current, total) => void, aggregated across workers
 * @returns {{promise: Promise<{paths, detectedMinLength, detectedMaxLength}>, cancel: Function}}
 */
export function processInWorkerPool(paths, config, attractors = [], attractorConfig = null, viewBox = null, onProgress = null) {
  const workers = [];
  let cancelled = false;
  let rejectFn = null;

  function cleanup() {
    workers.forEach(w => { try { w.terminate(); } catch (_) { /* ignore */ } });
    workers.length = 0;
  }

  function cancel() {
    cancelled = true;
    cleanup();
    if (rejectFn) rejectFn(new DOMException('Processing cancelled', 'AbortError'));
  }

  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;

    (async () => {
      try {
        // Preparing phase: font parsing + length-range calculation happen before
        // any path is processed, so tell the UI what's going on.
        if (onProgress) onProgress(0, paths.length, { phase: 'preparing' });

        // For text-fill, resolve parsed glyph data on the main thread (workers
        // have no DOMParser) and pass it to each worker.
        let font = null;
        if (config.fillMode === 'text-fill') {
          const fontId = config.textFillFont || 'hershey-sans';
          let data = getCachedFont(fontId);
          if (!data) {
            setFontBasePath('/fonts');
            try { data = await loadFont(fontId); } catch (_) { data = null; }
          }
          if (data) font = { id: fontId, data };
        }
        if (cancelled) return;

        // Global length range, computed cheaply from loader-provided lengths so
        // every worker uses the same range for length-based pass weighting.
        // Respect any manual override already in config.
        // Note: compute min/max with a loop, NOT Math.min(...lengths) — spreading
        // a large array as arguments overflows the call stack on heavy SVGs.
        let minLen = Infinity;
        let maxLen = -Infinity;
        let lengthCount = 0;
        for (const p of paths) {
          const l = p.length;
          if (typeof l === 'number' && l > 0) {
            if (l < minLen) minLen = l;
            if (l > maxLen) maxLen = l;
            lengthCount++;
          }
        }
        const shardConfig = { ...config };
        if (lengthCount > 0) {
          shardConfig.minLength = (config.minLength && config.minLength > 0) ? config.minLength : minLen;
          shardConfig.maxLength = (config.maxLength && config.maxLength > 0) ? config.maxLength : maxLen;
        }

        // Shard the path list contiguously (preserves overall path order).
        const poolSize = paths.length < SMALL_JOB_THRESHOLD
          ? 1
          : Math.min(navigator.hardwareConcurrency || 4, MAX_WORKERS, paths.length);
        const shardSize = Math.ceil(paths.length / poolSize);
        const shards = [];
        for (let start = 0; start < paths.length; start += shardSize) {
          shards.push(paths.slice(start, start + shardSize));
        }

        const total = paths.length;
        const results = new Array(shards.length);
        const progressByShard = new Array(shards.length).fill(0);
        let done = 0;

        const emitProgress = () => {
          if (!onProgress) return;
          const current = progressByShard.reduce((a, b) => a + b, 0);
          onProgress(current, total, {
            phase: 'processing',
            activeWorkers: shards.length - done,
            totalWorkers: shards.length
          });
        };

        shards.forEach((shard, idx) => {
          const worker = new Worker(new URL('./processing.worker.js', import.meta.url), { type: 'module' });
          workers.push(worker);

          worker.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'progress') {
              progressByShard[idx] = msg.current;
              emitProgress();
            } else if (msg.type === 'result') {
              results[idx] = msg.paths;
              progressByShard[idx] = shard.length;
              done++;
              emitProgress();
              try { worker.terminate(); } catch (_) { /* ignore */ }
              if (done === shards.length && !cancelled) {
                resolve({
                  paths: results.flat(),
                  detectedMinLength: shardConfig.minLength,
                  detectedMaxLength: shardConfig.maxLength
                });
              }
            } else if (msg.type === 'error') {
              cleanup();
              reject(new Error(msg.message));
            }
          };

          worker.onerror = (err) => {
            cleanup();
            reject(new Error(err && err.message ? err.message : 'Worker error'));
          };

          worker.postMessage({
            paths: shard,
            config: shardConfig,
            attractors,
            attractorConfig,
            viewBox,
            font
          });
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    })();
  });

  return { promise, cancel };
}
