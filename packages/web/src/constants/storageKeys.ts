// Centralizes the localStorage keys the app already uses so future backup and
// migration work has a single source of truth. Values must match the keys the
// app persists today — changing a value would orphan existing user data.
export const PREFERENCES_STORAGE_KEY = 'breath-in-flow-preferences-v1';
export const CONFIGS_STORAGE_KEY = 'breath-in-flow-configs';
export const SESSIONS_STORAGE_KEY = 'breath-in-flow-sessions';
export const SOUND_THEME_STORAGE_KEY = 'breath-in-flow-sound-theme';
export const LAST_CONFIG_STORAGE_KEY = 'herb_breathing_last_config';
