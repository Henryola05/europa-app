import { create } from "zustand";

type UIState = {
  pendingToast: string | null;
  setPendingToast: (message: string | null) => void;
};

export const useUIStore = create<UIState>()((set) => ({
  pendingToast: null,
  setPendingToast: (message) => set({ pendingToast: message }),
}));
