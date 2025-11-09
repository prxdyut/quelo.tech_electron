const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const PART_SIZE = config.UPLOAD.PART_SIZE;
const API_BASE = config.API.BASE_URL;

class UploadService {
  constructor() {
    this.bearerToken = null;
    this.activeUploads = new Map();
    this.preprocessJobs = new Map();
    this.sessionIdGetter = null; // Function to get current session ID
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
   * Set the bearer token for API authentication
   */
  setBearerToken(token) {
    this.bearerToken = token;
  }

  /**
   * Get the current token
   */
  async getLatestToken() {
    if (this.bearerToken) {
      console.log('UploadService: Using token');
      return this.bearerToken;
    }

    console.error('UploadService: No token available - user must sign in');
    return null;
  }
  /**
   * Get authorization headers
   */
  async getAuthHeaders(additionalHeaders = {}) {
    const headers = {
      ...additionalHeaders
    };

    // Ensure we have the latest token
    const token = await this.getLatestToken();
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    } else {
      console.error('UploadService: Cannot create auth headers - no token available');
      throw new Error('Authentication required. Please sign in to upload files.');
    }

    return headers;
  }

  /**
   * Initialize multipart upload
   */
  async initializeUpload(fileName, fileType) {
    try {
      const headers = await this.getAuthHeaders({
        'content-type': 'application/json'
      });
      console.log(headers)

      const sessionId = this.getSessionId();
      if (!sessionId) {
        console.error('UploadService: sessionId is required but not available');
        throw new Error('Session ID is required for upload initialization');
      }

      const body = { fileName, fileType, sessionId };
      console.log(`UploadService: Including sessionId in init: ${sessionId}`);

      console.log(`UploadService: Initializing upload for ${fileName}`);
      const response = await fetch(`${API_BASE}/api/upload/multipart/init`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `Failed to initialize upload: ${response.statusText}`;
        console.error(`UploadService: Initialize upload failed - ${errorMessage}`);
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log(`UploadService: Upload initialized successfully for ${fileName}`);
      return result;
    } catch (error) {
      if (error.message.includes('Authentication required')) {
        throw error; // Re-throw authentication errors as-is
      }
      console.error('UploadService: Error during upload initialization:', error);
      throw new Error(`Failed to initialize upload: ${error.message}`);
    }
  }

  /**
   * Get presigned URL for uploading a part
   */
  async getPresignedUrl(key, uploadId, partNumber) {
    const headers = await this.getAuthHeaders({
      'content-type': 'application/json'
    });

    const response = await fetch(`${API_BASE}/api/upload/multipart/presigned-url`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ key, uploadId, partNumber })
    });

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload a single part
   */
  async uploadPart(filePath, uploadId, key, partNumber, startByte, endByte, onProgress) {
    const { presignedUrl } = await this.getPresignedUrl(key, uploadId, partNumber);
    
    // Read the chunk from file
    const fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.allocUnsafe(endByte - startByte);
    
    try {
      await fileHandle.read(buffer, 0, buffer.length, startByte);
      
      // Upload to S3
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: buffer,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': buffer.length.toString()
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Part ${partNumber} upload failed: ${uploadResponse.statusText}`);
      }

      const etag = uploadResponse.headers.get('etag') || uploadResponse.headers.get('ETag') || '';
      
      if (onProgress) {
        onProgress(partNumber, buffer.length);
      }

      return {
        partNumber,
        etag: etag.replace(/"/g, '')
      };
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Complete multipart upload
   */
  async completeUpload(uploadId, key, parts) {
    const headers = await this.getAuthHeaders({
      'content-type': 'application/json'
    });

    const sessionId = this.getSessionId();
    if (!sessionId) {
      console.error('UploadService: sessionId is required but not available');
      throw new Error('Session ID is required to complete upload');
    }

    const body = { uploadId, key, parts, sessionId };
    console.log(`UploadService: Including sessionId in complete: ${sessionId}`);

    const response = await fetch(`${API_BASE}/api/upload/multipart/complete`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to complete upload: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Abort multipart upload
   */
  async abortUpload(uploadId, key) {
    try {
      const headers = await this.getAuthHeaders({
        'content-type': 'application/json'
      });

      const response = await fetch(`${API_BASE}/api/upload/multipart/abort`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ uploadId, key })
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to abort upload:', error);
      return false;
    }
  }

  /**
   * Start preprocessing job
   */
  async startPreprocessing(s3Key, fileName, fileSize, mimeType) {
    const headers = await this.getAuthHeaders({
      'content-type': 'application/json'
    });

    const sessionId = this.getSessionId();
    if (!sessionId) {
      console.error('UploadService: sessionId is required but not available');
      throw new Error('Session ID is required to start preprocessing');
    }

    const body = {
      key: s3Key,
      originalFileName: fileName,
      fileSize,
      mimeType,
      sessionId
    };
    console.log(`UploadService: Including sessionId in preprocess: ${sessionId}`);

    const response = await fetch(`${API_BASE}/api/upload/preprocess?fromElectron=true`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to start preprocessing: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check preprocessing job status
   */
  async checkJobStatus(jobId) {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${API_BASE}/api/upload/preprocess/${jobId}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Failed to check job status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get list of locally synced files from server
   */
  async getLocalSyncedFiles() {
    try {
      const headers = await this.getAuthHeaders();

      console.log('UploadService: Fetching locally synced files from server');
      const response = await fetch(`${API_BASE}/api/notes/local-sync`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch synced files: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`UploadService: Found ${data.total} synced files on server`);
      return data;
    } catch (error) {
      console.error('UploadService: Failed to fetch synced files:', error);
      throw error;
    }
  }

  /**
   * Delete a note from server
   */
  async deleteNote(noteId) {
    try {
      const headers = await this.getAuthHeaders();

      console.log(`UploadService: Deleting note ${noteId} from server`);
      const response = await fetch(`${API_BASE}/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to delete note: ${response.statusText}`);
      }

      console.log(`UploadService: Successfully deleted note ${noteId}`);
      return { success: true, noteId };
    } catch (error) {
      console.error(`UploadService: Failed to delete note ${noteId}:`, error);
      throw error;
    }
  }

  /**
   * Main upload function with progress tracking
   */
  async uploadFile(filePath, onProgress, onStatusChange) {
    const uploadId = crypto.randomUUID();
    this.activeUploads.set(uploadId, { cancelled: false });

    try {
      const stats = await fs.promises.stat(filePath);
      const fileName = path.basename(filePath);
      const mimeType = this.getMimeType(filePath);

      // Update status
      if (onStatusChange) {
        onStatusChange({
          status: 'initializing',
          message: 'Initializing upload...',
          uploadProgress: 0
        });
      }

      // Initialize upload
      const { uploadId: s3UploadId, key } = await this.initializeUpload(fileName, mimeType);
      
      // Calculate parts
      const numParts = Math.ceil(stats.size / PART_SIZE);
      const uploadedParts = [];
      let uploadedBytes = 0;

      // Upload parts
      for (let i = 0; i < numParts; i++) {
        // Check if cancelled
        const uploadState = this.activeUploads.get(uploadId);
        if (uploadState && uploadState.cancelled) {
          await this.abortUpload(s3UploadId, key);
          throw new Error('Upload cancelled by user');
        }

        const startByte = i * PART_SIZE;
        const endByte = Math.min((i + 1) * PART_SIZE, stats.size);
        const partNumber = i + 1;

        if (onStatusChange) {
          onStatusChange({
            status: 'uploading',
            message: `Uploading part ${partNumber} of ${numParts}...`,
            uploadProgress: Math.round((uploadedBytes / stats.size) * 100),
            currentPart: partNumber,
            totalParts: numParts
          });
        }

        const part = await this.uploadPart(
          filePath,
          s3UploadId,
          key,
          partNumber,
          startByte,
          endByte,
          (partNum, bytesUploaded) => {
            uploadedBytes += bytesUploaded;
            if (onProgress) {
              onProgress({
                uploadedBytes,
                totalBytes: stats.size,
                uploadProgress: Math.round((uploadedBytes / stats.size) * 100),
                currentPart: partNum,
                totalParts: numParts
              });
            }
          }
        );

        uploadedParts.push(part);
      }

      // Complete upload
      if (onStatusChange) {
        onStatusChange({
          status: 'completing',
          message: 'Finalizing upload...',
          uploadProgress: 100
        });
      }

      await this.completeUpload(s3UploadId, key, uploadedParts);

      // Start preprocessing
      if (onStatusChange) {
        onStatusChange({
          status: 'preprocessing',
          message: 'Starting document analysis...',
          preprocessProgress: 0
        });
      }

      const { noteId, jobId } = await this.startPreprocessing(
        key,
        fileName,
        stats.size,
        mimeType
      );

      // Store job for polling
      this.preprocessJobs.set(jobId, {
        noteId,
        fileName,
        uploadId
      });

      // Poll for completion
      const result = await this.pollPreprocessing(jobId, (status) => {
        if (onStatusChange) {
          onStatusChange({
            status: 'preprocessing',
            message: status.progress 
              ? `Processing document... ${status.progress}%`
              : 'Processing document...',
            preprocessProgress: status.progress,
            currentPage: status.result?.pageCount 
              ? Math.floor((status.progress || 0) / 100 * status.result.pageCount)
              : undefined,
            totalPages: status.result?.pageCount
          });
        }
      });

      // Cleanup
      this.activeUploads.delete(uploadId);
      this.preprocessJobs.delete(jobId);

      if (onStatusChange) {
        onStatusChange({
          status: 'completed',
          message: 'Upload complete!',
          noteId,
          result
        });
      }

      return {
        success: true,
        noteId,
        jobId,
        key,
        s3Key: key, // Alias for compatibility
        result
      };

    } catch (error) {
      this.activeUploads.delete(uploadId);
      
      if (onStatusChange) {
        onStatusChange({
          status: 'error',
          message: error.message,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Poll preprocessing job until completion
   */
  async pollPreprocessing(jobId, onUpdate, pollInterval = 2000) {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.checkJobStatus(jobId);
          
          if (onUpdate) {
            onUpdate(status);
          }

          if (status.status === 'completed') {
            resolve(status.result);
          } else if (status.status === 'failed') {
            reject(new Error(status.error || 'Processing failed'));
          } else {
            // Continue polling
            setTimeout(poll, pollInterval);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Cancel an active upload
   */
  async cancelUpload(uploadId) {
    const uploadState = this.activeUploads.get(uploadId);
    if (uploadState) {
      uploadState.cancelled = true;
      return true;
    }
    return false;
  }

  /**
   * Get MIME type from file extension
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.zip': 'application/zip',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = new UploadService();
