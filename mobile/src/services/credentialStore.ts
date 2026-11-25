/**
 * Secure credential store for the Garmin Personal API key.
 *
 * - Native (iOS / Android): delegates to expo-secure-store.
 * - Web: stores in memory only (never localStorage or console logs).
 */

const GARMIN_API_KEY_STORAGE_KEY = "garmin_personal_api_key";

export interface CredentialStore {
  getApiKey(): Promise<string | null>;
  setApiKey(apiKey: string): Promise<void>;
  deleteApiKey(): Promise<void>;
  hasApiKey(): Promise<boolean>;
}

export class MemoryCredentialStore implements CredentialStore {
  private apiKey: string | null = null;

  constructor(initialKey?: string | null) {
    this.apiKey = initialKey ? initialKey.trim() || null : null;
  }

  async getApiKey(): Promise<string | null> {
    return this.apiKey;
  }

  async setApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("Garmin Personal API key cannot be empty.");
    }
    this.apiKey = trimmed;
  }

  async deleteApiKey(): Promise<void> {
    this.apiKey = null;
  }

  async hasApiKey(): Promise<boolean> {
    return this.apiKey !== null && this.apiKey.length > 0;
  }
}

interface SecureStoreModuleLike {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export class ExpoCredentialStore implements CredentialStore {
  private readonly fallback = new MemoryCredentialStore();
  private cachedSecureStore: SecureStoreModuleLike | null = null;

  constructor(private readonly secureStoreOverride?: SecureStoreModuleLike | null) {}

  private async getSecureStore(): Promise<SecureStoreModuleLike | null> {
    if (this.secureStoreOverride !== undefined) {
      if (!this.secureStoreOverride) return null;
      try {
        const available = await this.secureStoreOverride.isAvailableAsync();
        return available ? this.secureStoreOverride : null;
      } catch {
        return null;
      }
    }

    if (this.cachedSecureStore) {
      return this.cachedSecureStore;
    }

    try {
      const mod = (await import("expo-secure-store")) as unknown as SecureStoreModuleLike;
      if (typeof mod?.isAvailableAsync === "function" && (await mod.isAvailableAsync())) {
        this.cachedSecureStore = mod;
        return mod;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getApiKey(): Promise<string | null> {
    const secure = await this.getSecureStore();
    if (secure) {
      const value = await secure.getItemAsync(GARMIN_API_KEY_STORAGE_KEY);
      return value ? value.trim() || null : null;
    }
    return this.fallback.getApiKey();
  }

  async setApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("Garmin Personal API key cannot be empty.");
    }
    const secure = await this.getSecureStore();
    if (secure) {
      await secure.setItemAsync(GARMIN_API_KEY_STORAGE_KEY, trimmed);
      return;
    }
    await this.fallback.setApiKey(trimmed);
  }

  async deleteApiKey(): Promise<void> {
    const secure = await this.getSecureStore();
    if (secure) {
      await secure.deleteItemAsync(GARMIN_API_KEY_STORAGE_KEY);
      return;
    }
    await this.fallback.deleteApiKey();
  }

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return key !== null && key.length > 0;
  }
}
