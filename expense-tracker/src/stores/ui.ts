import { create } from "zustand";

type UIState = {
  pendingToast: string | null;
  setPendingToast: (message: string | null) => void;
  shouldResetOnboarding: boolean;
  setShouldResetOnboarding: (value: boolean) => void;
};

export const useUIStore = create<UIState>()((set) => ({
  pendingToast: null,
  setPendingToast: (message) => set({ pendingToast: message }),
  shouldResetOnboarding: false,
  setShouldResetOnboarding: (value) => set({ shouldResetOnboarding: value }),
}));
