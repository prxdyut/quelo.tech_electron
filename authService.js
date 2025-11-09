const { BrowserWindow, session, shell } = require('electron');
const keytar = require('keytar');
const fetch = require('node-fetch');
const config = require('./config');

const SERVICE_NAME = config.AUTH.SERVICE_NAME;
const ACCOUNT_NAME = config.AUTH.ACCOUNT_NAME;
const AUTH_URL = config.API.AUTH_URL;
const VALIDATE_URL = config.API.VALIDATE_URL;

/**
 * Optimized Authentication Service
 * Handles secure token storage and validation
 */
class AuthService {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
    this.user = null;
    this.validationPromise = null; // Prevent multiple concurrent validations
  }

  /**
   * Get stored token from secure storage
   */
  async getStoredToken() {
    try {
      const token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (token) {
        this.token = token;
        console.log('[Auth] Token loaded from keytar');
        return token;
      }
      console.log('[Auth] No token found in keytar');
      return null;
    } catch (error) {
      console.error('[Auth] Failed to get stored token:', error);
      return null;
    }
  }

  /**
   * Store token securely
   */
  async storeToken(token) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
      this.token = token;
      console.log('[Auth] Token stored in keytar');
      return true;
    } catch (error) {
      console.error('[Auth] Failed to store token:', error);
      return false;
    }
  }

  /**
   * Delete stored token
   */
  async deleteToken() {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
      this.token = null;
      this.tokenExpiry = null;
      this.user = null;
      console.log('[Auth] Token deleted from keytar');
      return true;
    } catch (error) {
      console.error('[Auth] Failed to delete token:', error);
      return false;
    }
  }

  /**
   * Get current token (in-memory or from storage)
   */
  async getToken() {
    if (this.token) {
      return this.token;
    }
    return await this.getStoredToken();
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Validate token with backend (with caching to prevent multiple calls)
   */
  async validateToken() {
    // If validation is already in progress, return that promise
    if (this.validationPromise) {
      return this.validationPromise;
    }

    this.validationPromise = this._doValidateToken();
    const result = await this.validationPromise;
    this.validationPromise = null;
    return result;
  }

  async _doValidateToken() {
    try {
      const token = await this.getToken();
      if (!token) {
        return { isValid: false, user: null };
      }

      const response = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: {
          // 'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        console.log('[Auth] Token validation failed:', response.status);
        await this.deleteToken();
        return { isValid: false, user: null };
      }

      const data = await response.json();
      if (data.valid) {
        this.user = data.user;
        console.log('[Auth] Token validated successfully');
        return { isValid: true, user: data.user };
      }

      await this.deleteToken();
      return { isValid: false, user: null };
    } catch (error) {
      console.error('[Auth] Token validation error:', error);
      return { isValid: false, user: null };
    }
  }

  /**
   * Initialize on app start
   */
  async initialize() {
    try {
      const token = await this.getStoredToken();
      if (token) {
        // Validate token in background
        const result = await this.validateToken();
        return result.isValid ? token : null;
      }
      return null;
    } catch (error) {
      console.error('[Auth] Initialization error:', error);
      return null;
    }
  }

  /**
   * Open login URL in default browser
   */
  async login(parentWindow) {
    return new Promise((resolve, reject) => {
      // Open login URL in the default browser
      shell.openExternal(AUTH_URL);
      console.log('[Auth] Opening login URL in default browser:', AUTH_URL);

      // Set up a timeout for the login process
      const timeout = setTimeout(() => {
        reject(new Error('Login timeout'));
      }, 300000); // 5 minutes timeout

      // Store the resolver for when we receive the callback
      this._loginResolver = (token) => {
        clearTimeout(timeout);
        if (token) {
          resolve(token);
        } else {
          reject(new Error('No token received'));
        }
      };
    });
  }

  /**
   * Handle auth callback from deep link
   */
  async handleAuthCallback(url) {
    try {
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get('token');
      
      if (token) {
        await this.storeToken(token);
        console.log('[Auth] Token received from callback');
        
        if (this._loginResolver) {
          this._loginResolver(token);
          this._loginResolver = null;
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Auth] Error handling auth callback:', error);
      if (this._loginResolver) {
        this._loginResolver(null);
        this._loginResolver = null;
      }
      return false;
    }
  }

  /**
   * Logout
   */
  async logout() {
    await this.deleteToken();
    this.user = null;
    console.log('[Auth] User logged out');
  }
}

module.exports = new AuthService();
