const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const FormData = require('form-data');
const fetch = require('node-fetch');

/**
 * Audio Recording Service
 * Handles chunked audio recording with metadata tracking and backend upload
 */
class AudioRecordingService {
  constructor(capturesPath, apiBaseUrl = null) {
    this.capturesPath = capturesPath;
    this.activeRecordings = new Map(); // recordingId -> metadata
    this.recordingsMetadataFile = path.join(capturesPath, '.recordings-metadata.json');
    this.bearerToken = null;
    this.apiBaseUrl = apiBaseUrl || 'https://dev.quelo.tech';
    this.sessionIdGetter = null; // Function to get current session ID
  }

  setBearerToken(token) {
    this.bearerToken = token;
  }

  setApiBaseUrl(url) {
    this.apiBaseUrl = url;
  }

  /**
   * Set the session ID getter function
   */
  setSessionIdGetter(getterFn) {
    this.sessionIdGetter = getterFn;
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    if (this.sessionIdGetter && typeof this.sessionIdGetter === 'function') {
      return this.sessionIdGetter();
    }
    return null;
  }

  /**
   * Initialize a new recording session
   * @param {string} recordingId - Unique identifier for the recording
   * @param {object} options - Recording options (title, mimeType)
   * @returns {object} Recording metadata
   */
  async startRecording(recordingId, options = {}) {
    console.log(`[AudioRecording] START - recordingId: ${recordingId}, options:`, options);
    
    const metadata = {
      recordingId,
      title: options.title || `Recording ${new Date().toLocaleString()}`,
      mimeType: options.mimeType || 'audio/webm',
      status: 'recording',
      chunks: [],
      totalDuration: 0,
      totalSize: 0,
      sessionStarted: new Date().toISOString(),
      lastChunkTime: new Date().toISOString()
    };

    this.activeRecordings.set(recordingId, metadata);
    
    // Create recording directory
    const recordingDir = path.join(this.capturesPath, 'recordings', recordingId);
    await fs.mkdir(recordingDir, { recursive: true });

    console.log(`[AudioRecording] Recording started successfully - Dir: ${recordingDir}`);
    return metadata;
  }

  /**
   * Save an audio chunk
   * @param {string} recordingId - Recording identifier
   * @param {Buffer} chunkData - Audio chunk data
   * @param {number} chunkNumber - Chunk sequence number
   * @returns {object} Chunk save result
   */
  async saveChunk(recordingId, chunkData, chunkNumber) {
    console.log(`[AudioRecording] SAVE CHUNK - ID: ${recordingId}, Chunk #${chunkNumber}, Size: ${chunkData.length} bytes`);
    
    try {
      const metadata = this.activeRecordings.get(recordingId);
      if (!metadata) {
        console.error(`[AudioRecording] Recording not found: ${recordingId}`);
        throw new Error(`Recording ${recordingId} not found or not active`);
      }

      const recordingDir = path.join(this.capturesPath, 'recordings', recordingId);
      const ext = this.getExtensionFromMimeType(metadata.mimeType);
      const chunkFileName = `chunk-${String(chunkNumber).padStart(4, '0')}${ext}`;
      const chunkPath = path.join(recordingDir, chunkFileName);

      // Save locally first
      await fs.writeFile(chunkPath, chunkData);

      const chunkInfo = {
        chunkNumber,
        fileName: chunkFileName,
        path: chunkPath,
        size: chunkData.length,
        timestamp: new Date().toISOString()
      };
      
      metadata.chunks.push(chunkInfo);
      metadata.totalSize += chunkData.length;
      metadata.lastChunkTime = new Date().toISOString();

      console.log(`[AudioRecording] Chunk saved locally ✓ Total chunks: ${metadata.chunks.length}, Total size: ${metadata.totalSize} bytes`);
      
      // Upload to backend
      const uploadSuccess = await this.uploadChunkToBackend(recordingId, chunkData, chunkNumber, metadata);
      
      if (uploadSuccess) {
        console.log(`[AudioRecording] Chunk ${chunkNumber} uploaded to backend ✓`);
        chunkInfo.uploadedToBackend = true;
      } else {
        console.warn(`[AudioRecording] Chunk ${chunkNumber} failed to upload to backend (saved locally)`);
        chunkInfo.uploadedToBackend = false;
      }
      
      return {
        success: true,
        chunkNumber,
        chunkPath,
        totalChunks: metadata.chunks.length,
        uploadedToBackend: uploadSuccess
      };
    } catch (error) {
      console.error(`[AudioRecording] CHUNK ERROR:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload chunk to backend API
   * @param {string} recordingId - Recording identifier
   * @param {Buffer} chunkData - Audio chunk data
   * @param {number} chunkNumber - Chunk sequence number
   * @param {object} metadata - Recording metadata
   * @returns {boolean} Upload success
   */
  async uploadChunkToBackend(recordingId, chunkData, chunkNumber, metadata) {
    try {
      if (!this.bearerToken) {
        console.warn('[AudioRecording] No auth token, skipping backend upload');
        return false;
      }

      const token = this.bearerToken;

      // Session ID is required
      const sessionId = this.getSessionId();
      if (!sessionId) {
        console.error('[AudioRecording] sessionId is required but not available');
        throw new Error('Session ID is required for chunk upload');
      }

      const formData = new FormData();
      formData.append('audioChunk', chunkData, {
        filename: `chunk-${chunkNumber}${this.getExtensionFromMimeType(metadata.mimeType)}`,
        contentType: metadata.mimeType
      });
      formData.append('recordingId', recordingId);
      formData.append('chunkNumber', chunkNumber.toString());
      formData.append('mimeType', metadata.mimeType);
      formData.append('title', metadata.title);
      formData.append('sessionId', sessionId);
      
      console.log(`[AudioRecording] Including sessionId in chunk upload: ${sessionId}`);

      const url = `${this.apiBaseUrl}/api/recordings/chunk`;
      console.log(`[AudioRecording] Uploading chunk to: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AudioRecording] Upload failed: ${response.status} - ${errorText}`);
        return false;
      }

      const result = await response.json();
      console.log(`[AudioRecording] Backend response:`, result);
      return result.success === true;
    } catch (error) {
      console.error('[AudioRecording] Upload to backend failed:', error);
      return false;
    }
  }

  /**
   * Stop recording and finalize on backend
   * @param {string} recordingId - Recording identifier
   * @param {number} totalDuration - Total recording duration in seconds
   * @returns {object} Final recording result
   */
  async stopRecording(recordingId, totalDuration = 0) {
    console.log(`[AudioRecording] STOP - ID: ${recordingId}, Duration: ${totalDuration}s`);
    
    try {
      const metadata = this.activeRecordings.get(recordingId);
      if (!metadata) {
        console.error(`[AudioRecording] Recording not found: ${recordingId}`);
        throw new Error(`Recording ${recordingId} not found`);
      }

      metadata.status = 'completed';
      metadata.totalDuration = totalDuration;
      metadata.completedAt = new Date().toISOString();

      // Save metadata to disk for persistence
      await this.saveRecordingMetadata(metadata);

      // Remove from active recordings
      this.activeRecordings.delete(recordingId);

      console.log(`[AudioRecording] ✓ Recording stopped: ${metadata.chunks.length} chunks, ${metadata.totalSize} bytes, ${totalDuration}s`);
      
      // Notify backend that recording is complete (backend will concatenate)
      await this.finalizeRecordingOnBackend(recordingId, metadata);
      
      return {
        success: true,
        recordingId,
        totalChunks: metadata.chunks.length,
        totalSize: metadata.totalSize,
        totalDuration: metadata.totalDuration,
        message: 'Recording uploaded to backend. Will be processed in ~10 minutes.'
      };
    } catch (error) {
      console.error(`[AudioRecording] ✗ STOP ERROR:`, error);
      
      // Update status to failed
      const metadata = this.activeRecordings.get(recordingId);
      if (metadata) {
        metadata.status = 'failed';
        metadata.error = error.message;
        await this.saveRecordingMetadata(metadata);
        this.activeRecordings.delete(recordingId);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cancel an ongoing recording
   * @param {string} recordingId - Recording identifier
   */
  async cancelRecording(recordingId) {
    try {
      const metadata = this.activeRecordings.get(recordingId);
      if (!metadata) {
        return { success: false, error: 'Recording not found' };
      }

      metadata.status = 'cancelled';
      
      // Clean up all chunks
      const recordingDir = path.join(this.capturesPath, 'recordings', recordingId);
      for (const chunk of metadata.chunks) {
        try {
          await fs.unlink(chunk.path);
        } catch (err) {
          console.warn(`[AudioRecording] Could not delete chunk:`, err.message);
        }
      }

      // Remove directory
      try {
        await fs.rmdir(recordingDir);
      } catch (err) {
        // Directory might not be empty, that's ok
      }

      this.activeRecordings.delete(recordingId);
      console.log(`[AudioRecording] Cancelled recording: ${recordingId}`);

      return { success: true };
    } catch (error) {
      console.error(`[AudioRecording] Error cancelling recording:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all recordings (completed)
   * @returns {array} List of recording metadata
   */
  async getAllRecordings() {
    try {
      const metadataPath = this.recordingsMetadataFile;
      const exists = await fs.access(metadataPath).then(() => true).catch(() => false);
      
      if (!exists) {
        return [];
      }

      const data = await fs.readFile(metadataPath, 'utf8');
      const allRecordings = JSON.parse(data);
      console.log(`[AudioRecording] Retrieved ${allRecordings.length} recordings from metadata`);
      // Return only completed recordings, sorted by date (newest first)
      return allRecordings
        .filter(r => r.status === 'completed')
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    } catch (error) {
      console.error('[AudioRecording] Error getting recordings:', error);
      return [];
    }
  }

  /**
   * Fetch recordings from backend API
   * @param {object} options - Query options (limit, offset, status)
   * @returns {Promise<object>} - List of recordings and total count
   */
  async fetchRecordingsFromBackend(options = {}) {
    try {
      if (!this.bearerToken) {
        console.warn('[AudioRecording] No auth token, cannot fetch from backend');
        return { success: false, recordings: [], total: 0 };
      }

      const token = this.bearerToken;

      const queryParams = new URLSearchParams();
      if (options.status) queryParams.append('status', options.status);
      if (options.limit) queryParams.append('limit', options.limit);
      if (options.offset) queryParams.append('offset', options.offset);

      const url = `${this.apiBaseUrl}/api/recordings?${queryParams.toString()}`;
      console.log(`[AudioRecording] Fetching recordings from backend: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AudioRecording] Fetch failed: ${response.status} - ${errorText}`);
        return { success: false, recordings: [], total: 0 };
      }

      const result = await response.json();
      console.log(`[AudioRecording] Fetched ${result.recordings?.length || 0} recordings from backend`);

      return {
        success: true,
        recordings: result.recordings || [],
        total: result.total || 0
      };
    } catch (error) {
      console.error('[AudioRecording] Error fetching recordings from backend:', error);
      return { success: false, recordings: [], total: 0, error: error.message };
    }
  }

  /**
   * Get recording metadata by ID
   * @param {string} recordingId - Recording identifier
   * @returns {object|null} Recording metadata
   */
  async getRecording(recordingId) {
    // Check active recordings first
    if (this.activeRecordings.has(recordingId)) {
      return this.activeRecordings.get(recordingId);
    }

    // Check saved recordings
    const recordings = await this.getAllRecordings();
    return recordings.find(r => r.recordingId === recordingId) || null;
  }

  /**
   * Delete a recording
   * @param {string} recordingId - Recording identifier
   */
  async deleteRecording(recordingId) {
    try {
      const recordings = await this.getAllRecordings();
      const recording = recordings.find(r => r.recordingId === recordingId);
      
      if (!recording) {
        return { success: false, error: 'Recording not found' };
      }

      // Delete the file
      if (recording.finalPath) {
        await fs.unlink(recording.finalPath);
      }

      // Update metadata file
      const updatedRecordings = recordings.filter(r => r.recordingId !== recordingId);
      await fs.writeFile(
        this.recordingsMetadataFile,
        JSON.stringify(updatedRecordings, null, 2),
        'utf8'
      );

      console.log(`[AudioRecording] Deleted recording: ${recordingId}`);
      return { success: true };
    } catch (error) {
      console.error('[AudioRecording] Error deleting recording:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save recording metadata to disk
   * @param {object} metadata - Recording metadata
   */
  async saveRecordingMetadata(metadata) {
    try {
      const metadataPath = this.recordingsMetadataFile;
      let allRecordings = [];

      // Read existing metadata
      const exists = await fs.access(metadataPath).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(metadataPath, 'utf8');
        allRecordings = JSON.parse(data);
      }

      // Add or update this recording
      const index = allRecordings.findIndex(r => r.recordingId === metadata.recordingId);
      if (index >= 0) {
        allRecordings[index] = metadata;
      } else {
        allRecordings.push(metadata);
      }

      // Save back to disk
      await fs.writeFile(
        metadataPath,
        JSON.stringify(allRecordings, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[AudioRecording] Error saving metadata:', error);
    }
  }

  /**
   * Get file extension from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} File extension
   */
  getExtensionFromMimeType(mimeType) {
    const mimeMap = {
      'audio/webm': '.webm',
      'audio/webm;codecs=opus': '.webm',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg'
    };
    return mimeMap[mimeType] || '.webm';
  }

  /**
   * Finalize recording on backend (notify that all chunks are uploaded)
   * @param {string} recordingId - Recording identifier
   * @param {object} metadata - Recording metadata
   */
  async finalizeRecordingOnBackend(recordingId, metadata) {
    try {
      if (!this.bearerToken) {
        console.warn('[AudioRecording] No auth token, skipping backend finalization');
        return;
      }

      const token = this.bearerToken;

      const url = `${this.apiBaseUrl}/api/recordings/finalize`;
      console.log(`[AudioRecording] Finalizing recording on backend: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recordingId,
          totalChunks: metadata.chunks.length,
          totalDuration: metadata.totalDuration,
          totalSize: metadata.totalSize,
          title: metadata.title,
          mimeType: metadata.mimeType
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AudioRecording] Finalization failed: ${response.status} - ${errorText}`);
        return;
      }

      const result = await response.json();
      console.log(`[AudioRecording] Backend finalization result:`, result);
    } catch (error) {
      console.error('[AudioRecording] Finalization on backend failed:', error);
    }
  }

  /**
   * Get active recordings count
   * @returns {number} Number of active recordings
   */
  getActiveRecordingsCount() {
    return this.activeRecordings.size;
  }

  /**
   * Clean up any stale recordings (in case of crash)
   */
  async cleanupStaleRecordings() {
    const recordingsDir = path.join(this.capturesPath, 'recordings');
    
    try {
      const exists = await fs.access(recordingsDir).then(() => true).catch(() => false);
      if (!exists) return;

      const dirs = await fs.readdir(recordingsDir);
      
      for (const dir of dirs) {
        const dirPath = path.join(recordingsDir, dir);
        const stats = await fs.stat(dirPath);
        
        if (stats.isDirectory()) {
          // Check if this recording is older than 1 hour and not in active recordings
          const ageMs = Date.now() - stats.mtimeMs;
          const oneHourMs = 60 * 60 * 1000;
          
          if (ageMs > oneHourMs && !this.activeRecordings.has(dir)) {
            console.log(`[AudioRecording] Cleaning up stale recording: ${dir}`);
            
            // Delete all files in directory
            const files = await fs.readdir(dirPath);
            for (const file of files) {
              await fs.unlink(path.join(dirPath, file));
            }
            
            // Remove directory
            await fs.rmdir(dirPath);
          }
        }
      }
    } catch (error) {
      console.error('[AudioRecording] Error cleaning up stale recordings:', error);
    }
  }
}

module.exports = AudioRecordingService;
