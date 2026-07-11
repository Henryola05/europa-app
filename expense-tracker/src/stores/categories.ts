import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  COLOR_PALETTE,
  type Category,
  defaultCategoryColors,
  defaultExpenseCategories,
  defaultIncomeCategories,
} from "@/constants/categories";

type CategoriesState = {
  expenseCategories: Category[];
  incomeCategories: Category[];
  categoryColors: Record<string, string>;
  addCategory: (type: "expense" | "income", cat: Category, color: string) => void;
  deleteCategory: (type: "expense" | "income", name: string) => void;
  updateCategory: (type: "expense" | "income", oldName: string, newCat: Category, color: string) => void;
  reorderCategories: (type: "expense" | "income", from: number, to: number) => void;
};

const listKey = (type: "expense" | "income") =>
  type === "expense" ? "expenseCategories" : "incomeCategories";

export const useCategoriesStore = create<CategoriesState>()(
  persist(
    (set) => ({
      expenseCategories: defaultExpenseCategories,
      incomeCategories: defaultIncomeCategories,
      categoryColors: { ...defaultCategoryColors },

      addCategory: (type, cat, color) => {
        const key = listKey(type);
        set((s) => ({
          [key]: [...(s[key] as Category[]), cat],
          categoryColors: { ...s.categoryColors, [cat.name]: color ?? COLOR_PALETTE[6] },
        }));
      },

      deleteCategory: (type, name) => {
        const key = listKey(type);
        set((s) => {
          const colors = { ...s.categoryColors };
          delete colors[name];
          return {
            [key]: (s[key] as Category[]).filter((c) => c.name !== name),
            categoryColors: colors,
          };
        });
      },

      updateCategory: (type, oldName, newCat, color) => {
        const key = listKey(type);
        set((s) => {
          const colors = { ...s.categoryColors };
          if (newCat.name !== oldName) delete colors[oldName];
          colors[newCat.name] = color;
          return {
            [key]: (s[key] as Category[]).map((c) => (c.name === oldName ? newCat : c)),
            categoryColors: colors,
          };
        });
      },

      reorderCategories: (type, from, to) => {
        const key = listKey(type);
        set((s) => {
          const arr = [...(s[key] as Category[])];
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          return { [key]: arr };
        });
      },
    }),
    {
      name: "europa:categories",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
