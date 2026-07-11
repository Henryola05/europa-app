export type Category = {
  emoji: string;
  name: string;
};

export const defaultExpenseCategories: Category[] = [
  { emoji: "🍜", name: "Food" },
  { emoji: "👫", name: "Social Life" },
  { emoji: "🐾", name: "Pets" },
  { emoji: "🚗", name: "Transport" },
  { emoji: "🖼️", name: "Culture" },
  { emoji: "🏠", name: "Rent" },
  { emoji: "👕", name: "Apparel" },
  { emoji: "💄", name: "Beauty" },
  { emoji: "💊", name: "Health" },
  { emoji: "📓", name: "Education" },
  { emoji: "🎁", name: "Gift" },
  { emoji: "⛽", name: "Fuel" },
  { emoji: "🏦", name: "Loan" },
  { emoji: "☎️", name: "Airtime" },
  { emoji: "🔄", name: "Subscription" },
  { emoji: "📦", name: "Other" },
];

export const defaultIncomeCategories: Category[] = [
  { emoji: "🤑", name: "Allowance" },
  { emoji: "💼", name: "Salary" },
  { emoji: "💻", name: "Freelance" },
  { emoji: "💵", name: "Petty cash" },
  { emoji: "🎁", name: "Gifts" },
  { emoji: "💰", name: "Refunds" },
  { emoji: "📈", name: "Investments" },
  { emoji: "💸", name: "Bonus" },
  { emoji: "🛍️", name: "Sales" },
  { emoji: "📁", name: "Other" },
];

export const defaultCategoryColors: Record<string, string> = {
  Food: "#ef4444",
  "Social Life": "#3b82f6",
  Pets: "#f97316",
  Transport: "#22c55e",
  Culture: "#f59e0b",
  Rent: "#a855f7",
  Apparel: "#06b6d4",
  Beauty: "#ec4899",
  Health: "#14b8a6",
  Education: "#8b5cf6",
  Gift: "#f43f5e",
  Fuel: "#78716c",
  Loan: "#64748b",
  Airtime: "#0ea5e9",
  Subscription: "#10b981",
  Allowance: "#ef4444",
  Salary: "#3b82f6",
  Freelance: "#f97316",
  "Petty cash": "#22c55e",
  Gifts: "#f59e0b",
  Refunds: "#8b5cf6",
  Investments: "#06b6d4",
  Bonus: "#ec4899",
  Sales: "#14b8a6",
  Other: "#6b7280",
};

export const COLOR_PALETTE = [
  "#60A5FA", "#FB923C", "#FCA5A5", "#4ADE80", "#FDE047", "#C084FC",
  "#EF4444", "#2DD4BF", "#F97316", "#3B82F6", "#F9A8D4", "#22D3EE",
  "#16A34A", "#EAB308", "#10B981", "#9333EA", "#0891B2", "#B91C1C",
  "#BE185D", "#0F766E", "#B45309", "#166534", "#991B1B", "#1D4ED8",
];
