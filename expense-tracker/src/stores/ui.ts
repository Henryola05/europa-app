import { create } from "zustand";

type UIState = {
  pendingDeletedTransaction: {
    originalIndex: number;
    transaction: {
      id: string;
      type: "income" | "expense" | "transfer";
      amountCents: number;
      description: string;
      categoryEmoji: string;
      categoryName: string;
      categoryColor?: string;
      accountName: string;
      destinationAccountName?: string;
      date: string;
      currencyCode: string;
      recurringOption: string;
      imageUris: string[];
    };
  } | null;
  setPendingDeletedTransaction: (value: UIState["pendingDeletedTransaction"]) => void;
  pendingToast: string | null;
  setPendingToast: (message: string | null) => void;
  shouldResetOnboarding: boolean;
  setShouldResetOnboarding: (value: boolean) => void;
};

export const useUIStore = create<UIState>()((set) => ({
  pendingDeletedTransaction: null,
  setPendingDeletedTransaction: (value) => set({ pendingDeletedTransaction: value }),
  pendingToast: null,
  setPendingToast: (message) => set({ pendingToast: message }),
  shouldResetOnboarding: false,
  setShouldResetOnboarding: (value) => set({ shouldResetOnboarding: value }),
}));
