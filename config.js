/**
 * Application Configuration
 * Centralized configuration for API URLs, CDN URLs, and other constants
 */

module.exports = {
  // API Configuration
  API: {
    BASE_URL: 'https://dev.quelo.tech',
    AUTH_URL: 'https://dev.quelo.tech/electron/sign-in',
    VALIDATE_URL: 'https://dev.quelo.tech/api/auth/validate-token',
  },

  // CDN Configuration
  CDN: {
    S3_BASE_URL: 'https://s3.quelo.tech',
    STORAGE_BUCKET: 'quelo-app-notes-storage',
  },

  // Authentication
  AUTH: {
    SERVICE_NAME: 'Quelo.tech CloudSync',
    ACCOUNT_NAME: 'user-token',
  },

  // Upload Configuration
  UPLOAD: {
    PART_SIZE: 5 * 1024 * 1024, // 5MB chunks
  },

  // Development
  DEV: {
    VITE_PORT: 5173,
    VITE_URL: 'http://localhost:5173',
  },
};
