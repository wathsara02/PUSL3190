import { create } from 'zustand';
import type { RoomStateSnapshot } from '../types/game';

interface GameStore {
  state: RoomStateSnapshot | null;
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  setState: (state: RoomStateSnapshot) => void;
  setConnected: (v: boolean) => void;
  setReconnecting: (v: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: null,
  connected: false,
  reconnecting: false,
  error: null,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setError: (error) => set({ error }),
  reset: () => set({ state: null, connected: false, reconnecting: false, error: null }),
}));
