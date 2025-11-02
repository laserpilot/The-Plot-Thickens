/**
 * Progress panel UI component
 * Shows processing status and progress for backend jobs
 */

import { store } from '../state/store.js';
import { submitJob, startPolling, downloadResult, cancelJob } from '../utils/api-client.js';
import { showProgress as showGlobalProgress, updateProgress as updateGlobalProgress, hideProgress as hideGlobalProgress, showComplete as showGlobalComplete } from '../utils/global-progress.js';

/**
 * Initialize progress panel
 */
export function initProgressPanel() {
  const btnExportServer = document.getElementById('btn-export-server');
  const progressPanel = document.getElementById('progress-panel');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const btnProgressAction = document.getElementById('btn-progress-action');

  if (!btnExportServer || !progressPanel || !progressBar || !progressText || !btnProgressAction) {
    console.warn('[Progress Panel] Required elements not found');
    return;
  }

  // Export (Server) button handler
  btnExportServer.addEventListener('click', async () => {
    try {
      const state = store.getState();

      // Validation - check originalPaths (loaded SVG) not paths
      if (!state.originalPaths || state.originalPaths.length === 0) {
        alert('No SVG loaded. Please load an SVG file first.');
        return;
      }

      // Show progress panel
      progressPanel.classList.remove('hidden');
      progressPanel.classList.add('visible');
      progressBar.style.width = '0%';
      progressText.textContent = 'Submitting job...';
      btnProgressAction.textContent = 'Cancel';
      btnProgressAction.classList.remove('download');
      btnProgressAction.classList.add('cancel');
      btnProgressAction.disabled = false;

      // Prepare job data - use originalPaths for backend processing
      const svgData = {
        paths: state.originalPaths,
        viewBox: state.svgBounds,
        originalFilename: state.originalFilename || 'processed.svg'
      };

      const config = {
        ...state.config,
        fillMode: state.config.fillMode,
        focusBlur: state.focusBlur,
        hatchGradient: state.hatchGradient
      };

      const attractors = state.attractorConfig?.attractors || [];
      const attractorConfig = state.attractorConfig || null;
      const viewBox = state.svgBounds;

      // Submit job
      const jobId = await submitJob(svgData, config, attractors, attractorConfig, viewBox);
      console.log(`[Progress Panel] Submitted job: ${jobId}`);

      // Store job ID for cancel button
      let currentJobId = jobId;
      let stopPolling = null;

      // Show initial global progress
      showGlobalProgress('Processing on server...', 0);

      // Progress callback
      const onProgress = (status) => {
        const { progress } = status;
        progressBar.style.width = `${progress.percent}%`;
        progressText.textContent = `Processing ${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} paths (${progress.percent.toFixed(1)}%)`;

        // Update global progress too
        updateGlobalProgress(
          `Server: ${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} paths`,
          progress.percent
        );
      };

      // Complete callback
      const onComplete = (status) => {
        progressBar.style.width = '100%';
        progressText.textContent = 'Processing complete! Ready to download.';
        btnProgressAction.textContent = 'Download SVG';
        btnProgressAction.classList.remove('cancel');
        btnProgressAction.classList.add('download');
        btnProgressAction.disabled = false;

        // Show global completion
        showGlobalComplete('Server processing complete');

        // Update button to download
        btnProgressAction.onclick = async () => {
          try {
            btnProgressAction.disabled = true;
            btnProgressAction.textContent = 'Downloading...';
            await downloadResult(currentJobId);
            btnProgressAction.textContent = 'Downloaded!';

            // Hide panel after 2 seconds
            setTimeout(() => {
              progressPanel.classList.remove('visible');
              progressPanel.classList.add('hidden');
            }, 2000);
          } catch (error) {
            console.error('[Progress Panel] Download failed:', error);
            progressText.textContent = `Download failed: ${error.message}`;
            btnProgressAction.disabled = false;
            btnProgressAction.textContent = 'Retry Download';
          }
        };
      };

      // Error callback
      const onError = (error) => {
        console.error('[Progress Panel] Job failed:', error);
        progressText.textContent = `Error: ${error.message}`;
        progressBar.style.width = '0%';
        progressBar.classList.add('error');
        btnProgressAction.textContent = 'Close';
        btnProgressAction.classList.remove('cancel', 'download');

        // Hide global progress on error
        hideGlobalProgress();

        btnProgressAction.onclick = () => {
          progressPanel.classList.remove('visible');
          progressPanel.classList.add('hidden');
          progressBar.classList.remove('error');
        };
      };

      // Start polling
      stopPolling = startPolling(jobId, onProgress, onComplete, onError);

      // Cancel button handler
      btnProgressAction.onclick = async () => {
        if (btnProgressAction.classList.contains('cancel')) {
          try {
            btnProgressAction.disabled = true;
            btnProgressAction.textContent = 'Cancelling...';

            // Stop polling
            if (stopPolling) {
              stopPolling();
            }

            // Cancel job
            await cancelJob(currentJobId);

            progressText.textContent = 'Job cancelled';
            progressBar.style.width = '0%';

            // Hide panel after 1 second
            setTimeout(() => {
              progressPanel.classList.remove('visible');
              progressPanel.classList.add('hidden');
            }, 1000);
          } catch (error) {
            console.error('[Progress Panel] Cancel failed:', error);
            progressText.textContent = `Cancel failed: ${error.message}`;
            btnProgressAction.disabled = false;
            btnProgressAction.textContent = 'Cancel';
          }
        }
      };

    } catch (error) {
      console.error('[Progress Panel] Job submission failed:', error);
      alert(`Failed to submit job: ${error.message}\n\nMake sure the backend server is running on port 3003.`);
      progressPanel.classList.remove('visible');
      progressPanel.classList.add('hidden');
    }
  });
}
