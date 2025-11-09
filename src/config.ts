/**
 * Frontend Application Configuration
 * Centralized configuration for API URLs and other constants
 */

export const config = {
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
} as const;
