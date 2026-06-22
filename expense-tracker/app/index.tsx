import AsyncStorage from "@react-native-async-storage/async-storage";
import { format, getDay, getDaysInMonth, startOfMonth } from "date-fns";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import { useUIStore } from "@/stores/ui";

const HOME_CURRENCY_KEY = "europa:home-currency";
const WEEK_START_KEY = "europa:week-start";

const WEEK_DAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const WEEK_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TRANSACTIONS_KEY = "europa:transactions";
const SPLASH_DURATION_MS = 2500;
const SHEET_CLOSE_DISTANCE = 120;
const SWIPE_DELETE_REVEAL_WIDTH = 64;
const SWIPE_PARTIAL_REVEAL_PERCENT = 0.25;
const SWIPE_FULL_DELETE_PERCENT = 0.45;
const SWIPE_FULL_DELETE_FLING_VELOCITY = -1_200;

function triggerDeleteThresholdHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

const rateCache: Record<string, { rates: Record<string, number>; ts: number }> = {};

export async function fetchExchangeRates(base: string): Promise<Record<string, number>> {
  const cached = rateCache[base];
  if (cached && Date.now() - cached.ts < 3_600_000) return cached.rates;
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  const json = await res.json() as { rates: Record<string, number> };
  rateCache[base] = { rates: json.rates, ts: Date.now() };
  return json.rates;
}

export function convertCents(cents: number, fromCode: string, toCode: string, rates: Record<string, number>): number {
  if (fromCode === toCode || !rates[fromCode]) return cents;
  return Math.round((cents / rates[fromCode]) * rates[toCode]);
}

type Transaction = {
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

type DayGroup = {
  dateKey: string;
  date: Date;
  transactions: Transaction[];
  netCents: number;
};

type PendingDeletion = {
  dateSection: string;
  id: number;
  originalIndex: number;
  transaction: Transaction;
};

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
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

function categoryColor(name: string): string {
  return DEFAULT_CATEGORY_COLORS[name] ?? "#6b7280";
}

function formatCents(cents: number, symbol: string): string {
  const whole = Math.floor(cents / 100).toLocaleString();
  const frac = String(cents % 100).padStart(2, "0");
  return `${symbol}${whole}.${frac}`;
}

export type Currency = {
  code: string;
  flag: string;
  name: string;
};

type MingCuteIconName =
  | "add-fill"
  | "calendar-2-line"
  | "chart-bar-line"
  | "chart-pie-2-line"
  | "close-line"
  | "down-line"
  | "filter-2-line"
  | "home-1-fill"
  | "list-check-line"
  | "search-line"
  | "settings-1-line"
  | "wallet-2-fill"
  | "wallet-5-fill"
  | "wallet-5-line";

type HomeTab = {
  icon: MingCuteIconName;
  label: string;
};

export const currencies: Currency[] = [
  { code: "AED", flag: "🇦🇪", name: "United Arab Emirates dirham" },
  { code: "ARS", flag: "🇦🇷", name: "Argentine peso" },
  { code: "AUD", flag: "🇦🇺", name: "Australian dollar" },
  { code: "BDT", flag: "🇧🇩", name: "Bangladeshi taka" },
  { code: "BGN", flag: "🇧🇬", name: "Bulgarian lev" },
  { code: "BRL", flag: "🇧🇷", name: "Brazilian real" },
  { code: "BWP", flag: "🇧🇼", name: "Botswana pula" },
  { code: "CAD", flag: "🇨🇦", name: "Canadian dollar" },
  { code: "CHF", flag: "🇨🇭", name: "Swiss franc" },
  { code: "CLP", flag: "🇨🇱", name: "Chilean peso" },
  { code: "CNY", flag: "🇨🇳", name: "Chinese yuan" },
  { code: "COP", flag: "🇨🇴", name: "Colombian peso" },
  { code: "CZK", flag: "🇨🇿", name: "Czech koruna" },
  { code: "DKK", flag: "🇩🇰", name: "Danish krone" },
  { code: "DZD", flag: "🇩🇿", name: "Algerian dinar" },
  { code: "EGP", flag: "🇪🇬", name: "Egyptian pound" },
  { code: "EUR", flag: "🇪🇺", name: "Euro" },
  { code: "GBP", flag: "🇬🇧", name: "British pound sterling" },
  { code: "GHS", flag: "🇬🇭", name: "Ghanaian cedi" },
  { code: "HKD", flag: "🇭🇰", name: "Hong Kong dollar" },
  { code: "IDR", flag: "🇮🇩", name: "Indonesian rupiah" },
  { code: "ILS", flag: "🇮🇱", name: "Israeli new shekel" },
  { code: "INR", flag: "🇮🇳", name: "Indian rupee" },
  { code: "JPY", flag: "🇯🇵", name: "Japanese yen" },
  { code: "KES", flag: "🇰🇪", name: "Kenyan shilling" },
  { code: "KRW", flag: "🇰🇷", name: "South Korean won" },
  { code: "MAD", flag: "🇲🇦", name: "Moroccan dirham" },
  { code: "MXN", flag: "🇲🇽", name: "Mexican peso" },
  { code: "MYR", flag: "🇲🇾", name: "Malaysian ringgit" },
  { code: "NGN", flag: "🇳🇬", name: "Nigerian naira" },
  { code: "NOK", flag: "🇳🇴", name: "Norwegian krone" },
  { code: "NZD", flag: "🇳🇿", name: "New Zealand dollar" },
  { code: "PHP", flag: "🇵🇭", name: "Philippine peso" },
  { code: "PKR", flag: "🇵🇰", name: "Pakistani rupee" },
  { code: "PLN", flag: "🇵🇱", name: "Polish zloty" },
  { code: "QAR", flag: "🇶🇦", name: "Qatari riyal" },
  { code: "RON", flag: "🇷🇴", name: "Romanian leu" },
  { code: "RSD", flag: "🇷🇸", name: "Serbian dinar" },
  { code: "SAR", flag: "🇸🇦", name: "Saudi riyal" },
  { code: "SEK", flag: "🇸🇪", name: "Swedish krona" },
  { code: "SGD", flag: "🇸🇬", name: "Singapore dollar" },
  { code: "THB", flag: "🇹🇭", name: "Thai baht" },
  { code: "TRY", flag: "🇹🇷", name: "Turkish lira" },
  { code: "TWD", flag: "🇹🇼", name: "New Taiwan dollar" },
  { code: "TZS", flag: "🇹🇿", name: "Tanzanian shilling" },
  { code: "UGX", flag: "🇺🇬", name: "Ugandan shilling" },
  { code: "USD", flag: "🇺🇸", name: "United States dollar" },
  { code: "VND", flag: "🇻🇳", name: "Vietnamese dong" },
  { code: "XAF", flag: "🇨🇲", name: "Central African CFA franc" },
  { code: "XOF", flag: "🇸🇳", name: "West African CFA franc" },
  { code: "ZAR", flag: "🇿🇦", name: "South African rand" },
];

export const currencySymbols: Record<string, string> = {
  AED: "د.إ",
  ARS: "$",
  AUD: "$",
  BDT: "৳",
  BGN: "лв",
  BRL: "R$",
  BWP: "P",
  CAD: "$",
  CHF: "CHF",
  CLP: "$",
  CNY: "¥",
  COP: "$",
  CZK: "Kč",
  DKK: "kr",
  DZD: "دج",
  EGP: "£",
  EUR: "€",
  GBP: "£",
  GHS: "₵",
  HKD: "$",
  IDR: "Rp",
  ILS: "₪",
  INR: "₹",
  JPY: "¥",
  KES: "KSh",
  KRW: "₩",
  MAD: "د.م.",
  MXN: "$",
  MYR: "RM",
  NGN: "₦",
  NOK: "kr",
  NZD: "$",
  PHP: "₱",
  PKR: "₨",
  PLN: "zł",
  QAR: "ر.ق",
  RON: "lei",
  RSD: "дин",
  SAR: "﷼",
  SEK: "kr",
  SGD: "$",
  THB: "฿",
  TRY: "₺",
  TWD: "$",
  TZS: "TSh",
  UGX: "USh",
  USD: "$",
  VND: "₫",
  XAF: "FCFA",
  XOF: "F CFA",
  ZAR: "R",
};

const homeTabs: HomeTab[] = [
  { icon: "home-1-fill", label: "Home" },
  { icon: "chart-pie-2-line", label: "Budget" },
  { icon: "chart-bar-line", label: "Insights" },
  { icon: "wallet-5-line", label: "Accounts" },
  { icon: "settings-1-line", label: "Settings" },
];

// day labels are generated dynamically from weekStartIndex
const monthPickerStartYear = 2016;
const monthPickerEndYear = 2035;

const MONTH_PICKER_ITEM_HEIGHT = 44;
const MONTH_PICKER_COLUMN_HEIGHT = MONTH_PICKER_ITEM_HEIGHT * 5;
const MONTH_PICKER_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_PICKER_MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_PICKER_YEARS = Array.from(
  { length: monthPickerEndYear - monthPickerStartYear + 1 },
  (_, i) => String(monthPickerStartYear + i),
);

function formatMonthYearLabel(date: Date) {
  return format(date, "MMM yyyy");
}

function localDateKey(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getCalendarDays(year: number, month: number, weekStartIndex = 1) {
  const firstDayOfMonth = startOfMonth(new Date(year, month, 1));
  const leadingEmptyDays = (getDay(firstDayOfMonth) - weekStartIndex + 7) % 7;
  const daysInMonth = getDaysInMonth(firstDayOfMonth);
  const calendarDays: (number | null)[] = [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  return calendarDays;
}

function getCalendarDayLabels(weekStartIndex: number) {
  return Array.from({ length: 7 }, (_, i) => WEEK_DAY_LABELS[(weekStartIndex + i) % 7]);
}

const mingCuteIcons: Record<
  MingCuteIconName,
  { path: string; viewBox: string }
> = {
  "add-fill": {
    viewBox: "0 0 28 28",
    path: "M12.25 23.3333C12.25 23.7975 12.4344 24.2426 12.7626 24.5708C13.0908 24.899 13.5359 25.0833 14 25.0833C14.4641 25.0833 14.9092 24.899 15.2374 24.5708C15.5656 24.2426 15.75 23.7975 15.75 23.3333V15.75H23.3333C23.7975 15.75 24.2426 15.5656 24.5708 15.2374C24.899 14.9092 25.0833 14.4641 25.0833 14C25.0833 13.5359 24.899 13.0908 24.5708 12.7626C24.2426 12.4344 23.7975 12.25 23.3333 12.25H15.75V4.66667C15.75 4.20254 15.5656 3.75742 15.2374 3.42923C14.9092 3.10104 14.4641 2.91667 14 2.91667C13.5359 2.91667 13.0908 3.10104 12.7626 3.42923C12.4344 3.75742 12.25 4.20254 12.25 4.66667V12.25H4.66667C4.20254 12.25 3.75742 12.4344 3.42923 12.7626C3.10104 13.0908 2.91667 13.5359 2.91667 14C2.91667 14.4641 3.10104 14.9092 3.42923 15.2374C3.75742 15.5656 4.20254 15.75 4.66667 15.75H12.25V23.3333Z",
  },
  "calendar-2-line": {
    viewBox: "0 0 24 24",
    path: "M16 3C16.2652 3 16.5196 3.10536 16.7071 3.29289C16.8946 3.48043 17 3.73478 17 4V5H19C19.5304 5 20.0391 5.21071 20.4142 5.58579C20.7893 5.96086 21 6.46957 21 7V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7V4C7 3.73478 7.10536 3.48043 7.29289 3.29289C7.48043 3.10536 7.73478 3 8 3C8.26522 3 8.51957 3.10536 8.70711 3.29289C8.89464 3.48043 9 3.73478 9 4V5H15V4C15 3.73478 15.1054 3.48043 15.2929 3.29289C15.4804 3.10536 15.7348 3 16 3ZM8 7H5V9H19V7H16H8ZM5 11V19H19V11H5ZM7 13C7 12.7348 7.10536 12.4804 7.29289 12.2929C7.48043 12.1054 7.73478 12 8 12H8.01C8.27522 12 8.52957 12.1054 8.71711 12.2929C8.90464 12.4804 9.01 12.7348 9.01 13C9.01 13.2652 8.90464 13.5196 8.71711 13.7071C8.52957 13.8946 8.27522 14 8.01 14H8C7.73478 14 7.48043 13.8946 7.29289 13.7071C7.10536 13.5196 7 13.2652 7 13ZM8 15C7.73478 15 7.48043 15.1054 7.29289 15.2929C7.10536 15.4804 7 15.7348 7 16C7 16.2652 7.10536 16.5196 7.29289 16.7071C7.48043 16.8946 7.73478 17 8 17H8.01C8.27522 17 8.52957 16.8946 8.71711 16.7071C8.90464 16.5196 9.01 16.2652 9.01 16C9.01 15.7348 8.90464 15.4804 8.71711 15.2929C8.52957 15.1054 8.27522 15 8.01 15H8ZM11 13C11 12.7348 11.1054 12.4804 11.2929 12.2929C11.4804 12.1054 11.7348 12 12 12H12.01C12.2752 12 12.5296 12.1054 12.7171 12.2929C12.9046 12.4804 13.01 12.7348 13.01 13C13.01 13.2652 12.9046 13.5196 12.7171 13.7071C12.5296 13.8946 12.2752 14 12.01 14H12C11.7348 14 11.4804 13.8946 11.2929 13.7071C11.1054 13.5196 11 13.2652 11 13ZM12 15C11.7348 15 11.4804 15.1054 11.2929 15.2929C11.1054 15.4804 11 15.7348 11 16C11 16.2652 11.1054 16.5196 11.2929 16.7071C11.4804 16.8946 11.7348 17 12 17H12.01C12.2752 17 12.5296 16.8946 12.7171 16.7071C12.9046 16.5196 13.01 16.2652 13.01 16C13.01 15.7348 12.9046 15.4804 12.7171 15.2929C12.5296 15.1054 12.2752 15 12.01 15H12ZM15 13C15 12.7348 15.1054 12.4804 15.2929 12.2929C15.4804 12.1054 15.7348 12 16 12H16.01C16.2752 12 16.5296 12.1054 16.7171 12.2929C16.9046 12.4804 17.01 12.7348 17.01 13C17.01 13.2652 16.9046 13.5196 16.7171 13.7071C16.5296 13.8946 16.2752 14 16.01 14H16C15.7348 14 15.4804 13.8946 15.2929 13.7071C15.1054 13.5196 15 13.2652 15 13ZM16 15C15.7348 15 15.4804 15.1054 15.2929 15.2929C15.1054 15.4804 15 15.7348 15 16C15 16.2652 15.1054 16.5196 15.2929 16.7071C15.4804 16.8946 15.7348 17 16 17H16.01C16.2752 17 16.5296 16.8946 16.7171 16.7071C16.9046 16.5196 17.01 16.2652 17.01 16C17.01 15.7348 16.9046 15.4804 16.7171 15.2929C16.5296 15.1054 16.2752 15 16.01 15H16Z",
  },
  "chart-bar-line": {
    viewBox: "0 0 28 28",
    path: "M16.3333 3.5C16.9522 3.5 17.5457 3.74583 17.9832 4.18342C18.4208 4.621 18.6667 5.21449 18.6667 5.83333V9.33333H23.3333C23.9522 9.33333 24.5457 9.57917 24.9832 10.0168C25.4208 10.4543 25.6667 11.0478 25.6667 11.6667V22.1667C25.6667 22.7855 25.4208 23.379 24.9832 23.8166C24.5457 24.2542 23.9522 24.5 23.3333 24.5H4.66667C4.04783 24.5 3.45434 24.2542 3.01675 23.8166C2.57917 23.379 2.33333 22.7855 2.33333 22.1667V15.1667C2.33333 14.5478 2.57917 13.9543 3.01675 13.5168C3.45434 13.0792 4.04783 12.8333 4.66667 12.8333H9.33333V5.83333C9.33333 5.21449 9.57917 4.621 10.0168 4.18342C10.4543 3.74583 11.0478 3.5 11.6667 3.5H16.3333ZM16.3333 5.83333H11.6667V22.1667H16.3333V5.83333ZM23.3333 11.6667H18.6667V22.1667H23.3333V11.6667ZM9.33333 15.1667H4.66667V22.1667H9.33333V15.1667Z",
  },
  "chart-pie-2-line": {
    viewBox: "0 0 28 28",
    path: "M14 2.33333C13.6906 2.33333 13.3938 2.45625 13.175 2.67504C12.9562 2.89383 12.8333 3.19058 12.8333 3.5V14C12.8333 14.3094 12.9562 14.6062 13.175 14.825C13.3938 15.0437 13.6906 15.1667 14 15.1667H24.5C24.8094 15.1667 25.1062 15.0437 25.325 14.825C25.5438 14.6062 25.6667 14.3094 25.6667 14C25.6667 7.5565 20.4435 2.33333 14 2.33333ZM15.1667 12.8333V4.739C17.2228 4.99868 19.1341 5.93499 20.5996 7.40044C22.065 8.86589 23.0013 10.7772 23.261 12.8333H15.1667ZM10.3717 5.39817C10.6566 5.27749 10.882 5.04856 10.9982 4.76172C11.1144 4.47488 11.1118 4.15364 10.9912 3.86867C10.8705 3.58369 10.6416 3.35833 10.3547 3.24215C10.0679 3.12597 9.74664 3.12849 9.46167 3.24917C7.34828 4.14206 5.54496 5.63807 4.27713 7.5502C3.00929 9.46232 2.33319 11.7057 2.33333 14C2.33333 20.4435 7.5565 25.6667 14 25.6667C18.8358 25.6667 22.9822 22.7243 24.7508 18.5383C24.8715 18.2534 24.874 17.9321 24.7579 17.6453C24.6417 17.3584 24.4163 17.1295 24.1313 17.0088C23.8464 16.8882 23.5251 16.8856 23.2383 17.0018C22.9514 17.118 22.7225 17.3434 22.6018 17.6283C21.7636 19.6122 20.2651 21.2453 18.3605 22.2507C16.4558 23.2561 14.2622 23.5721 12.1512 23.145C10.0402 22.718 8.14186 21.5742 6.7778 19.9075C5.41373 18.2408 4.66789 16.1537 4.66667 14C4.66661 12.1641 5.20776 10.369 6.22247 8.83907C7.23717 7.30913 8.68039 6.11227 10.3717 5.39817Z",
  },
  "close-line": {
    viewBox: "0 0 24 24",
    path: "M6.2253 4.81108C5.83477 4.42056 5.20161 4.42056 4.81108 4.81108C4.42056 5.20161 4.42056 5.83477 4.81108 6.2253L10.5858 12L4.81114 17.7747C4.42062 18.1652 4.42062 18.7984 4.81114 19.1889C5.20167 19.5794 5.83483 19.5794 6.22535 19.1889L12 13.4142L17.7747 19.1889C18.1652 19.5794 18.7984 19.5794 19.1889 19.1889C19.5794 18.7984 19.5794 18.1652 19.1889 17.7747L13.4142 12L19.189 6.2253C19.5795 5.83477 19.5795 5.20161 19.189 4.81108C18.7985 4.42056 18.1653 4.42056 17.7748 4.81108L12 10.5858L6.2253 4.81108Z",
  },
  "down-line": {
    viewBox: "0 0 20 20",
    path: "M10.5892 13.0892C10.4329 13.2454 10.221 13.3332 10 13.3332C9.77903 13.3332 9.56711 13.2454 9.41083 13.0892L4.69667 8.375C4.61707 8.29813 4.55359 8.20617 4.50992 8.1045C4.46624 8.00283 4.44325 7.89348 4.44229 7.78283C4.44133 7.67218 4.46241 7.56245 4.50432 7.46004C4.54622 7.35762 4.60809 7.26458 4.68634 7.18634C4.76458 7.10809 4.85762 7.04622 4.96004 7.00431C5.06245 6.96241 5.17218 6.94133 5.28283 6.94229C5.39348 6.94325 5.50283 6.96624 5.6045 7.00992C5.70617 7.05359 5.79813 7.11707 5.875 7.19667L10 11.3217L14.125 7.19667C14.2822 7.04487 14.4927 6.96087 14.7112 6.96277C14.9297 6.96467 15.1387 7.05231 15.2932 7.20682C15.4477 7.36132 15.5353 7.57033 15.5372 7.78883C15.5391 8.00733 15.4551 8.21783 15.3033 8.375L10.5892 13.0892Z",
  },
  "filter-2-line": {
    viewBox: "0 0 24 24",
    path: "M14 17C14.2549 17.0003 14.5 17.0979 14.6854 17.2728C14.8707 17.4478 14.9822 17.687 14.9972 17.9414C15.0121 18.1958 14.9293 18.4464 14.7657 18.6418C14.6021 18.8373 14.3701 18.9629 14.117 18.993L14 19H10C9.74512 18.9997 9.49997 18.9021 9.31463 18.7272C9.1293 18.5522 9.01776 18.313 9.00283 18.0586C8.98789 17.8042 9.07067 17.5536 9.23426 17.3582C9.39785 17.1627 9.6299 17.0371 9.883 17.007L10 17H14ZM17 11C17.2652 11 17.5196 11.1054 17.7071 11.2929C17.8946 11.4804 18 11.7348 18 12C18 12.2652 17.8946 12.5196 17.7071 12.7071C17.5196 12.8946 17.2652 13 17 13H7C6.73478 13 6.48043 12.8946 6.29289 12.7071C6.10536 12.5196 6 12.2652 6 12C6 11.7348 6.10536 11.4804 6.29289 11.2929C6.48043 11.1054 6.73478 11 7 11H17ZM20 5C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6C21 6.26522 20.8946 6.51957 20.7071 6.70711C20.5196 6.89464 20.2652 7 20 7H4C3.73478 7 3.48043 6.89464 3.29289 6.70711C3.10536 6.51957 3 6.26522 3 6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5H20Z",
  },
  "home-1-fill": {
    viewBox: "0 0 28 28",
    path: "M12.6 3.09167C13.0039 2.78875 13.4951 2.625 14 2.625C14.5049 2.625 14.9961 2.78875 15.4 3.09167L23.5667 9.21667C23.8565 9.43401 24.0917 9.71584 24.2537 10.0398C24.4157 10.3638 24.5 10.7211 24.5 11.0833V22.1667C24.5 22.7855 24.2542 23.379 23.8166 23.8166C23.379 24.2542 22.7855 24.5 22.1667 24.5H5.83333C5.21449 24.5 4.621 24.2542 4.18342 23.8166C3.74583 23.379 3.5 22.7855 3.5 22.1667V11.0833C3.5 10.7211 3.58434 10.3638 3.74634 10.0398C3.90833 9.71584 4.14354 9.43401 4.43333 9.21667L12.6 3.09167Z",
  },
  "list-check-line": {
    viewBox: "0 0 24 24",
    path: "M8.747 5.336C9.113 5.749 9.075 6.381 8.663 6.747L6.407 8.747C6.018 9.092 5.429 9.079 5.055 8.72L3.305 7.04C2.907 6.658 2.894 6.025 3.276 5.627C3.658 5.229 4.291 5.216 4.689 5.598L5.774 6.64L7.336 5.252C7.749 4.887 8.381 4.924 8.747 5.336ZM11 6C11 5.448 11.448 5 12 5H20C20.552 5 21 5.448 21 6C21 6.552 20.552 7 20 7H12C11.448 7 11 6.552 11 6ZM8.747 11.336C9.113 11.749 9.075 12.381 8.663 12.747L6.407 14.747C6.018 15.092 5.429 15.079 5.055 14.72L3.305 13.04C2.907 12.658 2.894 12.025 3.276 11.627C3.658 11.229 4.291 11.216 4.689 11.598L5.774 12.64L7.336 11.252C7.749 10.887 8.381 10.924 8.747 11.336ZM11 12C11 11.448 11.448 11 12 11H20C20.552 11 21 11.448 21 12C21 12.552 20.552 13 20 13H12C11.448 13 11 12.552 11 12ZM8.747 17.336C9.113 17.749 9.075 18.381 8.663 18.747L6.407 20.747C6.018 21.092 5.429 21.079 5.055 20.72L3.305 19.04C2.907 18.658 2.894 18.025 3.276 17.627C3.658 17.229 4.291 17.216 4.689 17.598L5.774 18.64L7.336 17.252C7.749 16.887 8.381 16.924 8.747 17.336ZM11 18C11 17.448 11.448 17 12 17H20C20.552 17 21 17.448 21 18C21 18.552 20.552 19 20 19H12C11.448 19 11 18.552 11 18Z",
  },
  "search-line": {
    viewBox: "0 0 24 24",
    path: "M10.5 2C9.14459 2.00012 7.80886 2.32436 6.60426 2.94569C5.39965 3.56702 4.36109 4.46742 3.57524 5.57175C2.78938 6.67609 2.27901 7.95235 2.08671 9.29404C1.89441 10.6357 2.02575 12.004 2.46978 13.2846C2.91381 14.5652 3.65765 15.7211 4.63924 16.6557C5.62083 17.5904 6.8117 18.2768 8.11251 18.6576C9.41332 19.0384 10.7863 19.1026 12.117 18.8449C13.4477 18.5872 14.6974 18.015 15.762 17.176L19.414 20.828C19.6026 21.0102 19.8552 21.111 20.1174 21.1087C20.3796 21.1064 20.6304 21.0012 20.8158 20.8158C21.0012 20.6304 21.1064 20.3796 21.1087 20.1174C21.111 19.8552 21.0102 19.6026 20.828 19.414L17.176 15.762C18.164 14.5086 18.7792 13.0024 18.9511 11.4157C19.123 9.82905 18.8448 8.22602 18.1482 6.79009C17.4517 5.35417 16.3649 4.14336 15.0123 3.29623C13.6597 2.44911 12.096 1.99989 10.5 2ZM4 10.5C4 8.77609 4.68482 7.12279 5.90381 5.90381C7.12279 4.68482 8.77609 4 10.5 4C12.2239 4 13.8772 4.68482 15.0962 5.90381C16.3152 7.12279 17 8.77609 17 10.5C17 12.2239 16.3152 13.8772 15.0962 15.0962C13.8772 16.3152 12.2239 17 10.5 17C8.77609 17 7.12279 16.3152 5.90381 15.0962C4.68482 13.8772 4 12.2239 4 10.5Z",
  },
  "settings-1-line": {
    viewBox: "0 0 28 28",
    path: "M12.5417 2.99483C12.9525 2.75755 13.415 2.62407 13.8891 2.60598C14.3632 2.58789 14.8346 2.68572 15.2623 2.891L15.4583 2.99483L22.8013 7.23333C23.2143 7.47167 23.5625 7.80762 23.8156 8.21176C24.0686 8.6159 24.2187 9.0759 24.2527 9.5515L24.2597 9.75917V18.2385C24.2596 18.7152 24.1426 19.1845 23.9191 19.6056C23.6956 20.0266 23.3723 20.3864 22.9775 20.6535L22.8025 20.7643L15.4583 25.004C15.0475 25.2413 14.585 25.3748 14.1109 25.3929C13.6368 25.4109 13.1654 25.3131 12.7377 25.1078L12.5417 25.0028L5.19867 20.7667C4.7857 20.5283 4.43745 20.1924 4.18444 19.7882C3.93142 19.3841 3.78133 18.9241 3.74733 18.4485L3.74033 18.2408V9.76033C3.74057 9.28356 3.85768 8.81412 4.08141 8.3931C4.30514 7.97208 4.62866 7.61233 5.02367 7.34533L5.19867 7.2345L12.5417 2.99483ZM14.2917 5.0155C14.2181 4.97305 14.1361 4.9472 14.0514 4.93974C13.9668 4.93229 13.8816 4.94341 13.8017 4.97233L13.7083 5.0155L6.36533 9.25517C6.29181 9.29766 6.22846 9.3557 6.17969 9.42522C6.13093 9.49474 6.09793 9.57407 6.083 9.65767L6.07367 9.76033V18.2397C6.07375 18.3246 6.09238 18.4085 6.12825 18.4854C6.16412 18.5624 6.21636 18.6306 6.28133 18.6853L6.36533 18.7437L13.7083 22.9845C13.7819 23.0269 13.8639 23.0528 13.9486 23.0603C14.0332 23.0677 14.1184 23.0566 14.1983 23.0277L14.2917 22.9845L21.6347 18.7448C21.7084 18.7025 21.772 18.6445 21.821 18.575C21.8699 18.5054 21.9031 18.426 21.9182 18.3423L21.9263 18.2397V9.76033C21.9264 9.6755 21.9079 9.59168 21.8723 9.51471C21.8366 9.43773 21.7846 9.36947 21.7198 9.31467L21.6347 9.25517L14.2917 5.0155ZM14 9.33333C15.2377 9.33333 16.4247 9.825 17.2998 10.7002C18.175 11.5753 18.6667 12.7623 18.6667 14C18.6667 15.2377 18.175 16.4247 17.2998 17.2998C16.4247 18.175 15.2377 18.6667 14 18.6667C12.7623 18.6667 11.5753 18.175 10.7002 17.2998C9.825 16.4247 9.33333 15.2377 9.33333 14C9.33333 12.7623 9.825 11.5753 10.7002 10.7002C11.5753 9.825 12.7623 9.33333 14 9.33333ZM14 11.6667C13.3812 11.6667 12.7877 11.9125 12.3501 12.3501C11.9125 12.7877 11.6667 13.3812 11.6667 14C11.6667 14.6188 11.9125 15.2123 12.3501 15.6499C12.7877 16.0875 13.3812 16.3333 14 16.3333C14.6188 16.3333 15.2123 16.0875 15.6499 15.6499C16.0875 15.2123 16.3333 14.6188 16.3333 14C16.3333 13.3812 16.0875 12.7877 15.6499 12.3501C15.2123 11.9125 14.6188 11.6667 14 11.6667Z",
  },
  "wallet-2-fill": {
    viewBox: "0 0 16 16",
    path: "M10.46 4.574C10.6213 4.46067 10.7727 4.332 10.902 4.18733C11.1373 3.924 11.3333 3.57067 11.3333 3.14267C11.3333 2.69867 11.122 2.35067 10.8513 2.10733C10.594 1.87533 10.27 1.72267 9.96067 1.61867C9.34 1.40867 8.59467 1.33333 8 1.33333C7.40533 1.33333 6.66 1.40867 6.03933 1.61867C5.73 1.72267 5.406 1.87533 5.14867 2.10733C4.878 2.35067 4.66667 2.69867 4.66667 3.14267C4.66667 3.57067 4.86267 3.924 5.098 4.18667C5.22981 4.33249 5.37814 4.46247 5.54 4.574C3.55 5.52267 2 7.55667 2 10C2 11.704 2.68 12.924 3.844 13.6833C4.96067 14.4113 6.44667 14.6667 8 14.6667C9.55333 14.6667 11.04 14.4113 12.156 13.6833C13.32 12.924 14 11.7033 14 10C14 7.55667 12.45 5.52267 10.46 4.574ZM6.04 3.098C6.02447 3.11127 6.01099 3.12677 6 3.144C6 3.15067 6.00533 3.20133 6.09133 3.298C6.18467 3.40267 6.34133 3.52133 6.55933 3.634C6.99933 3.862 7.56133 4 8 4C8.43867 4 9.00133 3.862 9.44067 3.634C9.65867 3.52133 9.81467 3.40267 9.90867 3.298C9.99467 3.20133 9.99933 3.15133 10 3.144C9.98902 3.12677 9.97554 3.11126 9.96 3.098C9.88933 3.03533 9.75333 2.956 9.534 2.88133C9.098 2.73467 8.51 2.66667 8 2.66667C7.49 2.66667 6.902 2.734 6.466 2.88133C6.246 2.956 6.11 3.03467 6.04 3.098ZM7.59667 7.36867C7.55923 7.28761 7.50589 7.21491 7.43981 7.15486C7.37374 7.09482 7.29627 7.04866 7.21202 7.01912C7.12777 6.98958 7.03844 6.97726 6.94933 6.9829C6.86023 6.98855 6.77317 7.01203 6.69331 7.05195C6.61345 7.09188 6.54243 7.14744 6.48446 7.21534C6.42648 7.28324 6.38274 7.36209 6.35582 7.44722C6.32889 7.53235 6.31935 7.62201 6.32774 7.7109C6.33613 7.79979 6.36229 7.88608 6.40467 7.96467L6.75467 8.66667H6.66667C6.48986 8.66667 6.32029 8.7369 6.19526 8.86193C6.07024 8.98695 6 9.15652 6 9.33333C6 9.51014 6.07024 9.67971 6.19526 9.80474C6.32029 9.92976 6.48986 10 6.66667 10H7.33333V10.3333H6.66667C6.48986 10.3333 6.32029 10.4036 6.19526 10.5286C6.07024 10.6536 6 10.8232 6 11C6 11.1768 6.07024 11.3464 6.19526 11.4714C6.32029 11.5964 6.48986 11.6667 6.66667 11.6667H7.33333V12C7.33333 12.1768 7.40357 12.3464 7.5286 12.4714C7.65362 12.5964 7.82319 12.6667 8 12.6667C8.17681 12.6667 8.34638 12.5964 8.4714 12.4714C8.59643 12.3464 8.66667 12.1768 8.66667 12V11.6667H9.33333C9.51014 11.6667 9.67971 11.5964 9.80474 11.4714C9.92976 11.3464 10 11.1768 10 11C10 10.8232 9.92976 10.6536 9.80474 10.5286C9.67971 10.4036 9.51014 10.3333 9.33333 10.3333H8.66667V10H9.33333C9.51014 10 9.67971 9.92976 9.80474 9.80474C9.92976 9.67971 10 9.51014 10 9.33333C10 9.15652 9.92976 8.98695 9.80474 8.86193C9.67971 8.7369 9.51014 8.66667 9.33333 8.66667H9.24533L9.596 7.96467C9.63838 7.88608 9.66454 7.79979 9.67293 7.7109C9.68132 7.62201 9.67177 7.53235 9.64485 7.44722C9.61793 7.36209 9.57418 7.28324 9.51621 7.21534C9.45823 7.14744 9.38721 7.09188 9.30736 7.05195C9.2275 7.01203 9.14044 6.98855 9.05133 6.9829C8.96223 6.97726 8.8729 6.98958 8.78865 7.01912C8.70439 7.04866 8.62693 7.09482 8.56086 7.15486C8.49478 7.21491 8.44144 7.28761 8.404 7.36867L8 8.17533L7.59667 7.36867Z",
  },
  "wallet-5-fill": {
    viewBox: "0 0 16 16",
    path: "M1.33333 4.66667C1.33333 4.13623 1.54405 3.62753 1.91912 3.25245C2.29419 2.87738 2.8029 2.66667 3.33333 2.66667H12.6667C13.1971 2.66667 13.7058 2.87738 14.0809 3.25245C14.456 3.62753 14.6667 4.13623 14.6667 4.66667V11.3333C14.6667 11.8638 14.456 12.3725 14.0809 12.7475C13.7058 13.1226 13.1971 13.3333 12.6667 13.3333H3.33333C2.8029 13.3333 2.29419 13.1226 1.91912 12.7475C1.54405 12.3725 1.33333 11.8638 1.33333 11.3333V4.66667ZM3.33333 4.66667C3.15652 4.66667 2.98695 4.7369 2.86193 4.86193C2.7369 4.98695 2.66667 5.15652 2.66667 5.33333C2.66667 5.51014 2.7369 5.67971 2.86193 5.80474C2.98695 5.92976 3.15652 6 3.33333 6H12.6667C12.8435 6 13.013 5.92976 13.1381 5.80474C13.2631 5.67971 13.3333 5.51014 13.3333 5.33333C13.3333 5.15652 13.2631 4.98695 13.1381 4.86193C13.013 4.7369 12.8435 4.66667 12.6667 4.66667H3.33333ZM2.66667 8.66667C2.66667 8.48986 2.7369 8.32029 2.86193 8.19526C2.98695 8.07024 3.15652 8 3.33333 8H6C6.01867 8 6.03733 8.00067 6.056 8.00267C6.20326 7.98978 6.35063 8.02621 6.47493 8.10622C6.59923 8.18623 6.69341 8.30529 6.74267 8.44467C6.83478 8.7045 7.00512 8.92941 7.23027 9.08847C7.45542 9.24754 7.72433 9.33294 8 9.33294C8.27567 9.33294 8.54457 9.24754 8.76973 9.08847C8.99488 8.92941 9.16522 8.7045 9.25733 8.44467C9.30659 8.30529 9.40077 8.18623 9.52507 8.10622C9.64937 8.02621 9.79674 7.98978 9.944 8.00267C9.962 8 9.98133 8 10 8H12.6667C12.8435 8 13.013 8.07024 13.1381 8.19526C13.2631 8.32029 13.3333 8.48986 13.3333 8.66667C13.3333 8.84348 13.2631 9.01305 13.1381 9.13807C13.013 9.26309 12.8435 9.33333 12.6667 9.33333H10.3093C10.0754 9.7388 9.73879 10.0755 9.3334 10.3096C8.928 10.5436 8.46811 10.6668 8 10.6667C7.53177 10.6669 7.07175 10.5438 6.66622 10.3097C6.2607 10.0757 5.924 9.7389 5.69 9.33333H3.33333C3.15652 9.33333 2.98695 9.26309 2.86193 9.13807C2.7369 9.01305 2.66667 8.84348 2.66667 8.66667Z",
  },
  "wallet-5-line": {
    viewBox: "0 0 28 28",
    path: "M5.83333 4.66667C4.90508 4.66667 4.01484 5.03542 3.35846 5.69179C2.70208 6.34817 2.33333 7.23841 2.33333 8.16667V19.8333C2.33333 20.7616 2.70208 21.6518 3.35846 22.3082C4.01484 22.9646 4.90508 23.3333 5.83333 23.3333H22.1667C23.0949 23.3333 23.9852 22.9646 24.6415 22.3082C25.2979 21.6518 25.6667 20.7616 25.6667 19.8333V8.16667C25.6667 7.23841 25.2979 6.34817 24.6415 5.69179C23.9852 5.03542 23.0949 4.66667 22.1667 4.66667H5.83333ZM23.3333 9.53167V8.16667C23.3333 7.85725 23.2104 7.5605 22.9916 7.34171C22.7728 7.12292 22.4761 7 22.1667 7H5.83333C5.52391 7 5.22717 7.12292 5.00838 7.34171C4.78958 7.5605 4.66667 7.85725 4.66667 8.16667V9.53167C5.03183 9.40333 5.425 9.33333 5.83333 9.33333H22.1667C22.575 9.33333 22.9682 9.40333 23.3333 9.53167ZM4.66667 12.8333V14H10.5C10.5327 14 10.5653 14.0012 10.598 14.0047C10.8557 13.9821 11.1136 14.0459 11.3311 14.1859C11.5487 14.3259 11.7135 14.5343 11.7997 14.7782C11.9609 15.2329 12.259 15.6265 12.653 15.9048C13.047 16.1832 13.5176 16.3327 14 16.3327C14.4824 16.3327 14.953 16.1832 15.347 15.9048C15.741 15.6265 16.0391 15.2329 16.2003 14.7782C16.2865 14.5343 16.4513 14.3259 16.6689 14.1859C16.8864 14.0459 17.1443 13.9821 17.402 14.0047C17.4335 14 17.4673 14 17.5 14H23.3333V12.8333C23.3333 12.5239 23.2104 12.2272 22.9916 12.0084C22.7728 11.7896 22.4761 11.6667 22.1667 11.6667H5.83333C5.52391 11.6667 5.22717 11.7896 5.00838 12.0084C4.78958 12.2272 4.66667 12.5239 4.66667 12.8333ZM18.0425 16.3333C17.633 17.0431 17.0438 17.6324 16.3341 18.042C15.6244 18.4516 14.8194 18.6671 14 18.6667C13.1806 18.6671 12.3756 18.4516 11.6659 18.042C10.9562 17.6324 10.367 17.0431 9.9575 16.3333H4.66667V19.8333C4.66667 20.1428 4.78958 20.4395 5.00838 20.6583C5.22717 20.8771 5.52391 21 5.83333 21H22.1667C22.4761 21 22.7728 20.8771 22.9916 20.6583C23.2104 20.4395 23.3333 20.1428 23.3333 19.8333V16.3333H18.0425Z",
  },
};

function formatSelectedCurrencyName(name: string) {
  return name
    .split(" ")
    .map((word) => {
      if (word === word.toUpperCase()) {
        return word;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

let appSplashDone = false;
let cachedHomeCurrency: Currency | null = null;
let cachedWeekStartIndex = 1; // Monday default

export default function AppEntryScreen() {
  const [isShowingSplash, setIsShowingSplash] = useState(!appSplashDone);
  const [homeCurrency, setHomeCurrency] = useState<Currency | null>(cachedHomeCurrency);
  const [weekStartIndex, setWeekStartIndex] = useState(cachedWeekStartIndex);

  useEffect(() => {
    let isMounted = true;

    const currencyLoad = AsyncStorage.getItem(HOME_CURRENCY_KEY)
      .then((saved) =>
        saved ? (currencies.find((c) => c.code === saved) ?? null) : null,
      )
      .catch(() => null);

    const weekStartLoad = AsyncStorage.getItem(WEEK_START_KEY)
      .then((day) => (day ? WEEK_DAY_NAMES.indexOf(day) : -1))
      .catch(() => -1);

    if (appSplashDone) {
      Promise.all([currencyLoad, weekStartLoad]).then(([currency, idx]) => {
        if (isMounted) {
          cachedHomeCurrency = currency;
          setHomeCurrency(currency);
          if (idx >= 0) { cachedWeekStartIndex = idx; setWeekStartIndex(idx); }
        }
      });
    } else {
      const splashTimer = new Promise<void>((resolve) =>
        setTimeout(resolve, SPLASH_DURATION_MS),
      );
      Promise.all([splashTimer, currencyLoad, weekStartLoad]).then(([, currency, idx]) => {
        if (isMounted) {
          appSplashDone = true;
          cachedHomeCurrency = currency;
          setHomeCurrency(currency);
          if (idx >= 0) { cachedWeekStartIndex = idx; setWeekStartIndex(idx); }
          setIsShowingSplash(false);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!appSplashDone) return;
      AsyncStorage.getItem(HOME_CURRENCY_KEY)
        .then((code) => {
          if (!code) return;
          const found = currencies.find((c) => c.code === code);
          if (found && found.code !== cachedHomeCurrency?.code) {
            cachedHomeCurrency = found;
            setHomeCurrency(found);
          }
        })
        .catch(() => {});
      AsyncStorage.getItem(WEEK_START_KEY)
        .then((day) => {
          if (!day) return;
          const idx = WEEK_DAY_NAMES.indexOf(day);
          if (idx >= 0 && idx !== cachedWeekStartIndex) {
            cachedWeekStartIndex = idx;
            setWeekStartIndex(idx);
          }
        })
        .catch(() => {});
    }, []),
  );

  const handleCurrencySelected = useCallback((currency: Currency) => {
    cachedHomeCurrency = currency;
    setHomeCurrency(currency);
    AsyncStorage.setItem(HOME_CURRENCY_KEY, currency.code).catch(() => {});
  }, []);

  if (isShowingSplash) {
    return <FirstLaunchSplashScreen />;
  }

  if (homeCurrency) {
    return <HomeEmptyListScreen currency={homeCurrency} weekStartIndex={weekStartIndex} />;
  }

  return <CurrencySetupContent onComplete={handleCurrencySelected} />;
}

function FirstLaunchSplashScreen() {
  return (
    <View style={styles.introSplash}>
      <StatusBar style="light" />
      <Image
        resizeMode="contain"
        source={require("../assets/images/splash-screen-logo.png")}
        style={styles.introLogo}
      />
    </View>
  );
}

function CurrencySetupContent({
  onComplete,
}: {
  onComplete: (currency: Currency) => void;
}) {
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(
    null,
  );
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);

  const currencyLabel = selectedCurrency
    ? `${formatSelectedCurrencyName(selectedCurrency.name)} (${selectedCurrency.code})`
    : "e.g Canadian dollar (CAD)";

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        <Text style={styles.title}>My currency is</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick a currency"
          onPress={() => setIsCurrencyPickerOpen(true)}
          style={[
            styles.currencyPill,
            selectedCurrency && styles.currencyPillSelected,
          ]}
        >
          {selectedCurrency ? (
            <View style={styles.selectedFlag}>
              <Text allowFontScaling={false} style={styles.selectedFlagEmoji}>
                {selectedCurrency.flag}
              </Text>
            </View>
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.currencyExample,
              selectedCurrency && styles.currencyExampleSelected,
            ]}
          >
            {currencyLabel}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue to home"
          disabled={!selectedCurrency}
          onPress={() => {
            if (selectedCurrency) {
              onComplete(selectedCurrency);
            }
          }}
          style={[
            styles.continueButton,
            selectedCurrency && styles.continueButtonSelected,
          ]}
        >
          <Text
            style={[
              styles.continueText,
              selectedCurrency && styles.continueTextSelected,
            ]}
          >
            Continue
          </Text>
        </Pressable>
      </View>

      <CurrencyPicker
        onClose={() => setIsCurrencyPickerOpen(false)}
        onSelectCurrency={(currency) => {
          setSelectedCurrency(currency);
          setIsCurrencyPickerOpen(false);
        }}
        visible={isCurrencyPickerOpen}
      />
    </SafeAreaView>
  );
}

function HomeEmptyListScreen({ currency, weekStartIndex }: { currency: Currency; weekStartIndex: number }) {
  const router = useRouter();
  const { deletedType, recorded } = useLocalSearchParams<{
    deletedType?: Transaction["type"];
    recorded?: string;
  }>();
  const [isCalendarView, setIsCalendarView] = useState(false);
  const [isMonthYearPickerOpen, setIsMonthYearPickerOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(
    null,
  );
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const currencySymbol = currencySymbols[currency.code] ?? currency.code;
  const selectedMonthLabel = formatMonthYearLabel(selectedMonth);

  const loadTransactions = useCallback(() => {
    return AsyncStorage.getItem(TRANSACTIONS_KEY)
      .then((data) => { if (data) setTransactions(JSON.parse(data) as Transaction[]); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions, recorded]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadTransactions().finally(() => setIsRefreshing(false));
  }, [loadTransactions]);

  const handleDeleteTransaction = useCallback(
    async (transaction: Transaction) => {
      const originalIndex = transactions.findIndex(
        (item) => item.id === transaction.id,
      );
      if (originalIndex < 0) return;

      const nextTransactions = transactions.filter(
        (item) => item.id !== transaction.id,
      );
      setTransactions(nextTransactions);
      setPendingDeletion({
        dateSection: transaction.date.slice(0, 10),
        id: Date.now(),
        originalIndex,
        transaction,
      });

      try {
        await AsyncStorage.setItem(
          TRANSACTIONS_KEY,
          JSON.stringify(nextTransactions),
        );
      } catch {
        setTransactions(transactions);
        setPendingDeletion(null);
      }
    },
    [transactions],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!pendingDeletion) return;

    const restoredTransactions = [
      ...transactions.slice(0, pendingDeletion.originalIndex),
      pendingDeletion.transaction,
      ...transactions.slice(pendingDeletion.originalIndex),
    ];
    setTransactions(restoredTransactions);
    setPendingDeletion(null);

    try {
      await AsyncStorage.setItem(
        TRANSACTIONS_KEY,
        JSON.stringify(restoredTransactions),
      );
    } catch {
      setTransactions(transactions);
    }
  }, [pendingDeletion, transactions]);

  useEffect(() => {
    if (recorded === "1" || recorded === "deleted" || recorded === "saved") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [deletedType, recorded]);

  useFocusEffect(
    useCallback(() => {
      const msg = useUIStore.getState().pendingToast;
      if (!msg) return;
      useUIStore.getState().setPendingToast(null);
      setToastMessage(msg);
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(t);
    }, []),
  );

  useEffect(() => {
    if (!pendingDeletion) return;
    const timeout = setTimeout(() => setPendingDeletion(null), 5000);
    return () => clearTimeout(timeout);
  }, [pendingDeletion]);

  useEffect(() => {
    const hasForeign = transactions.some((tx) => tx.currencyCode !== currency.code);
    if (!hasForeign) return;
    fetchExchangeRates(currency.code)
      .then(setExchangeRates)
      .catch(() => {});
  }, [transactions, currency.code]);

  const monthTransactions = useMemo(() =>
    transactions.filter((tx) => {
      const d = new Date(tx.date);
      return d.getFullYear() === selectedMonth.getFullYear() &&
        d.getMonth() === selectedMonth.getMonth();
    }),
    [transactions, selectedMonth],
  );

  const { incomeCents, expenseCents, netCents } = useMemo(() => {
    let inc = 0, exp = 0;
    for (const tx of monthTransactions) {
      const cents = convertCents(tx.amountCents, tx.currencyCode, currency.code, exchangeRates);
      if (tx.type === "income") inc += cents;
      else if (tx.type === "expense") exp += cents;
    }
    return { incomeCents: inc, expenseCents: exp, netCents: inc - exp };
  }, [monthTransactions, exchangeRates, currency.code]);

  const lastMonthNetCents = useMemo(() => {
    const prev = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
    const prevTxs = transactions.filter((tx) => {
      const d = new Date(tx.date);
      return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
    });
    if (prevTxs.length === 0) return null;
    let inc = 0, exp = 0;
    for (const tx of prevTxs) {
      const cents = convertCents(tx.amountCents, tx.currencyCode, currency.code, exchangeRates);
      if (tx.type === "income") inc += cents;
      else if (tx.type === "expense") exp += cents;
    }
    return inc - exp;
  }, [transactions, selectedMonth, exchangeRates, currency.code]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of monthTransactions) {
      const key = localDateKey(tx.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    }
    return Array.from(map.entries())
      .map(([dateKey, txs]) => ({
        dateKey,
        date: localDateFromKey(dateKey),
        transactions: txs,
        netCents: txs.reduce((s, tx) => {
          const cents = convertCents(tx.amountCents, tx.currencyCode, currency.code, exchangeRates);
          return tx.type === "income" ? s + cents : tx.type === "expense" ? s - cents : s;
        }, 0),
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [monthTransactions, exchangeRates, currency.code]);

  const netAbsCents = Math.abs(netCents);
  const netWhole = `${netCents < 0 ? "−" : ""}${currencySymbol}${Math.floor(netAbsCents / 100).toLocaleString()}.`;
  const netFrac = String(netAbsCents % 100).padStart(2, "0");

  const vsLastMonth = useMemo(() => {
    if (lastMonthNetCents === null || lastMonthNetCents === 0) return null;
    const pct = Math.round(((netCents - lastMonthNetCents) / Math.abs(lastMonthNetCents)) * 100);
    return { pct, up: pct >= 0 };
  }, [netCents, lastMonthNetCents]);

  return (
    <SafeAreaView edges={["top"]} style={styles.homeScreen}>
      <StatusBar style="dark" />

      <View style={styles.homeHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select month"
          onPress={() => setIsMonthYearPickerOpen(true)}
          style={styles.monthSelector}
        >
          <Text style={styles.monthText}>{selectedMonthLabel}</Text>
          <MingCuteIcon
            color={figmaColors.grayNeutral["600"]}
            name="down-line"
            size={20}
          />
        </Pressable>

        <View style={styles.headerActions}>
          <HeaderIcon accessibilityLabel="Search entries" name="search-line" onPress={() => setIsSearchOpen(true)} />
          <HeaderIcon
            accessibilityLabel={
              isCalendarView ? "Show list layout" : "Show calendar layout"
            }
            name={isCalendarView ? "list-check-line" : "calendar-2-line"}
            onPress={() => setIsCalendarView((current) => !current)}
          />
          <HeaderIcon accessibilityLabel="Filter entries" name="filter-2-line" />
        </View>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.netTotalBlock}>
          <Text style={styles.netTotalLabel}>Net Total</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountWhole}>{netWhole}</Text>
            <Text style={styles.amountCents}>{netFrac}</Text>
          </View>
          {vsLastMonth === null ? (
            <Text style={styles.monthComparison}>-- vs last month</Text>
          ) : (
            <View style={styles.monthComparisonRow}>
              <Svg fill="none" height={16} viewBox="0 0 16 16" width={16}>
                <Path
                  d={vsLastMonth.up
                    ? "M2 12 L6 7 L9 10 L14 4M14 4H10M14 4V8"
                    : "M2 4 L6 9 L9 6 L14 12M14 12H10M14 12V8"}
                  stroke={vsLastMonth.up ? figmaColors.success["600"] : figmaColors.error["600"]}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                />
              </Svg>
              <Text style={[styles.monthComparison, { color: vsLastMonth.up ? figmaColors.success["600"] : figmaColors.error["600"] }]}>
                {Math.abs(vsLastMonth.pct).toLocaleString()}%
              </Text>
              <Text style={[styles.monthComparison, { color: figmaColors.grayNeutral["900"] }]}>
                {" vs last month"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.transactionSummaryRow}>
          <TransactionSummary
            accentColor={figmaColors.success["700"]}
            icon="wallet-2-fill"
            label="Income"
            value={formatCents(incomeCents, currencySymbol)}
          />
          <View style={styles.transactionSummaryDivider} />
          <TransactionSummary
            accentColor={figmaColors.error["700"]}
            icon="wallet-5-fill"
            label="Expense"
            value={formatCents(expenseCents, currencySymbol)}
          />
        </View>
      </View>

      {isCalendarView ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <CalendarMonthGrid
            currencyCode={currency.code}
            exchangeRates={exchangeRates}
            monthTransactions={monthTransactions}
            selectedMonth={selectedMonth}
            weekStartIndex={weekStartIndex}
          />
        </ScrollView>
      ) : monthTransactions.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <EmptyLogState />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.txListContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
          style={styles.txList}
        >
          {dayGroups.map((group) => (
            <View key={group.dateKey}>
              <DateGroupHeader
                currencySymbol={currencySymbol}
                date={group.date}
                netCents={group.netCents}
              />
              {group.transactions.map((tx) => (
                <TransactionRow
                  currencyCode={currency.code}
                  currencySymbol={currencySymbol}
                  exchangeRates={exchangeRates}
                  key={tx.id}
                  onPress={() =>
                    router.push({
                      pathname: "/add-entry",
                      params: { transactionId: tx.id },
                    })
                  }
                  onDelete={() => handleDeleteTransaction(tx)}
                  transaction={tx}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        onPress={() => router.push("/add-entry")}
        style={styles.addButton}
      >
        <MingCuteIcon
          color={figmaColors.base.white}
          name="add-fill"
          size={28}
        />
      </Pressable>

      <View onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)} style={[styles.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        {homeTabs.map((tab, index) => {
          const isActive = index === 0;
          return (
            <Pressable
              key={tab.label}
              onPress={() => {
                if (tab.label === "Settings") router.push("/settings");
              }}
              style={styles.tabBarItem}
            >
              <MingCuteIcon
                color={isActive ? figmaColors.blue["500"] : figmaColors.grayNeutral["400"]}
                name={tab.icon}
                size={26}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <MonthYearPicker
        onClose={() => setIsMonthYearPickerOpen(false)}
        onSelectMonth={(month) => setSelectedMonth(month)}
        selectedMonth={selectedMonth}
        visible={isMonthYearPickerOpen}
      />

      <ToastNotification
        bottomOffset={tabBarHeight + 8}
        message={
          toastMessage && !pendingDeletion && recorded !== "deleted" && recorded !== "1" && recorded !== "saved"
            ? toastMessage
            : pendingDeletion || recorded === "deleted"
              ? `Your ${pendingDeletion?.transaction.type ?? deletedType ?? "transaction"} has been deleted`
              : recorded === "saved"
                ? "Transaction saved"
                : transactions[0]?.type === "income"
                  ? "Your income has been recorded"
                  : transactions[0]?.type === "transfer"
                    ? "Your transfer has been recorded"
                    : "Your expense has been recorded"
        }
        onAction={pendingDeletion ? handleUndoDelete : undefined}
        variant={pendingDeletion || recorded === "deleted" ? "destructive" : "default"}
        visible={showToast || pendingDeletion !== null}
      />

      <SearchOverlay
        currencyCode={currency.code}
        currencySymbol={currencySymbol}
        exchangeRates={exchangeRates}
        onClose={() => { setIsSearchOpen(false); setSearchQuery(""); }}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        transactions={transactions}
        visible={isSearchOpen}
      />
    </SafeAreaView>
  );
}

function SearchOverlay({
  currencyCode,
  currencySymbol,
  exchangeRates,
  onClose,
  onQueryChange,
  query,
  transactions,
  visible,
}: {
  currencyCode: string;
  currencySymbol: string;
  exchangeRates: Record<string, number>;
  onClose: () => void;
  onQueryChange: (q: string) => void;
  query: string;
  transactions: Transaction[];
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? transactions.filter(
          (tx) => tx.description.toLowerCase().includes(q),
        )
      : [];
    const map = new Map<string, Transaction[]>();
    for (const tx of matched) {
      const key = localDateKey(tx.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    }
    return Array.from(map.entries())
      .map(([dateKey, txs]) => ({
        dateKey,
        date: localDateFromKey(dateKey),
        transactions: txs,
        netCents: txs.reduce((s, tx) => {
          const cents = convertCents(tx.amountCents, tx.currencyCode, currencyCode, exchangeRates);
          return tx.type === "income" ? s + cents : tx.type === "expense" ? s - cents : s;
        }, 0),
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [query, transactions, currencyCode, exchangeRates]);

  if (!visible) return null;

  return (
    <View style={[styles.searchOverlay, { paddingTop: insets.top }]}>
      <View style={styles.searchBar}>
        <View style={styles.searchInputRow}>
          <MingCuteIcon color={figmaColors.grayNeutral["400"]} name="search-line" size={18} />
          <TextInput
            ref={inputRef}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onQueryChange}
            placeholder="Search entry by note"
            placeholderTextColor={figmaColors.grayNeutral["400"]}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {query.length > 0 && (
            <Pressable hitSlop={8} onPress={() => onQueryChange("")} style={styles.searchClearBtn}>
              <MingCuteIcon color={figmaColors.base.white} name="close-line" size={12} />
            </Pressable>
          )}
        </View>
        <Pressable hitSlop={10} onPress={onClose}>
          <Text style={styles.searchCancel}>Cancel</Text>
        </Pressable>
      </View>

      {query.trim().length > 0 && dayGroups.length === 0 ? (
        <View style={styles.searchEmptyState}>
          <Svg fill="none" height={80} viewBox="0 0 79 80" width={79}>
            <Defs>
              <ClipPath id="logEmptyClip">
                <Rect fill="white" height={80} width={79} />
              </ClipPath>
            </Defs>
            <G clipPath="url(#logEmptyClip)">
              <Path d="M71.0805 14.6487H9.45502C8.62362 14.6492 7.82642 14.9839 7.23853 15.5792C6.65064 16.1745 6.32014 16.9818 6.31963 17.8238V75.0815C6.32014 75.9234 6.65064 76.7307 7.23853 77.326C7.82642 77.9213 8.62362 78.256 9.45502 78.2565H71.0805C71.912 78.2561 72.7093 77.9215 73.2972 77.3261C73.8852 76.7308 74.2157 75.9234 74.2162 75.0815V17.8238C74.2157 16.9818 73.8852 16.1744 73.2972 15.5791C72.7093 14.9838 71.912 14.6491 71.0805 14.6487Z" fill="#D2D6DB" />
              <Path d="M67.0237 58.3598H13.5126C11.781 58.3598 10.3772 56.9382 10.3772 55.1848V4.59459C10.3772 2.84115 11.781 1.41951 13.5126 1.41951H67.0237C68.7553 1.41951 70.1591 2.84115 70.1591 4.59459V55.1848C70.1591 56.9382 68.7553 58.3598 67.0237 58.3598Z" fill="#E5E7EB" />
              <Path d="M11.3698 56.1897V5.59983C11.3698 3.84639 12.7737 2.42475 14.5052 2.42475H68.0164C68.628 2.42475 69.1966 2.60475 69.6787 2.91131C69.1244 2.01623 68.144 1.41951 67.0237 1.41951H13.5126C11.781 1.41951 10.3772 2.84115 10.3772 4.59459V55.1847C10.3772 56.3195 10.9664 57.312 11.8503 57.8736C11.5476 57.3851 11.3698 56.8093 11.3698 56.19V56.1897Z" fill="white" />
              <Path d="M60.4397 12.1084H20.0969V14.4366H60.4397V12.1084ZM60.4397 20.9983H20.0969V23.3265H60.4397V20.9983ZM60.4397 29.8901H20.0969V32.2183H60.4397V29.8901ZM60.4397 38.7799H20.0969V41.1084H60.4397V38.7799Z" fill="white" />
              <Path d="M24.9045 31.2652L35.042 41.5314H24.9045V31.2652Z" fill="#D2D6DB" />
              <Path d="M74.2164 42.3782V18.7575L70.1593 14.6487V42.3779H74.2164V42.3782Z" fill="#D2D6DB" />
              <Path d="M78.9686 44.5148L74.5974 75.8498C74.3788 77.4164 73.0549 78.5807 71.4927 78.5807H9.04323C7.48104 78.5807 6.15714 77.4164 5.9386 75.8498L0.0314057 33.5085C-0.235057 31.597 1.22968 29.8892 3.13604 29.8892H22.4218C23.9839 29.8892 25.3078 31.0534 25.5264 32.6197L26.3005 38.1646C26.5191 39.7311 27.843 40.8954 29.4052 40.8954H75.8646C77.7703 40.8954 79.2354 42.6033 78.9689 44.5148H78.9686Z" fill="#D2D6DB" />
              <Path d="M63.4808 64.6039H17.0557C16.8012 64.6038 16.5555 64.5098 16.3646 64.3394C16.1737 64.169 16.0507 63.934 16.0187 63.6784L15.4378 59.0213C15.4194 58.8723 15.4324 58.7211 15.4761 58.5776C15.5197 58.4341 15.593 58.3017 15.6911 58.1891C15.7892 58.0764 15.9098 57.9862 16.0449 57.9244C16.18 57.8626 16.3266 57.8306 16.4749 57.8305H64.0617C64.2099 57.8306 64.3565 57.8626 64.4916 57.9244C64.6267 57.9862 64.7473 58.0764 64.8454 58.1891C64.9435 58.3017 65.0168 58.4341 65.0604 58.5776C65.1041 58.7211 65.1172 58.8723 65.0987 59.0213L64.5179 63.6784C64.4858 63.934 64.3628 64.169 64.1719 64.3394C63.981 64.5098 63.7353 64.6038 63.4808 64.6039Z" fill="#F9FAFB" />
            </G>
          </Svg>
          <Text style={styles.searchEmptyTitle}>No entries found</Text>
          <Text style={styles.searchEmptySubtitle}>Try a different search query!</Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.searchResults}
          showsVerticalScrollIndicator={false}
        >
          {dayGroups.map((group) => (
            <View key={group.dateKey}>
              <DateGroupHeader
                currencySymbol={currencySymbol}
                date={group.date}
                netCents={group.netCents}
              />
              {group.transactions.map((tx) => (
                <TransactionRow
                  currencyCode={currencyCode}
                  currencySymbol={currencySymbol}
                  exchangeRates={exchangeRates}
                  key={tx.id}
                  onPress={() =>
                    router.push({
                      pathname: "/add-entry",
                      params: { transactionId: tx.id },
                    })
                  }
                  transaction={tx}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function EmptyLogState() {
  return (
    <View style={styles.emptyStateContainer}>
      <EmptyLogIllustration />
      <Text style={styles.emptyTitle}>Your Log Is Empty</Text>
      <Text style={styles.emptyDescription}>
        Press the plus button to{"\n"}add your first entry
      </Text>
    </View>
  );
}

function DateGroupHeader({
  currencySymbol,
  date,
  netCents,
}: {
  currencySymbol: string;
  date: Date;
  netCents: number;
}) {
  const label = format(date, "EEE, d MMM");
  const sign = netCents >= 0 ? "+" : "−";
  return (
    <View style={styles.dateGroupHeader}>
      <Text style={styles.dateGroupLabel}>{label}</Text>
      <Text style={styles.dateGroupNet}>
        {sign}{formatCents(Math.abs(netCents), currencySymbol)}
      </Text>
    </View>
  );
}

function TransactionRow({
  currencyCode,
  currencySymbol,
  exchangeRates,
  onDelete,
  onPress,
  transaction,
}: {
  currencyCode: string;
  currencySymbol: string;
  exchangeRates: Record<string, number>;
  onDelete?: () => void;
  onPress: () => void;
  transaction: Transaction;
}) {
  const isIncome = transaction.type === "income";
  const isTransfer = transaction.type === "transfer";
  const amountColor = isIncome
    ? figmaColors.success["600"]
    : isTransfer
      ? figmaColors.grayNeutral["600"]
      : figmaColors.error["600"];
  const prefix = isIncome ? "+" : isTransfer ? "" : "−";
  const bgColor = transaction.categoryColor ?? categoryColor(transaction.categoryName);
  const title = transaction.description.trim() || transaction.categoryName;
  const displayCents = convertCents(transaction.amountCents, transaction.currencyCode, currencyCode, exchangeRates);
  const [isDeleteActionExposed, setIsDeleteActionExposed] = useState(false);
  const rowWidth = useSharedValue(0);
  const rowHeight = useSharedValue(-1);
  const translateX = useSharedValue(0);
  const containerOpacity = useSharedValue(1);
  const swipeStartX = useSharedValue(0);
  const thresholdHapticTriggered = useSharedValue(false);
  const deleteScalePop = useSharedValue(1);

  const closeDeleteAction = useCallback(() => {
    translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
    setIsDeleteActionExposed(false);
  }, [translateX]);

  const completeDeletion = useCallback(() => {
    if (!onDelete) return;

    setIsDeleteActionExposed(false);
    translateX.value = withTiming(-rowWidth.value, { duration: 180 }, (finished) => {
      if (!finished) return;
      containerOpacity.value = withTiming(0, { duration: 120 });
      rowHeight.value = withTiming(0, { duration: 200 }, (collapsed) => {
        if (collapsed) runOnJS(onDelete)();
      });
    });
  }, [containerOpacity, onDelete, rowHeight, rowWidth, translateX]);

  const handlePress = useCallback(() => {
    if (isDeleteActionExposed) {
      closeDeleteAction();
      return;
    }
    onPress();
  }, [closeDeleteAction, isDeleteActionExposed, onPress]);

  const handleRowLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number; width: number } } }) => {
      rowWidth.value = event.nativeEvent.layout.width;
      if (rowHeight.value < 0) {
        rowHeight.value = event.nativeEvent.layout.height;
      }
    },
    [rowHeight, rowWidth],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Boolean(onDelete))
        .activeOffsetX(-10)
        .failOffsetY([-12, 12])
        .onBegin(() => {
          swipeStartX.value = translateX.value;
          thresholdHapticTriggered.value = false;
          deleteScalePop.value = 1;
        })
        .onUpdate((event) => {
          const nextX = Math.min(
            0,
            Math.max(-rowWidth.value, swipeStartX.value + event.translationX),
          );
          translateX.value = nextX;

          const fullDeleteThreshold = rowWidth.value * SWIPE_FULL_DELETE_PERCENT;
          const isPastThreshold = -nextX >= fullDeleteThreshold;

          if (isPastThreshold && !thresholdHapticTriggered.value) {
            thresholdHapticTriggered.value = true;
            deleteScalePop.value = withSpring(1.18, { damping: 10, stiffness: 380 });
            runOnJS(triggerDeleteThresholdHaptic)();
          } else if (!isPastThreshold && thresholdHapticTriggered.value) {
            thresholdHapticTriggered.value = false;
            deleteScalePop.value = withSpring(1, { damping: 15, stiffness: 300 });
          }
        })
        .onEnd((event) => {
          const partialRevealThreshold =
            rowWidth.value * SWIPE_PARTIAL_REVEAL_PERCENT;
          const fullDeleteThreshold =
            rowWidth.value * SWIPE_FULL_DELETE_PERCENT;
          const shouldDelete =
            -translateX.value >= fullDeleteThreshold ||
            event.velocityX <= SWIPE_FULL_DELETE_FLING_VELOCITY;

          if (shouldDelete) {
            runOnJS(completeDeletion)();
            return;
          }

          if (-translateX.value >= partialRevealThreshold) {
            translateX.value = withSpring(-SWIPE_DELETE_REVEAL_WIDTH, {
              damping: 20,
              stiffness: 220,
            });
            runOnJS(setIsDeleteActionExposed)(true);
            return;
          }

          translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
          deleteScalePop.value = withSpring(1, { damping: 15, stiffness: 300 });
          runOnJS(setIsDeleteActionExposed)(false);
        })
        .onFinalize(() => {
          if (translateX.value === 0) {
            runOnJS(setIsDeleteActionExposed)(false);
          }
        }),
    [
      completeDeletion,
      deleteScalePop,
      rowWidth,
      swipeStartX,
      thresholdHapticTriggered,
      translateX,
    ],
  );

  const rowStyle = useAnimatedStyle(() => ({
    height: rowHeight.value > 0 ? rowHeight.value : undefined,
    opacity: containerOpacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const deleteActionStyle = useAnimatedStyle(() => {
    const fullDeleteThreshold =
      rowWidth.value * SWIPE_FULL_DELETE_PERCENT || 1;
    const progress = Math.min(1, Math.max(0, -translateX.value / fullDeleteThreshold));
    return {
      opacity: containerOpacity.value * (0.35 + progress * 0.65),
      transform: [{ scale: (0.84 + progress * 0.16) * deleteScalePop.value }],
    };
  });

  return (
    <View style={styles.txSwipeRow}>
      {onDelete ? (
        <Reanimated.View style={[styles.txDeleteReveal, deleteActionStyle]}>
          <Pressable
            accessibilityLabel={`Delete ${title}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={completeDeletion}
            style={styles.txDeleteButton}
          >
            <TrashIcon color={figmaColors.error["500"]} />
          </Pressable>
        </Reanimated.View>
      ) : null}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View onLayout={handleRowLayout} style={rowStyle}>
          <Pressable
            accessibilityLabel={`Edit ${title}`}
            accessibilityRole="button"
            onPress={handlePress}
            style={styles.txRow}
          >
            <View style={[styles.txIconCircle, { backgroundColor: bgColor }]}>
              <Text style={styles.txEmoji}>
                {transaction.categoryEmoji || "💰"}
              </Text>
            </View>
            <View style={styles.txMeta}>
              <Text numberOfLines={1} style={styles.txTitle}>{title}</Text>
              <Text numberOfLines={1} style={styles.txAccount}>
                {isTransfer && transaction.destinationAccountName
                  ? `${transaction.accountName} → ${transaction.destinationAccountName}`
                  : transaction.accountName}
              </Text>
            </View>
            <Text style={[styles.txAmount, { color: amountColor }]}>
              {prefix}{formatCents(displayCents, currencySymbol)}
            </Text>
          </Pressable>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

function ToastCheckIcon() {
  return (
    <Svg fill="none" height={16} viewBox="0 0 22 22" width={16}>
      <Circle cx="11" cy="11" fill={figmaColors.base.white} r="11" />
      <Path
        d="M6.5 11.5L9.5 14.5L15.5 8"
        stroke={figmaColors.grayNeutral["900"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg fill="none" height={16} viewBox="0 0 24 24" width={16}>
      <Path
        d="M14.28 2a2 2 0 0 1 1.897 1.368L16.72 5H20a1 1 0 1 1 0 2l-.003.071-.867 12.143A3 3 0 0 1 16.138 22H7.862a3 3 0 0 1-2.992-2.786L4.003 7.07A1.01 1.01 0 0 1 4 7a1 1 0 0 1 0-2h3.28l.543-1.632A2 2 0 0 1 9.721 2zM9 10a1 1 0 0 0-.993.883L8 11v6a1 1 0 0 0 1.993.117L10 17v-6a1 1 0 0 0-1-1m6 0a1 1 0 0 0-1 1v6a1 1 0 1 0 2 0v-6a1 1 0 0 0-1-1m-.72-6H9.72l-.333 1h5.226z"
        fill={color}
      />
    </Svg>
  );
}

function ToastNotification({
  bottomOffset,
  message,
  onAction,
  variant = "default",
  visible,
}: {
  bottomOffset: number;
  message: string;
  onAction?: () => void;
  variant?: "default" | "destructive";
  visible: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents={onAction ? "auto" : "none"}
      style={[
        styles.toast,
        variant === "destructive" ? styles.toastDestructive : null,
        { bottom: bottomOffset, opacity, transform: [{ translateY }] },
      ]}
    >
      {variant === "destructive" ? (
        <TrashIcon color={figmaColors.base.white} />
      ) : (
        <ToastCheckIcon />
      )}
      <Text style={styles.toastText}>{message}</Text>
      {onAction ? (
        <Pressable
          accessibilityLabel="Undo transaction deletion"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onAction}
        >
          <Text style={styles.toastActionText}>Undo</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function formatCalendarAmount(cents: number, symbol: string): string {
  const abs = Math.abs(cents);
  if (abs >= 1_000_000_00) return `${symbol}${(abs / 1_000_000_00).toFixed(1)}M`;
  if (abs >= 1_000_00) return `${symbol}${(abs / 1_000_00).toFixed(1)}K`;
  return `${symbol}${(abs / 100).toFixed(0)}`;
}

function CalendarMonthGrid({
  currencyCode,
  exchangeRates,
  monthTransactions,
  selectedMonth,
  weekStartIndex,
}: {
  currencyCode: string;
  exchangeRates: Record<string, number>;
  monthTransactions: Transaction[];
  selectedMonth: Date;
  weekStartIndex: number;
}) {
  const calendarDays = getCalendarDays(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth(),
    weekStartIndex,
  );
  const calendarDayLabels = getCalendarDayLabels(weekStartIndex);
  const calendarRows = Array.from({ length: calendarDays.length / 7 }, (_, rowIndex) =>
    calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7),
  );

  const dayTotals = useMemo(() => {
    const map = new Map<number, { inc: number; exp: number }>();
    for (const tx of monthTransactions) {
      const day = new Date(tx.date).getDate();
      const cents = convertCents(tx.amountCents, tx.currencyCode, currencyCode, exchangeRates);
      const entry = map.get(day) ?? { inc: 0, exp: 0 };
      if (tx.type === "income") entry.inc += cents;
      else if (tx.type === "expense") entry.exp += cents;
      map.set(day, entry);
    }
    return map;
  }, [monthTransactions, currencyCode, exchangeRates]);

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarWeekdayRow}>
        {calendarDayLabels.map((label) => (
          <View key={label} style={styles.calendarWeekdayCell}>
            <Text style={styles.calendarWeekdayText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarRows.map((week, rowIndex) => (
          <View key={`week-${rowIndex}`} style={styles.calendarRow}>
            {week.map((day, columnIndex) => {
              const totals = day !== null ? dayTotals.get(day) : undefined;
              return (
                <View
                  key={`${rowIndex}-${columnIndex}`}
                  style={[
                    styles.calendarDayCell,
                    day === null && styles.calendarDayCellHidden,
                  ]}
                >
                  <Text style={styles.calendarDayText}>{day ?? 31}</Text>
                  <View style={styles.calendarDayAmounts}>
                    {totals && totals.inc > 0 && (
                      <Text style={styles.calendarDayIncome}>
                        {formatCalendarAmount(totals.inc, "")}
                      </Text>
                    )}
                    {totals && totals.exp > 0 && (
                      <Text style={styles.calendarDayExpense}>
                        {formatCalendarAmount(totals.exp, "")}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function HeaderIcon({
  accessibilityLabel,
  name,
  onPress,
}: {
  accessibilityLabel: string;
  name: MingCuteIconName;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={onPress}
      style={styles.headerIconButton}
    >
      <MingCuteIcon
        color={figmaColors.grayNeutral["700"]}
        name={name}
        size={24}
      />
    </Pressable>
  );
}

function TransactionSummary({
  accentColor,
  icon,
  label,
  value,
}: {
  accentColor: string;
  icon: MingCuteIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.transactionSummary}>
      <View style={styles.transactionSummaryLabelRow}>
        <MingCuteIcon color={accentColor} name={icon} size={16} />
        <Text style={[styles.transactionSummaryLabel, { color: accentColor }]}>
          {label}
        </Text>
      </View>
      <Text style={styles.transactionSummaryValue}>{value}</Text>
    </View>
  );
}

function MonthPickerColumn({
  items,
  label,
  onSelect,
  selectedIndex,
}: {
  items: string[];
  label: string;
  onSelect: (index: number) => void;
  selectedIndex: number;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      animated: false,
      y: selectedIndex * MONTH_PICKER_ITEM_HEIGHT,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.y / MONTH_PICKER_ITEM_HEIGHT);
      onSelect(Math.max(0, Math.min(items.length - 1, idx)));
    },
    [items.length, onSelect],
  );

  return (
    <View style={styles.monthPickerColumnWrapper}>
      <Text style={styles.monthPickerColumnLabel}>{label}</Text>
      <View style={styles.monthPickerColumnInner}>
        <View pointerEvents="none" style={styles.monthPickerSelectionIndicator} />
        <ScrollView
          ref={scrollRef}
          bounces={false}
          contentContainerStyle={styles.monthPickerScrollContent}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          showsVerticalScrollIndicator={false}
          snapToInterval={MONTH_PICKER_ITEM_HEIGHT}
        >
          {items.map((item, i) => (
            <View key={item} style={styles.monthPickerItem}>
              <Text
                style={[
                  styles.monthPickerItemText,
                  i === selectedIndex && styles.monthPickerItemTextSelected,
                ]}
              >
                {item}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function MonthYearPicker({
  onClose,
  onSelectMonth,
  selectedMonth,
  visible,
}: {
  onClose: () => void;
  onSelectMonth: (month: Date) => void;
  selectedMonth: Date;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [pickerMonth, setPickerMonth] = useState(selectedMonth.getMonth());
  const [pickerYear, setPickerYear] = useState(
    Math.max(0, selectedMonth.getFullYear() - monthPickerStartYear),
  );

  const selectedMonthRef = useRef(selectedMonth);
  selectedMonthRef.current = selectedMonth;

  const displayText = `${MONTH_PICKER_MONTHS_FULL[pickerMonth]} ${monthPickerStartYear + pickerYear}`;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      const d = selectedMonthRef.current;
      setPickerMonth(d.getMonth());
      setPickerYear(Math.max(0, d.getFullYear() - monthPickerStartYear));
      translateY.setValue(500);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(500);
    }
  }, [backdropOpacity, translateY, visible]);

  const handleSave = useCallback(() => {
    onSelectMonth(new Date(monthPickerStartYear + pickerYear, pickerMonth, 1));
    closeSheet();
  }, [closeSheet, onSelectMonth, pickerMonth, pickerYear]);

  return (
    <Modal
      animationType="none"
      onRequestClose={closeSheet}
      transparent
      visible={visible}
    >
      <View style={styles.monthPickerRoot}>
        <Animated.View
          style={[styles.monthPickerBackdrop, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close month picker"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.monthPickerContainer}>
          <Animated.View
            style={[
              styles.monthPickerSheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
              { transform: [{ translateY }] },
            ]}
          >
            <View>
              <View style={styles.monthPickerHeader}>
                <Text style={styles.monthPickerTitle}>Month & Year</Text>
                <Pressable
                  accessibilityLabel="Close month picker"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.monthPickerCloseButton}
                >
                  <MingCuteIcon
                    color={figmaColors.grayNeutral["600"]}
                    name="close-line"
                    size={18}
                  />
                </Pressable>
              </View>
              <View style={styles.monthPickerDivider} />
            </View>

            <Text style={styles.monthPickerDisplayText}>{displayText}</Text>

            <View style={styles.monthPickerColumns}>
              <MonthPickerColumn
                items={MONTH_PICKER_MONTHS_SHORT}
                label="Month"
                onSelect={setPickerMonth}
                selectedIndex={pickerMonth}
              />
              <MonthPickerColumn
                items={MONTH_PICKER_YEARS}
                label="Year"
                onSelect={setPickerYear}
                selectedIndex={pickerYear}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleSave}
              style={styles.monthPickerSaveButton}
            >
              <Text style={styles.monthPickerSaveButtonText}>Save</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

export function CurrencyPicker({
  onClose,
  onSelectCurrency,
  visible,
}: {
  onClose: () => void;
  onSelectCurrency: (currency: Currency) => void;
  visible: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onClose();
      }
    });
  }, [backdropOpacity, onClose, translateY]);

  const resetSheetPosition = useCallback(() => {
    Animated.spring(translateY, {
      bounciness: 4,
      speed: 18,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation();
          translateY.setValue(0);
        },
        onPanResponderMove: (_, gestureState) => {
          translateY.setValue(Math.max(gestureState.dy, 0));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (
            gestureState.dy > SHEET_CLOSE_DISTANCE ||
            gestureState.vy > 1.2
          ) {
            closeSheet();
            return;
          }
          resetSheetPosition();
        },
        onPanResponderTerminate: resetSheetPosition,
      }),
    [closeSheet, resetSheetPosition, translateY],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setSearchQuery("");
      translateY.setValue(600);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
    } else {
      setMounted(false);
      backdropOpacity.setValue(0);
      translateY.setValue(600);
    }
  }, [backdropOpacity, translateY, visible]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCurrencies = normalizedQuery
    ? currencies.filter(
        (currency) =>
          currency.code.toLowerCase().includes(normalizedQuery) ||
          currency.name.toLowerCase().includes(normalizedQuery),
      )
    : currencies;

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.pickerBackdrop, { opacity: backdropOpacity }]}
      >
        <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <SafeAreaView edges={["top"]} style={styles.pickerSafeArea}>
        <Animated.View
          style={[styles.pickerSheetFrame, { transform: [{ translateY }] }]}
        >
          <View style={styles.sheetTopShadow} />
          <View style={styles.pickerSheet}>
            <View
              accessibilityLabel="Drag down to close currency picker"
              accessibilityRole="adjustable"
              style={styles.dragHandleArea}
              {...panResponder.panHandlers}
            >
              <View style={styles.grabber} />
            </View>

            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Pick a currency</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close currency picker"
                hitSlop={12}
                onPress={closeSheet}
                style={styles.closeButton}
              >
                <MingCuteIcon
                  color={figmaColors.grayNeutral["950"]}
                  name="close-line"
                  size={24}
                />
              </Pressable>
            </View>

            <View style={styles.searchContainer}>
              <View style={styles.searchIcon}>
                <MingCuteIcon
                  color={figmaColors.grayNeutral["400"]}
                  name="search-line"
                  size={20}
                />
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                cursorColor={figmaColors.grayNeutral["900"]}
                placeholder="Search for a currency/country"
                placeholderTextColor={figmaColors.grayNeutral["400"]}
                onChangeText={setSearchQuery}
                selectionColor={figmaColors.grayNeutral["900"]}
                style={styles.searchInput}
                value={searchQuery}
              />
            </View>

            <Text style={styles.sectionLabel}>All currencies</Text>

            <ScrollView
              contentContainerStyle={styles.currencyList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredCurrencies.map((currency) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${currency.code}, ${currency.name}`}
                  key={currency.code}
                  onPress={() => onSelectCurrency(currency)}
                  style={styles.currencyRow}
                >
                  <CurrencyFlag flag={currency.flag} />
                  <View style={styles.currencyTextGroup}>
                    <Text style={styles.currencyCode}>{currency.code}</Text>
                    <Text style={styles.currencyName}>{currency.name}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function CurrencyFlag({ flag }: { flag: string }) {
  return (
    <Text allowFontScaling={false} style={styles.flagEmoji}>
      {flag}
    </Text>
  );
}

function MingCuteIcon({
  color,
  name,
  size,
}: {
  color: string;
  name: MingCuteIconName;
  size: number;
}) {
  const icon = mingCuteIcons[name];

  return (
    <Svg fill="none" height={size} viewBox={icon.viewBox} width={size}>
      <Path
        clipRule="evenodd"
        d={icon.path}
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function EmptyLogIllustration() {
  return (
    <Svg fill="none" height={80} viewBox="0 0 79 80" width={79}>
      <G clipPath="url(#emptyLogClip)">
        <Path
          d="M71.0805 14.6487H9.45502C8.62362 14.6492 7.82642 14.9839 7.23853 15.5792C6.65064 16.1745 6.32014 16.9818 6.31963 17.8238V75.0815C6.32014 75.9234 6.65064 76.7307 7.23853 77.326C7.82642 77.9213 8.62362 78.256 9.45502 78.2565H71.0805C71.912 78.2561 72.7093 77.9215 73.2972 77.3261C73.8852 76.7308 74.2157 75.9234 74.2162 75.0815V17.8238C74.2157 16.9818 73.8852 16.1744 73.2972 15.5791C72.7093 14.9838 71.912 14.6491 71.0805 14.6487Z"
          fill={figmaColors.grayNeutral["300"]}
        />
        <Path
          d="M67.0237 58.3598H13.5126C11.781 58.3598 10.3772 56.9382 10.3772 55.1848V4.59459C10.3772 2.84115 11.781 1.41951 13.5126 1.41951H67.0237C68.7553 1.41951 70.1591 2.84115 70.1591 4.59459V55.1848C70.1591 56.9382 68.7553 58.3598 67.0237 58.3598Z"
          fill={figmaColors.grayNeutral["200"]}
        />
        <Path
          d="M11.3698 56.1897V5.59983C11.3698 3.84639 12.7737 2.42475 14.5052 2.42475H68.0164C68.628 2.42475 69.1966 2.60475 69.6787 2.91131C69.1244 2.01623 68.144 1.41951 67.0237 1.41951H13.5126C11.781 1.41951 10.3772 2.84115 10.3772 4.59459V55.1847C10.3772 56.3195 10.9664 57.312 11.8503 57.8736C11.5476 57.3851 11.3698 56.8093 11.3698 56.19V56.1897Z"
          fill={figmaColors.base.white}
        />
        <Path
          d="M60.4397 12.1084H20.0969V14.4366H60.4397V12.1084ZM60.4397 20.9983H20.0969V23.3265H60.4397V20.9983ZM60.4397 29.8901H20.0969V32.2183H60.4397V29.8901ZM60.4397 38.7799H20.0969V41.1084H60.4397V38.7799Z"
          fill={figmaColors.base.white}
        />
        <Path
          d="M24.9045 31.2652L35.042 41.5314H24.9045V31.2652Z"
          fill={figmaColors.grayNeutral["300"]}
        />
        <Path
          d="M74.2164 42.3782V18.7575L70.1593 14.6487V42.3779H74.2164V42.3782Z"
          fill={figmaColors.grayNeutral["300"]}
        />
        <Path
          d="M78.9686 44.5148L74.5974 75.8498C74.3788 77.4164 73.0549 78.5807 71.4927 78.5807H9.04323C7.48104 78.5807 6.15714 77.4164 5.9386 75.8498L0.0314057 33.5085C-0.235057 31.597 1.22968 29.8892 3.13604 29.8892H22.4218C23.9839 29.8892 25.3078 31.0534 25.5264 32.6197L26.3005 38.1646C26.5191 39.7311 27.843 40.8954 29.4052 40.8954H75.8646C77.7703 40.8954 79.2354 42.6033 78.9689 44.5148H78.9686Z"
          fill={figmaColors.grayNeutral["300"]}
        />
        <Path
          d="M63.4808 64.6039H17.0557C16.8012 64.6038 16.5555 64.5098 16.3646 64.3394C16.1737 64.169 16.0507 63.934 16.0187 63.6784L15.4378 59.0213C15.4194 58.8723 15.4324 58.7211 15.4761 58.5776C15.5197 58.4341 15.593 58.3017 15.6911 58.1891C15.7892 58.0764 15.9098 57.9862 16.0449 57.9244C16.18 57.8626 16.3266 57.8306 16.4749 57.8305H64.0617C64.2099 57.8306 64.3565 57.8626 64.4916 57.9244C64.6267 57.9862 64.7473 58.0764 64.8454 58.1891C64.9435 58.3017 65.0168 58.4341 65.0604 58.5776C65.1041 58.7211 65.1172 58.8723 65.0987 59.0213L64.5179 63.6784C64.4858 63.934 64.3628 64.169 64.1719 64.3394C63.981 64.5098 63.7353 64.6038 63.4808 64.6039Z"
          fill={figmaColors.grayNeutral["50"]}
        />
      </G>
      <Defs>
        <ClipPath id="emptyLogClip">
          <Rect fill={figmaColors.base.white} height={80} width={79} />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

const styles = StyleSheet.create({
  introSplash: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    flex: 1,
    justifyContent: "center",
  },
  introLogo: {
    height: 96,
    width: 284,
  },
  screen: {
    backgroundColor: figmaColors.bg,
    flex: 1,
  },
  homeScreen: {
    backgroundColor: figmaColors.bg,
    flex: 1,
  },
  homeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  monthSelector: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 32,
  },
  monthText: {
    color: figmaColors.grayNeutral["600"],
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.18,
    lineHeight: 24,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  headerIconButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  summaryContainer: {
    borderBottomColor: figmaColors.grayNeutral["200"],
    borderBottomWidth: 1,
    marginTop: 10,
  },
  netTotalBlock: {
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
    paddingBottom: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  netTotalLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 14,
    letterSpacing: -0.08,
    lineHeight: 20,
    textAlign: "center",
  },
  amountRow: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "center",
  },
  amountWhole: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.14,
    lineHeight: 32,
  },
  amountCents: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.14,
    lineHeight: 32,
  },
  monthComparison: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: -0.08,
    lineHeight: 20,
    textAlign: "center",
  },
  monthComparisonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
  },
  transactionSummaryRow: {
    alignItems: "stretch",
    borderTopColor: figmaColors.grayNeutral["200"],
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 80,
  },
  transactionSummary: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minWidth: 0,
    paddingVertical: 20,
  },
  transactionSummaryDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    width: 1,
  },
  transactionSummaryLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
  },
  transactionSummaryLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  transactionSummaryValue: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 14,
    letterSpacing: -0.08,
    lineHeight: 20,
    textAlign: "center",
  },
  calendarContainer: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  calendarWeekdayRow: {
    flexDirection: "row",
    gap: 4,
  },
  calendarWeekdayCell: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingBottom: 4,
  },
  calendarWeekdayText: {
    color: figmaColors.grayNeutral["600"],
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  calendarGrid: {
    gap: 4,
  },
  calendarRow: {
    flexDirection: "row",
    gap: 4,
  },
  calendarDayCell: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 6,
    flex: 1,
    height: 76,
    justifyContent: "space-between",
    minWidth: 0,
    overflow: "hidden",
    padding: 6,
  },
  calendarDayCellHidden: {
    opacity: 0,
  },
  calendarDayText: {
    color: figmaColors.grayNeutral["600"],
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
  },
  calendarDayAmounts: {
    alignItems: "flex-end",
    gap: 4,
  },
  calendarDayIncome: {
    color: figmaColors.success["600"],
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
  },
  calendarDayExpense: {
    color: figmaColors.error["600"],
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
  },
  emptyStateContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 74,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.27,
    lineHeight: 24,
    marginTop: 16,
    textAlign: "center",
  },
  emptyDescription: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
    letterSpacing: -0.08,
    lineHeight: 20,
    marginTop: 4,
    textAlign: "center",
  },
  addButton: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 999,
    bottom: 108,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    shadowColor: figmaColors.base.black,
    shadowOffset: {
      height: 6,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: 56,
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: figmaColors.bg,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingTop: 12,
  },
  tabBarItem: {
    alignItems: "center",
    flex: 1,
    height: 44,
    justifyContent: "center",
    minWidth: 0,
  },
  tabLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
    textAlign: "center",
  },
  tabLabelActive: {
    color: figmaColors.blue["500"],
  },
  monthPickerRoot: {
    flex: 1,
  },
  monthPickerBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: figmaColors.base.overlay,
  },
  monthPickerContainer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  monthPickerSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  monthPickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  monthPickerTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  monthPickerCloseButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  monthPickerDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
  },
  monthPickerDisplayText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  monthPickerColumns: {
    flexDirection: "row",
    gap: 8,
  },
  monthPickerColumnWrapper: {
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  monthPickerColumnLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  monthPickerColumnInner: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 16,
    height: MONTH_PICKER_COLUMN_HEIGHT,
    overflow: "hidden",
    width: "100%",
  },
  monthPickerScrollContent: {
    paddingVertical: MONTH_PICKER_ITEM_HEIGHT * 2,
  },
  monthPickerItem: {
    alignItems: "center",
    borderRadius: 10,
    height: MONTH_PICKER_ITEM_HEIGHT,
    justifyContent: "center",
    marginHorizontal: 6,
  },
  monthPickerItemSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  monthPickerSelectionIndicator: {
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 10,
    height: MONTH_PICKER_ITEM_HEIGHT,
    left: 6,
    position: "absolute",
    right: 6,
    top: MONTH_PICKER_ITEM_HEIGHT * 2,
  },
  monthPickerItemText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
  },
  monthPickerItemTextSelected: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
  },
  monthPickerSaveButton: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
  },
  monthPickerSaveButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  title: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.56,
    lineHeight: 34,
  },
  currencyPill: {
    alignSelf: "flex-start",
    backgroundColor: figmaColors.grayNeutral["200"],
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
    maxWidth: "100%",
    padding: 8,
  },
  currencyPillSelected: {
    alignSelf: "flex-start",
    backgroundColor: figmaColors.blue["50"],
  },
  selectedFlag: {
    borderRadius: 4,
    height: 20,
    justifyContent: "center",
    overflow: "hidden",
    width: 26,
  },
  selectedFlagEmoji: {
    fontSize: 22,
    lineHeight: 24,
    marginLeft: -2,
    textAlign: "center",
    width: 30,
  },
  currencyExample: {
    color: figmaColors.grayNeutral["400"],
    flexShrink: 1,
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.48,
    lineHeight: 29,
  },
  currencyExampleSelected: {
    color: figmaColors.blue["500"],
    flexShrink: 1,
  },
  footer: {
    backgroundColor: figmaColors.bg,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: "100%",
  },
  continueText: {
    color: figmaColors.grayNeutral["300"],
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.18,
    lineHeight: 24,
  },
  continueButtonSelected: {
    backgroundColor: figmaColors.blue["500"],
    elevation: 1,
    shadowColor: figmaColors.base.black,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  continueTextSelected: {
    color: figmaColors.base.white,
  },
  pickerRoot: {
    flex: 1,
  },
  pickerBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: figmaColors.base.overlay,
  },
  pickerSafeArea: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerSheetFrame: {
    height: "96%",
    justifyContent: "flex-end",
    paddingTop: 20,
  },
  sheetTopShadow: {
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    height: 10,
    marginHorizontal: 16,
  },
  pickerSheet: {
    backgroundColor: figmaColors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  dragHandleArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 18,
    paddingTop: 6,
  },
  grabber: {
    backgroundColor: "rgba(60, 60, 67, 0.3)",
    borderRadius: 3,
    height: 5,
    width: 36,
  },
  pickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  pickerTitle: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
  },
  closeButton: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  searchContainer: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  searchIcon: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  searchInput: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    includeFontPadding: false,
    letterSpacing: -0.18,
    lineHeight: 20,
    padding: 0,
  },
  sectionLabel: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 16,
  },
  currencyList: {
    gap: 4,
    paddingTop: 8,
  },
  currencyRow: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    padding: 8,
  },
  flagEmoji: {
    fontSize: 40,
    lineHeight: 44,
    textAlign: "center",
    width: 40,
  },
  currencyTextGroup: {
    flex: 1,
    gap: 1,
  },
  currencyCode: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 14,
    letterSpacing: -0.08,
    lineHeight: 20,
  },
  currencyName: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  txList: {
    flex: 1,
  },
  txListContent: {
    paddingBottom: 100,
  },
  dateGroupHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  dateGroupLabel: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  dateGroupNet: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 14,
    letterSpacing: -0.15,
  },
  txRow: {
    alignItems: "center",
    backgroundColor: figmaColors.bg,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  txSwipeRow: {
    overflow: "hidden",
    position: "relative",
  },
  txDeleteReveal: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: SWIPE_DELETE_REVEAL_WIDTH,
  },
  txDeleteButton: {
    alignItems: "center",
    backgroundColor: figmaColors.error["100"],
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  txIconCircle: {
    alignItems: "center",
    borderRadius: 999,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  txEmoji: {
    fontSize: 22,
  },
  txMeta: {
    flex: 1,
    gap: 2,
  },
  txTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  txAccount: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: -0.08,
  },
  txAmount: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  toast: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    position: "absolute",
  },
  toastDestructive: {
    backgroundColor: figmaColors.error["700"],
  },
  toastText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: -0.1,
  },
  toastActionText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: -0.1,
  },
  searchEmptyState: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingBottom: 80,
  },
  searchEmptyTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  searchEmptySubtitle: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  searchOverlay: {
    backgroundColor: figmaColors.bg,
    bottom: 0,
    flex: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  searchBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInputRow: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchClearBtn: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["400"],
    borderRadius: 999,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  searchCancel: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
  },
  searchResults: {
    paddingBottom: 100,
    paddingTop: 4,
  },
});
