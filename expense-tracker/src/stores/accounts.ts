import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AccountGroup =
  | "Cash"
  | "Accounts"
  | "Credit Card"
  | "Debit Card"
  | "Savings"
  | "Investments"
  | "Top-Up/Prepaid"
  | "Overdrafts"
  | "Loan"
  | "Insurance"
  | "Mobile Money"
  | "Others";

export type StoredAccount = {
  id: string;
  name: string;
  group: AccountGroup;
  openingBalanceCents: number;
  currencyCode: string;
};

export const accountGroupOrder: AccountGroup[] = [
  "Cash",
  "Accounts",
  "Credit Card",
  "Debit Card",
  "Savings",
  "Investments",
  "Top-Up/Prepaid",
  "Overdrafts",
  "Loan",
  "Insurance",
  "Mobile Money",
  "Others",
];

const defaultAccounts: StoredAccount[] = [
  { id: "cash-wallet", name: "Cash Wallet", group: "Cash", openingBalanceCents: 0, currencyCode: "USD" },
  { id: "chase", name: "Chase", group: "Accounts", openingBalanceCents: 0, currencyCode: "USD" },
  { id: "wells-fargo", name: "Wells Fargo", group: "Accounts", openingBalanceCents: 0, currencyCode: "USD" },
  { id: "venmo", name: "Venmo", group: "Mobile Money", openingBalanceCents: 0, currencyCode: "USD" },
  { id: "cash-app", name: "Cash App", group: "Mobile Money", openingBalanceCents: 0, currencyCode: "USD" },
];

type AccountsState = {
  accounts: StoredAccount[];
  addAccount: (account: StoredAccount) => void;
  removeAccount: (id: string) => void;
  reorderInGroup: (group: AccountGroup, orderedIds: string[]) => void;
  moveToGroup: (accountId: string, toGroup: AccountGroup, atIndex: number) => void;
  setOpeningBalance: (id: string, openingBalanceCents: number) => void;
};

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set) => ({
      accounts: defaultAccounts,

      addAccount: (account) =>
        set((s) => ({ accounts: [...s.accounts, account] })),

      removeAccount: (id) =>
        set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),

      reorderInGroup: (group, orderedIds) =>
        set((s) => {
          const ordered = orderedIds
            .map((id) => s.accounts.find((a) => a.id === id))
            .filter((a): a is StoredAccount => a !== undefined);
          let idx = 0;
          return {
            accounts: s.accounts.map((a) =>
              a.group === group ? ordered[idx++] ?? a : a,
            ),
          };
        }),

      moveToGroup: (accountId, toGroup, atIndex) =>
        set((s) => {
          const account = s.accounts.find((a) => a.id === accountId);
          if (!account) return s;
          const updated = { ...account, group: toGroup };
          const without = s.accounts.filter((a) => a.id !== accountId);
          const targetItems = without.filter((a) => a.group === toGroup);
          if (atIndex >= targetItems.length) {
            const lastIdx = without.reduce(
              (li, a, i) => (a.group === toGroup ? i : li),
              -1,
            );
            const result = [...without];
            result.splice(lastIdx + 1, 0, updated);
            return { accounts: result };
          }
          const insertBeforeId = targetItems[atIndex].id;
          const insertIdx = without.findIndex((a) => a.id === insertBeforeId);
          const result = [...without];
          result.splice(insertIdx, 0, updated);
          return { accounts: result };
        }),

      setOpeningBalance: (id, openingBalanceCents) =>
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === id ? { ...a, openingBalanceCents } : a,
          ),
        })),
    }),
    {
      name: "europa:accounts",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
