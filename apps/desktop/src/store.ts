import { create } from "zustand";
import type { GitHubAccount, Query } from "@prbar/shared-types";
import { api } from "./api";

interface AppState {
  accounts: GitHubAccount[];
  queries: Query[];
  loading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  addAccount: (
    account: Omit<GitHubAccount, "id">,
    token: string,
  ) => Promise<void>;
  renameAccount: (id: string, name: string) => Promise<void>;
  setAccountToken: (id: string, token: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  saveQuery: (query: Query) => Promise<void>;
  deleteQuery: (id: string) => Promise<void>;
  setQueryEnabled: (query: Query, enabled: boolean) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  accounts: [],
  queries: [],
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null });
    try {
      const [accounts, queries] = await Promise.all([
        api.listAccounts(),
        api.listQueries(),
      ]);
      set({ accounts, queries, loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  async addAccount(account, token) {
    await api.addAccount(account, token);
    await get().loadAll();
  },

  async renameAccount(id, name) {
    await api.renameAccount(id, name);
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
}));
