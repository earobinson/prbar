import { create } from "zustand";
import type {
  GitHubAccount,
  Query,
  LogEntry,
  LogSettings,
  DevSettings,
} from "@prbar/shared-types";
import { api } from "./api";

interface AppState {
  accounts: GitHubAccount[];
  queries: Query[];
  logs: LogEntry[];
  logSettings: LogSettings;
  devSettings: DevSettings;
  loading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  addAccount: (
    account: Omit<GitHubAccount, "id">,
    token: string,
  ) => Promise<void>;
  updateAccount: (
    id: string,
    name: string,
    githubUsername: string,
  ) => Promise<void>;
  setAccountToken: (id: string, token: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  saveQuery: (query: Query) => Promise<void>;
  deleteQuery: (id: string) => Promise<void>;
  setQueryEnabled: (query: Query, enabled: boolean) => Promise<void>;
  loadLogs: () => Promise<void>;
  saveLogSettings: (settings: LogSettings) => Promise<void>;
  clearLogs: () => Promise<void>;
  saveDevSettings: (settings: DevSettings) => Promise<void>;
}

const DEFAULT_LOG_SETTINGS: LogSettings = { level: "info", retentionDays: 3 };
const DEFAULT_DEV_SETTINGS: DevSettings = { tokenStorage: "keychain" };

export const useAppStore = create<AppState>((set, get) => ({
  accounts: [],
  queries: [],
  logs: [],
  logSettings: DEFAULT_LOG_SETTINGS,
  devSettings: DEFAULT_DEV_SETTINGS,
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null });
    try {
      const [accounts, queries, logs, logSettings, devSettings] =
        await Promise.all([
          api.listAccounts(),
          api.listQueries(),
          api.listLogs(),
          api.getLogSettings(),
          api.getDevSettings(),
        ]);
      set({
        accounts,
        queries,
        logs,
        logSettings,
        devSettings,
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  async addAccount(account, token) {
    await api.addAccount(account, token);
    await get().loadAll();
  },

  async updateAccount(id, name, githubUsername) {
    await api.updateAccount(id, name, githubUsername);
    await get().loadAll();
  },

  async setAccountToken(id, token) {
    await api.setAccountToken(id, token);
    await get().loadAll();
  },

  async removeAccount(id) {
    await api.removeAccount(id);
    await get().loadAll();
  },

  async saveQuery(query) {
    await api.saveQuery(query);
    await get().loadAll();
  },

  async deleteQuery(id) {
    await api.deleteQuery(id);
    await get().loadAll();
  },

  async setQueryEnabled(query, enabled) {
    await api.saveQuery({ ...query, enabled });
    await get().loadAll();
  },

  async loadLogs() {
    const logs = await api.listLogs();
    set({ logs });
  },

  async saveLogSettings(settings) {
    const saved = await api.setLogSettings(settings);
    const logs = await api.listLogs();
    set({ logSettings: saved, logs });
  },

  async clearLogs() {
    await api.clearLogs();
    set({ logs: [] });
  },

  async saveDevSettings(settings) {
    const saved = await api.setDevSettings(settings);
    set({ devSettings: saved });
  },
}));
