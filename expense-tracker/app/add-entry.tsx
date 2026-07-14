import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
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
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { figmaColors } from "@/constants/colors";
import { EmojiPickerSheet } from "@/components/EmojiPickerSheet";
import { COLOR_PALETTE } from "@/constants/categories";
import { fontFamily } from "@/constants/typography";
import { useCategoriesStore } from "@/stores/categories";
import { accountGroupOrder, useAccountsStore, type AccountGroup as StoreAccountGroup } from "@/stores/accounts";
import { useUIStore } from "@/stores/ui";
import {
  currencies,
  currencySymbols,
  CurrencyPicker,
  type Currency,
} from "./index";

type TransactionType = "income" | "expense" | "transfer";

const transactionTabs: { label: string; value: TransactionType }[] = [
  { label: "Income", value: "income" },
  { label: "Expense", value: "expense" },
  { label: "Transfer", value: "transfer" },
];

const MAX_AMOUNT_CENTS = 999_999_999_99;

type KeypadKey =
  | { type: "digit"; value: number }
  | { type: "operator"; value: "+" | "-" | "×" | "÷" | "=" | "." }
  | { type: "delete" }
  | { type: "empty" }
  | { type: "ok" };

const keypadRows: KeypadKey[][] = [
  [
    { type: "operator", value: "+" },
    { type: "operator", value: "-" },
    { type: "operator", value: "×" },
    { type: "operator", value: "÷" },
  ],
  [
    { type: "digit", value: 7 },
    { type: "digit", value: 8 },
    { type: "digit", value: 9 },
    { type: "operator", value: "=" },
  ],
  [
    { type: "digit", value: 4 },
    { type: "digit", value: 5 },
    { type: "digit", value: 6 },
    { type: "operator", value: "." },
  ],
  [
    { type: "digit", value: 1 },
    { type: "digit", value: 2 },
    { type: "digit", value: 3 },
    { type: "delete" },
  ],
  [
    { type: "empty" },
    { type: "digit", value: 0 },
    { type: "empty" },
    { type: "ok" },
  ],
];

function formatWholeWithCommas(digits: string) {
  if (!digits || digits === "-") {
    return digits;
  }

  const normalized = digits.replace(/^0+(?=\d)/, "") || "0";
  const sign = normalized.startsWith("-") ? "-" : "";
  const absoluteValue = sign ? normalized.slice(1) : normalized;

  return `${sign}${absoluteValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatNumberWithCommas(value: string) {
  const [whole, decimal] = value.split(".");
  const formattedWhole = formatWholeWithCommas(whole);

  return decimal !== undefined ? `${formattedWhole}.${decimal}` : formattedWhole;
}

function formatExpressionWithCommas(expression: string) {
  return expression.replace(/-?\d+\.?\d*/g, (match) =>
    formatNumberWithCommas(match),
  );
}

function hasOperators(expression: string) {
  const withoutLeadingNegative = expression.startsWith("-")
    ? expression.slice(1)
    : expression;

  return /[+×÷-]/.test(withoutLeadingNegative);
}

function centsToExpression(cents: number) {
  if (cents === 0) {
    return "";
  }

  return (cents / 100).toString();
}

function evaluateExpression(expression: string) {
  if (!expression || expression === "-") {
    return 0;
  }

  let sanitizedExpression = expression;

  while (
    sanitizedExpression.length > 0 &&
    "+-×÷".includes(
      sanitizedExpression[sanitizedExpression.length - 1] ?? "",
    )
  ) {
    sanitizedExpression = sanitizedExpression.slice(0, -1);
  }

  const normalizedExpression = sanitizedExpression
    .replace(/×/g, "*")
    .replace(/÷/g, "/");

  if (!/^-?[\d.+\-*/\s]+$/.test(normalizedExpression)) {
    return 0;
  }

  try {
    const result = Function(
      `"use strict"; return (${normalizedExpression})`,
    )() as number;

    return typeof result === "number" && Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function expressionToCents(expression: string) {
  const result = evaluateExpression(expression);

  return Math.max(0, Math.round(result * 100));
}

function appendOperator(expression: string, operator: string) {
  if (!expression) {
    return operator === "-" ? "-" : expression;
  }

  const lastCharacter = expression[expression.length - 1];

  if ("+-×÷".includes(lastCharacter ?? "")) {
    if (operator === "-" && lastCharacter !== "-") {
      return `${expression}${operator}`;
    }

    return expression.slice(0, -1) + operator;
  }

  return `${expression}${operator}`;
}

function appendDecimal(expression: string) {
  if (!expression) {
    return "0.";
  }

  const trailingSegmentMatch = expression.match(/(?:^|[+×÷-])([^+×÷-]*)$/);
  const currentSegment = trailingSegmentMatch?.[1] ?? expression;

  if (currentSegment.includes(".")) {
    return expression;
  }

  if (currentSegment === "") {
    return `${expression}0.`;
  }

  return `${expression}.`;
}

function getExpressionDisplayParts(expression: string) {
  if (!expression || hasOperators(expression)) {
    return null;
  }

  if (expression.includes(".")) {
    const cents = Math.round((Number(expression) || 0) * 100);
    const whole = Math.floor(cents / 100);
    const decimal = cents % 100;

    return {
      decimal: decimal.toString().padStart(2, "0"),
      whole: formatWholeWithCommas(whole.toString()),
    };
  }

  return {
    decimal: "00",
    whole: formatWholeWithCommas(expression || "0"),
  };
}

function formatAmountParts(cents: number) {
  const normalizedCents = Math.max(0, cents);
  const whole = Math.floor(normalizedCents / 100);
  const decimal = normalizedCents % 100;

  return {
    whole: formatWholeWithCommas(whole.toString()),
    decimal: decimal.toString().padStart(2, "0"),
  };
}

function formatAmountLabel(cents: number, currencySymbol = "$") {
  const { whole, decimal } = formatAmountParts(cents);

  return `${currencySymbol}${whole}.${decimal}`;
}

function formatBalanceLabel(cents: number, currencySymbol = "$") {
  const abs = Math.abs(cents);
  const whole = formatWholeWithCommas(Math.floor(abs / 100).toString());
  const decimal = (abs % 100).toString().padStart(2, "0");
  return `${currencySymbol}${whole}.${decimal}`;
}

function DownIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
      <Path
        clipRule="evenodd"
        d="M10.5892 13.0892C10.4329 13.2454 10.221 13.3332 10 13.3332C9.77903 13.3332 9.56711 13.2454 9.41083 13.0892L4.69667 8.375C4.61707 8.29813 4.55359 8.20617 4.50992 8.1045C4.46624 8.00283 4.44325 7.89348 4.44229 7.78283C4.44133 7.67218 4.46241 7.56245 4.50432 7.46004C4.54622 7.35762 4.60809 7.26458 4.68634 7.18634C4.76458 7.10809 4.85762 7.04622 4.96004 7.00431C5.06245 6.96241 5.17218 6.94133 5.28283 6.94229C5.39348 6.94325 5.50283 6.96624 5.6045 7.00992C5.70617 7.05359 5.79813 7.11707 5.875 7.19667L10 11.3217L14.125 7.19667C14.2822 7.04487 14.4927 6.96087 14.7112 6.96277C14.9297 6.96467 15.1387 7.05231 15.2932 7.20682C15.4477 7.36132 15.5353 7.57033 15.5372 7.78883C15.5391 8.00733 15.4551 8.21783 15.3033 8.375L10.5892 13.0892Z"
        fill={figmaColors.grayNeutral["600"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function BackspaceIcon() {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <Path
        d="M20.1818 4.72727H8.36364L2 12L8.36364 19.2727H20.1818C20.664 19.2727 21.1265 19.0812 21.4675 18.7402C21.8084 18.3992 22 17.9368 22 17.4545V6.54545C22 6.06324 21.8084 5.60078 21.4675 5.25981C21.1265 4.91883 20.664 4.72727 20.1818 4.72727Z"
        fill={figmaColors.grayNeutral["900"]}
        stroke={figmaColors.grayNeutral["900"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M17.4545 9.27273L12 14.7273"
        stroke={figmaColors.base.white}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M12 9.27273L17.4545 14.7273"
        stroke={figmaColors.base.white}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        clipRule="evenodd"
        d="M6.2253 4.81108C5.83477 4.42056 5.20161 4.42056 4.81108 4.81108C4.42056 5.20161 4.42056 5.83477 4.81108 6.2253L10.5858 12L4.81114 17.7747C4.42062 18.1652 4.42062 18.7984 4.81114 19.1889C5.20167 19.5794 5.83483 19.5794 6.22535 19.1889L12 13.4142L17.7747 19.1889C18.1652 19.5794 18.7984 19.5794 19.1889 19.1889C19.5794 18.7984 19.5794 18.1652 19.1889 17.7747L13.4142 12L19.189 6.2253C19.5795 5.83477 19.5795 5.20161 19.189 4.81108C18.7985 4.42056 18.1653 4.42056 17.7748 4.81108L12 10.5858L6.2253 4.81108Z"
        fill={figmaColors.grayNeutral["950"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

type ExpenseCategory = {
  emoji: string;
  name: string;
};

type AccountGroup = StoreAccountGroup;

type Account = {
  id: string;
  name: string;
  group: AccountGroup;
  balanceCents: number;
  openingBalanceCents: number;
};

type StoredTransaction = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  accountName: string;
  destinationAccountName?: string;
};

type RecordedTransaction = StoredTransaction & {
  categoryColor?: string;
  categoryEmoji: string;
  categoryName: string;
  currencyCode: string;
  date: string;
  description: string;
  imageUris: string[];
  recurringOption: string;
};

type AccountGroupData = {
  group: AccountGroup;
  totalCents: number;
  accounts: Account[];
};

type SelectedImage = {
  id: string;
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  mimeType?: string | null;
  source: "recent" | "gallery" | "camera";
};

const ACCOUNT_ITEM_HEIGHT = 52;
const HOME_CURRENCY_KEY = "europa:home-currency";
const TRANSACTIONS_KEY = "europa:transactions";

function applyTransactionsToAccounts(accounts: Account[], transactions: StoredTransaction[]): Account[] {
  return accounts.map((account) => {
    const net = transactions.reduce((sum, tx) => {
      if (tx.type === "transfer") {
        if (tx.accountName === account.name) return sum - tx.amountCents;
        if (tx.destinationAccountName === account.name) return sum + tx.amountCents;
        return sum;
      }
      if (tx.accountName !== account.name) return sum;
      if (tx.type === "income") return sum + tx.amountCents;
      if (tx.type === "expense") return sum - tx.amountCents;
      return sum;
    }, 0);
    return { ...account, balanceCents: account.openingBalanceCents + net };
  });
}

function groupAccounts(accounts: Account[]): AccountGroupData[] {
  return accountGroupOrder
    .map((group) => {
      const items = accounts.filter((a) => a.group === group);
      return {
        group,
        totalCents: items.reduce((sum, a) => sum + a.balanceCents, 0),
        accounts: items,
      };
    })
    .filter((g) => g.accounts.length > 0);
}


export type CreateAccountValues = {
  groupId: AccountGroup;
  name: string;
  balance: number;
  currencyCode: string;
  description?: string;
};

function PencilIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"
        stroke={figmaColors.grayNeutral["600"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M12 5v14M5 12h14"
        stroke={figmaColors.grayNeutral["600"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function MinusCircleIcon() {
  return (
    <Svg fill="none" height={22} viewBox="0 0 24 24" width={22}>
      <Circle cx={12} cy={12} fill="#ef4444" r={10} />
      <Path
        d="M8 12h8"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function DragHandleIcon() {
  const fill = figmaColors.grayNeutral["400"];
  return (
    <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
      <Circle cx={7} cy={5} fill={fill} r={1.5} />
      <Circle cx={13} cy={5} fill={fill} r={1.5} />
      <Circle cx={7} cy={10} fill={fill} r={1.5} />
      <Circle cx={13} cy={10} fill={fill} r={1.5} />
      <Circle cx={7} cy={15} fill={fill} r={1.5} />
      <Circle cx={13} cy={15} fill={fill} r={1.5} />
    </Svg>
  );
}

function NewCategoryEmptyIcon({ color = figmaColors.base.white }: { color?: string }) {
  return (
    <Svg fill="none" height={32} viewBox="0 0 32 32" width={32}>
      <Path
        clipRule="evenodd"
        d="M22.667 4C24.4351 4 26.1308 4.70238 27.381 5.95262C28.6313 7.20286 29.3337 8.89856 29.3337 10.6667V21.3333C29.3337 23.1014 28.6313 24.7971 27.381 26.0474C26.1308 27.2976 24.4351 28 22.667 28H4.00033C3.6467 28 3.30756 27.8595 3.05752 27.6095C2.80747 27.3594 2.66699 27.0203 2.66699 26.6667V10.6667C2.66699 8.89856 3.36937 7.20286 4.61961 5.95262C5.86986 4.70238 7.56555 4 9.33366 4H22.667ZM12.0003 13.3333C11.6737 13.3334 11.3585 13.4533 11.1145 13.6703C10.8704 13.8873 10.7145 14.1863 10.6763 14.5107L10.667 14.6667V17.3333C10.6674 17.6732 10.7975 18 11.0308 18.2472C11.2641 18.4943 11.5829 18.643 11.9222 18.6629C12.2614 18.6828 12.5955 18.5724 12.8561 18.3543C13.1167 18.1362 13.2842 17.8268 13.3243 17.4893L13.3337 17.3333V14.6667C13.3337 14.313 13.1932 13.9739 12.9431 13.7239C12.6931 13.4738 12.3539 13.3333 12.0003 13.3333ZM20.0003 13.3333C19.6467 13.3333 19.3076 13.4738 19.0575 13.7239C18.8075 13.9739 18.667 14.313 18.667 14.6667V17.3333C18.667 17.687 18.8075 18.0261 19.0575 18.2761C19.3076 18.5262 19.6467 18.6667 20.0003 18.6667C20.3539 18.6667 20.6931 18.5262 20.9431 18.2761C21.1932 18.0261 21.3337 17.687 21.3337 17.3333V14.6667C21.3337 14.313 21.1932 13.9739 20.9431 13.7239C20.6931 13.4738 20.3539 13.3333 20.0003 13.3333Z"
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M14.28 2a2 2 0 0 1 1.897 1.368L16.72 5H20a1 1 0 1 1 0 2l-.003.071-.867 12.143A3 3 0 0 1 16.138 22H7.862a3 3 0 0 1-2.992-2.786L4.003 7.07A1.01 1.01 0 0 1 4 7a1 1 0 0 1 0-2h3.28l.543-1.632A2 2 0 0 1 9.721 2zM9 10a1 1 0 0 0-.993.883L8 11v6a1 1 0 0 0 1.993.117L10 17v-6a1 1 0 0 0-1-1m6 0a1 1 0 0 0-1 1v6a1 1 0 1 0 2 0v-6a1 1 0 0 0-1-1m-.72-6H9.72l-.333 1h5.226z"
        fill="#EF4444"
      />
    </Svg>
  );
}

function CheckmarkIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M5 13l4 4L19 7"
        stroke={figmaColors.base.white}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}

function ChevronUpIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M18 15l-6-6-6 6"
        stroke={figmaColors.grayNeutral["600"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function ChevronDownIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M6 9l6 6 6-6"
        stroke={figmaColors.grayNeutral["600"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function CameraIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke={figmaColors.grayNeutral["400"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
      <Circle
        cx="12"
        cy="13"
        r="4"
        stroke={figmaColors.grayNeutral["400"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
    </Svg>
  );
}

const CATEGORY_ITEM_HEIGHT = 56;


const PICKER_ITEM_HEIGHT = 44;
const PICKER_VISIBLE_COUNT = 5;
const PICKER_COLUMN_HEIGHT = PICKER_ITEM_HEIGHT * PICKER_VISIBLE_COUNT;
const PICKER_START_YEAR = 2020;
const PICKER_END_YEAR = 2035;
const PICKER_YEARS = Array.from(
  { length: PICKER_END_YEAR - PICKER_START_YEAR + 1 },
  (_, i) => String(PICKER_START_YEAR + i),
);
const PICKER_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PICKER_MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function EditRow({
  category,
  color,
  isDragging,
  onDelete,
  onDragEnd,
  onDragMove,
  onDragStart,
  onEdit,
  shift,
}: {
  category: ExpenseCategory;
  color: string;
  isDragging: boolean;
  onDelete: () => void;
  onDragEnd: (dy: number) => void;
  onDragMove: (dy: number) => void;
  onDragStart: () => void;
  onEdit?: () => void;
  shift: number;
}) {
  const shiftAnim = useRef(new Animated.Value(0)).current;
  // Each row owns its own drag offset so the gesture drives it synchronously,
  // with no dependency on React state re-renders.
  const dragTranslate = useRef(new Animated.Value(0)).current;
  const translateY = useRef(Animated.add(shiftAnim, dragTranslate)).current;

  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    Animated.spring(shiftAnim, {
      bounciness: 0,
      speed: 20,
      toValue: shift,
      useNativeDriver: false,
    }).start();
  }, [shift, shiftAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragTranslate.setValue(0);
        onDragStartRef.current();
      },
      onPanResponderMove: (_, gs) => {
        dragTranslate.setValue(gs.dy);
        onDragMoveRef.current(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        dragTranslate.setValue(0);
        onDragEndRef.current(gs.dy);
      },
      onPanResponderTerminate: (_, gs) => {
        dragTranslate.setValue(0);
        onDragEndRef.current(gs?.dy ?? 0);
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.editRow,
        isDragging && styles.editRowDragging,
        {
          transform: [{ translateY }],
          zIndex: isDragging ? 10 : 0,
        },
      ]}
    >
      <Pressable
        accessibilityLabel={`Delete ${category.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDelete}
      >
        <MinusCircleIcon />
      </Pressable>
      <Pressable
        accessibilityLabel={`Edit ${category.name}`}
        accessibilityRole="button"
        onPress={onEdit}
        style={styles.editRowTextArea}
      >
        <Text numberOfLines={1} style={styles.editRowText}>
          {category.emoji} {category.name}
        </Text>
      </Pressable>
      <View style={styles.editRowRight}>
        <View style={[styles.colorChip, { backgroundColor: color }]} />
        <View {...panResponder.panHandlers}>
          <DragHandleIcon />
        </View>
      </View>
    </Animated.View>
  );
}

function NewCategorySheet({
  initialColor,
  initialEmoji,
  initialName,
  onClose,
  onDelete,
  onSave,
  type = "expense",
  visible,
}: {
  initialColor?: string;
  initialEmoji?: string;
  initialName?: string;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (category: ExpenseCategory, color: string) => void;
  type?: "expense" | "income";
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [emoji, setEmoji] = useState("");
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[6]);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  // Refs so useEffect can read latest initial values without re-running on every prop change
  const initialEmojiRef = useRef(initialEmoji);
  const initialNameRef = useRef(initialName);
  const initialColorRef = useRef(initialColor);
  initialEmojiRef.current = initialEmoji;
  initialNameRef.current = initialName;
  initialColorRef.current = initialColor;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        duration: 220,
        toValue: 600,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: 220,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      setEmoji(initialEmojiRef.current ?? "");
      setName(initialNameRef.current ?? "");
      setSelectedColor(initialColorRef.current ?? COLOR_PALETTE[6]);
      setIsColorPickerOpen(false);
      setIsEmojiPickerOpen(true);
      translateY.setValue(500);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          duration: 300,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          bounciness: 0,
          speed: 18,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(500);
    }
  }, [backdropOpacity, translateY, visible]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave(
      { emoji: emoji || "📦", name: trimmedName },
      selectedColor ?? "#6b7280",
    );
    closeSheet();
  }, [closeSheet, emoji, name, onSave, selectedColor]);

  return (
    <Modal
      animationType="none"
      onRequestClose={closeSheet}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.categorySheetRoot}
      >
        <Animated.View
          style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.newCategorySheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>{type === "income" ? "Income" : "Expense"} Category</Text>
              <View style={styles.categorySheetHeaderActions}>
                {onDelete && (
                  <Pressable
                    accessibilityLabel="Delete category"
                    accessibilityRole="button"
                    onPress={() => { onDelete(); closeSheet(); }}
                    style={[styles.categoryHeaderButton, styles.categoryHeaderButtonDanger]}
                  >
                    <TrashIcon />
                  </Pressable>
                )}
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
            </View>

            <View style={styles.categoryDivider} />

            {isColorPickerOpen ? (
              <View style={styles.colorPickerPanel}>
                {[0, 1, 2, 3].map((rowIdx) => (
                  <View key={rowIdx} style={styles.colorPickerRow}>
                    {COLOR_PALETTE.slice(rowIdx * 6, rowIdx * 6 + 6).map(
                      (color) => (
                        <Pressable
                          key={color}
                          accessibilityLabel={`Select color ${color}`}
                          accessibilityRole="button"
                          onPress={() => {
                            setSelectedColor(color);
                            setIsColorPickerOpen(false);
                          }}
                          style={[
                            styles.colorSwatch,
                            { backgroundColor: color },
                          ]}
                        >
                          {selectedColor === color && <CheckmarkIcon />}
                        </Pressable>
                      ),
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.newCategoryEmojiSection}>
                <Pressable
                  accessibilityLabel="Pick emoji"
                  accessibilityRole="button"
                  onPress={() => setIsEmojiPickerOpen(true)}
                  style={[styles.emojiPreviewBox, { backgroundColor: selectedColor }]}
                >
                  {emoji ? (
                    <Text style={styles.emojiPreviewText}>{emoji}</Text>
                  ) : (
                    <NewCategoryEmptyIcon />
                  )}
                </Pressable>
              </View>
            )}

            <View style={styles.newCategoryNameRow}>
              <Pressable
                accessibilityLabel="Change category color"
                accessibilityRole="button"
                onPress={() => setIsColorPickerOpen((v) => !v)}
                style={[
                  styles.newCategoryColorChip,
                  { backgroundColor: selectedColor },
                ]}
              />
              <TextInput
                ref={nameInputRef}
                onChangeText={setName}
                placeholder="Category Name"
                placeholderTextColor={figmaColors.grayNeutral["400"]}
                returnKeyType="done"
                style={styles.newCategoryNameInput}
                value={name}
              />
              <Pressable
                accessibilityLabel="Save category"
                accessibilityRole="button"
                disabled={!name.trim()}
                onPress={handleSave}
                style={[
                  styles.newCategorySaveButton,
                  !name.trim() && styles.newCategorySaveButtonDisabled,
                ]}
              >
                <CheckmarkIcon />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      <EmojiPickerSheet
        visible={isEmojiPickerOpen}
        onSelect={(e) => {
          setEmoji(e);
          setTimeout(() => nameInputRef.current?.focus(), 350);
        }}
        onClose={() => setIsEmojiPickerOpen(false)}
      />
    </Modal>
  );
}

function GroupPickerSheet({
  onClose,
  onSelect,
  selected,
  visible,
}: {
  onClose: () => void;
  onSelect: (group: AccountGroup) => void;
  selected: AccountGroup | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
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

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <View style={styles.categorySheetRoot}>
        <Animated.View style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.categorySheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>Account Group</Text>
              <Pressable
                accessibilityLabel="Close group picker"
                accessibilityRole="button"
                onPress={closeSheet}
                style={styles.categoryHeaderButton}
              >
                <CloseIcon />
              </Pressable>
            </View>
            <View style={styles.categoryDivider} />
            <View style={styles.categoryGrid}>
              {accountGroupOrder.map((group) => (
                <Pressable
                  accessibilityLabel={`Select ${group}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === group }}
                  key={group}
                  onPress={() => { onSelect(group); closeSheet(); }}
                  style={[styles.categoryChip, selected === group && styles.categoryChipSelected]}
                >
                  <Text style={[styles.categoryChipText, selected === group && styles.categoryChipTextSelected]}>
                    {group}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

export function CreateAccountBottomSheet({
  groups,
  onClose,
  onSubmit,
  selectedCurrency,
  visible,
}: {
  groups: AccountGroup[];
  onClose: () => void;
  onSubmit: (values: CreateAccountValues) => Promise<void> | void;
  selectedCurrency: Currency;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [selectedGroup, setSelectedGroup] = useState<AccountGroup | null>(null);
  const [name, setName] = useState("");
  const [balanceCents, setBalanceCents] = useState(0);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isBalanceSheetOpen, setIsBalanceSheetOpen] = useState(false);
  const [localCurrency, setLocalCurrency] = useState<Currency>(selectedCurrency);

  const canSubmit = selectedGroup !== null && name.trim().length > 0 && !isSubmitting;
  const currencySymbol = currencySymbols[localCurrency.code] ?? localCurrency.code;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(600);
      setSelectedGroup(null);
      setName("");
      setBalanceCents(0);
      setLocalCurrency(selectedCurrency);
      setDescription("");
      setIsSubmitting(false);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(600);
    }
  }, [backdropOpacity, translateY, visible]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedGroup) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        groupId: selectedGroup,
        name: name.trim(),
        balance: balanceCents / 100,
        currencyCode: localCurrency.code,
        description: description.trim() || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [balanceCents, canSubmit, description, name, onSubmit, selectedGroup]);

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <View style={styles.categorySheetRoot}>
        <Animated.View style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              style={[
                styles.createAccountSheet,
                { paddingBottom: Math.max(insets.bottom, 16) },
                { transform: [{ translateY }] },
              ]}
            >
              {/* Header */}
              <View style={styles.categorySheetHeader}>
                <Text style={styles.categorySheetTitle}>Accounts</Text>
                <Pressable
                  accessibilityLabel="Close account form"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
              <View style={styles.categoryDivider} />

              {/* Form fields */}
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Group row */}
                <View style={styles.createAccountRow}>
                  <Text style={styles.createAccountLabel}>Group</Text>
                  <Pressable
                    accessibilityLabel={selectedGroup ?? "Select group"}
                    accessibilityRole="button"
                    onPress={() => setIsGroupPickerOpen(true)}
                    style={[
                      styles.createAccountControl,
                      !!selectedGroup && styles.createAccountControlFilled,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.createAccountControlText,
                        !selectedGroup && styles.createAccountPlaceholder,
                        !!selectedGroup && styles.createAccountControlTextFilled,
                      ]}
                    >
                      {selectedGroup ?? "Select group"}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.createAccountDivider} />

                {/* Name row */}
                <View style={styles.createAccountRow}>
                  <Text style={styles.createAccountLabel}>Name</Text>
                  <View
                    style={[
                      styles.createAccountInputWrapper,
                      !!name && styles.createAccountInputWrapperFilled,
                    ]}
                  >
                    <Text style={styles.createAccountInputSizer} numberOfLines={1}>
                      {name || "Account name"}
                    </Text>
                    <TextInput
                      autoCapitalize="words"
                      cursorColor={figmaColors.blue["500"]}
                      onChangeText={setName}
                      placeholder="Account name"
                      placeholderTextColor={figmaColors.grayNeutral["400"]}
                      returnKeyType="next"
                      style={[
                        StyleSheet.absoluteFill,
                        styles.createAccountInputText,
                        !!name && styles.createAccountInputTextFilled,
                      ]}
                      value={name}
                    />
                  </View>
                </View>
                <View style={styles.createAccountDivider} />

                {/* Balance row */}
                <View style={styles.createAccountRow}>
                  <Text style={styles.createAccountLabel}>Balance</Text>
                  <Pressable
                    accessibilityLabel={balanceCents > 0 ? formatAmountLabel(balanceCents, currencySymbol) : "Enter balance"}
                    accessibilityRole="button"
                    onPress={() => setIsBalanceSheetOpen(true)}
                    style={[
                      styles.createAccountControl,
                      balanceCents > 0 && styles.createAccountControlFilled,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.createAccountControlText,
                        balanceCents === 0 && styles.createAccountPlaceholder,
                        balanceCents > 0 && styles.createAccountControlTextFilled,
                      ]}
                    >
                      {balanceCents > 0 ? formatAmountLabel(balanceCents, currencySymbol) : "Current balance"}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.createAccountDivider} />

                {/* Description section (stacked) */}
                <View style={styles.createAccountDescriptionSection}>
                  <Text style={styles.createAccountLabel}>Description</Text>
                  <TextInput
                    cursorColor={figmaColors.blue["500"]}
                    multiline
                    onChangeText={setDescription}
                    placeholder="Add details about this account (optional)"
                    placeholderTextColor={figmaColors.grayNeutral["400"]}
                    style={styles.createAccountDescriptionInput}
                    textAlignVertical="top"
                    value={description}
                  />
                </View>
              </ScrollView>

              {/* Submit button */}
              <Pressable
                accessibilityLabel={isSubmitting ? "Adding account…" : "Add account"}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={[
                  styles.createAccountButton,
                  !canSubmit && styles.createAccountButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.createAccountButtonText,
                    !canSubmit && styles.createAccountButtonTextDisabled,
                  ]}
                >
                  {isSubmitting ? "Adding…" : "Add account"}
                </Text>
              </Pressable>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </View>

      <GroupPickerSheet
        onClose={() => setIsGroupPickerOpen(false)}
        onSelect={setSelectedGroup}
        selected={selectedGroup}
        visible={isGroupPickerOpen}
      />

      <AmountInputSheet
        amountCents={balanceCents}
        onChangeAmount={setBalanceCents}
        onClose={() => setIsBalanceSheetOpen(false)}
        onSelectCurrency={setLocalCurrency}
        selectedCurrency={localCurrency}
        visible={isBalanceSheetOpen}
      />
    </Modal>
  );
}

function AccountEditRow({
  account,
  isDragging,
  onDelete,
  onDragEnd,
  onDragMove,
  onDragStart,
  onEditBalance,
  onPress,
  shift,
}: {
  account: Account;
  isDragging: boolean;
  onDelete: () => void;
  onDragEnd: (dy: number) => void;
  onDragMove: (dy: number) => void;
  onDragStart: (y0: number) => void;
  onEditBalance: () => void;
  onPress: () => void;
  shift: number;
}) {
  const shiftAnim = useRef(new Animated.Value(0)).current;
  const dragTranslate = useRef(new Animated.Value(0)).current;
  const translateY = useRef(Animated.add(shiftAnim, dragTranslate)).current;

  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    Animated.spring(shiftAnim, {
      bounciness: 0,
      speed: 20,
      toValue: isDragging ? 0 : shift,
      useNativeDriver: false,
    }).start();
  }, [isDragging, shift, shiftAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        dragTranslate.setValue(0);
        onDragStartRef.current(gs.y0);
      },
      onPanResponderMove: (_, gs) => {
        onDragMoveRef.current(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        dragTranslate.setValue(0);
        onDragEndRef.current(gs.dy);
      },
      onPanResponderTerminate: (_, gs) => {
        dragTranslate.setValue(0);
        onDragEndRef.current(gs?.dy ?? 0);
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.accountEditRow,
        isDragging && styles.accountEditRowDragging,
        { transform: [{ translateY }], zIndex: isDragging ? 10 : 0, opacity: isDragging ? 0 : 1 },
      ]}
    >
      <Pressable
        accessibilityLabel={`Delete ${account.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDelete}
      >
        <MinusCircleIcon />
      </Pressable>
      <Pressable
        accessibilityLabel={account.name}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.accountEditNameArea}
      >
        <Text style={styles.accountEditName}>{account.name}</Text>
      </Pressable>
      <Pressable hitSlop={8} onPress={onEditBalance}>
        <Text style={[
          styles.accountEditBalance,
          account.balanceCents > 0
            ? { color: figmaColors.grayNeutral["900"] }
            : account.balanceCents < 0
              ? { color: figmaColors.error["600"] }
              : undefined,
        ]}>
          {formatBalanceLabel(account.balanceCents)}
        </Text>
      </Pressable>
      <View {...panResponder.panHandlers}>
        <DragHandleIcon />
      </View>
    </Animated.View>
  );
}

function AccountsBottomSheet({
  groups,
  onClose,
  onEditBalance,
  onMoveAccountToGroup,
  onNewAccount,
  onRemoveAccount,
  onReorderAccounts,
  onSelectAccount,
  selectedAccountId,
  visible,
}: {
  groups: AccountGroupData[];
  onClose: () => void;
  onEditBalance: (accountId: string) => void;
  onMoveAccountToGroup: (accountId: string, toGroup: AccountGroup, atIndex: number) => void;
  onNewAccount: () => void;
  onRemoveAccount: (id: string) => void;
  onReorderAccounts: (group: AccountGroup, orderedIds: string[]) => void;
  onSelectAccount: (account: Account) => void;
  selectedAccountId: string | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [dragGroup, setDragGroup] = useState<AccountGroup | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [snapGroup, setSnapGroup] = useState<AccountGroup | null>(null);
  const [snapGroupIndex, setSnapGroupIndex] = useState<number | null>(null);
  const dragGroupRef = useRef<AccountGroup | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const snapGroupRef = useRef<AccountGroup | null>(null);
  const snapGroupIndexRef = useRef<number | null>(null);
  const groupLengthRef = useRef<Record<string, number>>({});
  const groupYRef = useRef<Partial<Record<AccountGroup, number>>>({});
  const groupHeaderHeightRef = useRef<Partial<Record<AccountGroup, number>>>({});
  const dragItemStartYRef = useRef(0);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const floatTopAnim = useRef(new Animated.Value(0)).current;
  const floatDyAnim = useRef(new Animated.Value(0)).current;
  const floatTranslateY = useRef(Animated.add(floatTopAnim, floatDyAnim)).current;

  groups.forEach((g) => { groupLengthRef.current[g.group] = g.accounts.length; });

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

  const handleDragStart = useCallback((group: AccountGroup, index: number, y0: number) => {
    floatTopAnim.setValue(y0 - ACCOUNT_ITEM_HEIGHT / 2);
    floatDyAnim.setValue(0);
    dragGroupRef.current = group;
    dragIndexRef.current = index;
    snapGroupRef.current = group;
    snapGroupIndexRef.current = index;
    setDragGroup(group);
    setDragIndex(index);
    setSnapGroup(group);
    setSnapGroupIndex(index);
    const groupY = groupYRef.current[group] ?? 0;
    const headerH = groupHeaderHeightRef.current[group] ?? 0;
    dragItemStartYRef.current = groupY + headerH + index * ACCOUNT_ITEM_HEIGHT;
  }, [floatDyAnim, floatTopAnim]);

  const handleDragMove = useCallback((_group: AccountGroup, dy: number) => {
    if (dragIndexRef.current === null || dragGroupRef.current === null) return;
    floatDyAnim.setValue(dy);
    const currentCenterY = dragItemStartYRef.current + dy + ACCOUNT_ITEM_HEIGHT / 2;
    const gs = groupsRef.current;
    let newSnapGroup: AccountGroup = dragGroupRef.current;
    let newSnapIndex = dragIndexRef.current;

    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      const groupY = groupYRef.current[g.group] ?? 0;
      const headerH = groupHeaderHeightRef.current[g.group] ?? 0;
      const itemCount = g.accounts.length;
      const groupBottom = groupY + headerH + itemCount * ACCOUNT_ITEM_HEIGHT;
      const nextGroupY = i + 1 < gs.length ? (groupYRef.current[gs[i + 1].group] ?? groupBottom) : Infinity;
      if (currentCenterY >= groupY && currentCenterY < nextGroupY) {
        newSnapGroup = g.group;
        const relY = currentCenterY - groupY - headerH;
        const maxIndex = g.group === dragGroupRef.current ? itemCount - 1 : itemCount;
        newSnapIndex = Math.max(0, Math.min(maxIndex, Math.floor(relY / ACCOUNT_ITEM_HEIGHT)));
        break;
      }
    }

    if (newSnapGroup !== snapGroupRef.current || newSnapIndex !== snapGroupIndexRef.current) {
      snapGroupRef.current = newSnapGroup;
      snapGroupIndexRef.current = newSnapIndex;
      setSnapGroup(newSnapGroup);
      setSnapGroupIndex(newSnapIndex);
    }
  }, [floatDyAnim]);

  const handleDragEnd = useCallback((group: AccountGroup, _dy: number) => {
    const from = dragIndexRef.current;
    const toGroup = snapGroupRef.current;
    const toIndex = snapGroupIndexRef.current;

    if (from !== null && toGroup !== null && toIndex !== null) {
      if (toGroup !== group) {
        const sourceData = groupsRef.current.find((g) => g.group === group);
        const account = sourceData?.accounts[from];
        if (account) onMoveAccountToGroup(account.id, toGroup, toIndex);
      } else if (from !== toIndex) {
        const groupData = groupsRef.current.find((g) => g.group === group);
        if (groupData) {
          const newOrder = [...groupData.accounts];
          const [removed] = newOrder.splice(from, 1);
          newOrder.splice(toIndex, 0, removed);
          onReorderAccounts(group, newOrder.map((a) => a.id));
        }
      }
    }

    floatDyAnim.setValue(0);
    dragGroupRef.current = null;
    dragIndexRef.current = null;
    snapGroupRef.current = null;
    snapGroupIndexRef.current = null;
    setDragGroup(null);
    setDragIndex(null);
    setSnapGroup(null);
    setSnapGroupIndex(null);
  }, [floatDyAnim, onMoveAccountToGroup, onReorderAccounts]);

  const getShift = useCallback((group: AccountGroup, index: number): number => {
    if (dragGroup === null || dragIndex === null || snapGroup === null || snapGroupIndex === null) return 0;
    if (snapGroup === dragGroup) {
      if (group !== dragGroup) return 0;
      if (dragIndex < snapGroupIndex && index > dragIndex && index <= snapGroupIndex) return -ACCOUNT_ITEM_HEIGHT;
      if (dragIndex > snapGroupIndex && index < dragIndex && index >= snapGroupIndex) return ACCOUNT_ITEM_HEIGHT;
      return 0;
    }
    if (group === dragGroup && index > dragIndex) return -ACCOUNT_ITEM_HEIGHT;
    if (group === snapGroup && index >= snapGroupIndex) return ACCOUNT_ITEM_HEIGHT;
    return 0;
  }, [dragGroup, dragIndex, snapGroup, snapGroupIndex]);

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <View style={styles.categorySheetRoot}>
        <Animated.View style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.accountsSheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>Accounts</Text>
              <View style={styles.categorySheetHeaderActions}>
                <Pressable
                  accessibilityLabel="Add new account"
                  accessibilityRole="button"
                  onPress={onNewAccount}
                  style={styles.categoryHeaderButton}
                >
                  <PlusIcon />
                </Pressable>
                <Pressable
                  accessibilityLabel="Close accounts"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
            </View>

            <View style={styles.categoryDivider} />

            <ScrollView
              contentContainerStyle={styles.accountsSheetList}
              scrollEnabled={dragIndex === null}
              showsVerticalScrollIndicator={false}
            >
              {groups.map((groupData) => (
                <View
                  key={groupData.group}
                  onLayout={(e) => { groupYRef.current[groupData.group] = e.nativeEvent.layout.y; }}
                >
                  <View
                    onLayout={(e) => { groupHeaderHeightRef.current[groupData.group] = e.nativeEvent.layout.height; }}
                    style={styles.accountGroupHeader}
                  >
                    <Text style={styles.accountGroupName}>{groupData.group}</Text>
                    <Text style={[
                      styles.accountGroupTotal,
                      groupData.totalCents > 0
                        ? { color: figmaColors.grayNeutral["900"] }
                        : groupData.totalCents < 0
                          ? { color: figmaColors.error["600"] }
                          : undefined,
                    ]}>
                      {formatBalanceLabel(groupData.totalCents)}
                    </Text>
                  </View>
                  {groupData.accounts.map((account, index) => (
                    <AccountEditRow
                      account={account}
                      isDragging={dragGroup === groupData.group && dragIndex === index}
                      key={account.id}
                      onDelete={() => onRemoveAccount(account.id)}
                      onDragEnd={(dy) => handleDragEnd(groupData.group, dy)}
                      onDragMove={(dy) => handleDragMove(groupData.group, dy)}
                      onDragStart={(y0) => handleDragStart(groupData.group, index, y0)}
                      onEditBalance={() => onEditBalance(account.id)}
                      onPress={() => { onSelectAccount(account); closeSheet(); }}
                      shift={getShift(groupData.group, index)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </View>

        {dragGroup !== null && dragIndex !== null && (() => {
          const account = groupsRef.current.find((g) => g.group === dragGroup)?.accounts[dragIndex];
          if (!account) return null;
          return (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.accountEditRow,
                styles.accountEditRowDragging,
                {
                  left: 20,
                  position: "absolute",
                  right: 20,
                  top: 0,
                  transform: [{ translateY: floatTranslateY }],
                  zIndex: 1000,
                },
              ]}
            >
              <MinusCircleIcon />
              <View style={styles.accountEditNameArea}>
                <Text style={styles.accountEditName}>{account.name}</Text>
              </View>
              <Text style={[
                styles.accountEditBalance,
                account.balanceCents > 0
                  ? { color: figmaColors.grayNeutral["900"] }
                  : account.balanceCents < 0
                    ? { color: figmaColors.error["600"] }
                    : undefined,
              ]}>
                {formatBalanceLabel(account.balanceCents)}
              </Text>
              <DragHandleIcon />
            </Animated.View>
          );
        })()}
      </View>

    </Modal>
  );
}

function AccountsEmptyIcon() {
  return (
    <Svg fill="none" height={80} viewBox="0 0 79 80" width={79}>
      <Defs>
        <ClipPath id="acct-empty-clip">
          <Rect fill="white" height={80} width={79} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#acct-empty-clip)">
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
  );
}

function AccountPickerSheet({
  accounts,
  onClose,
  onEditAccounts,
  onNewAccount,
  onSelectAccount,
  selectedAccount,
  visible,
}: {
  accounts: Account[];
  onClose: () => void;
  onEditAccounts: () => void;
  onNewAccount: () => void;
  onSelectAccount: (account: Account) => void;
  selectedAccount: Account | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <View style={styles.categorySheetRoot}>
        <Animated.View style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.categorySheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>Accounts</Text>
              <View style={styles.categorySheetHeaderActions}>
                <Pressable
                  accessibilityLabel="Edit accounts"
                  accessibilityRole="button"
                  onPress={onEditAccounts}
                  style={styles.categoryHeaderButton}
                >
                  <PencilIcon />
                </Pressable>
                <Pressable
                  accessibilityLabel="Close accounts"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
            </View>

            <View style={styles.categoryDivider} />

            {accounts.length === 0 ? (
              <View style={styles.accountsEmptyState}>
                <AccountsEmptyIcon />
                <Text style={styles.accountsEmptyTitle}>No accounts yet</Text>
                <Text style={styles.accountsEmptySubtitle}>
                  {"Add an account to start\ntracking your money."}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onNewAccount}
                  style={({ pressed }) => [styles.accountsEmptyButton, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.accountsEmptyButtonText}>+ Add account</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.categoryGrid} showsVerticalScrollIndicator={false}>
                {accounts.map((account) => {
                  const isSelected = selectedAccount?.id === account.id;
                  return (
                    <Pressable
                      accessibilityLabel={`Select ${account.name}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={account.id}
                      onPress={() => { onSelectAccount(account); closeSheet(); }}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    >
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                        {account.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityLabel="New account"
                  accessibilityRole="button"
                  onPress={onNewAccount}
                  style={styles.categoryChip}
                >
                  <Text style={styles.categoryChipText}>+ New account</Text>
                </Pressable>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function PickerColumn({
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
      y: selectedIndex * PICKER_ITEM_HEIGHT,
    });
  }, [selectedIndex]);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_HEIGHT);
      onSelect(Math.max(0, Math.min(items.length - 1, idx)));
    },
    [items.length, onSelect],
  );

  return (
    <View style={styles.pickerColumnWrapper}>
      <Text style={styles.pickerColumnLabel}>{label}</Text>
      <View style={styles.pickerColumnInner}>
        {/* Fixed selection indicator — sits behind the scrolling content */}
        <View pointerEvents="none" style={styles.pickerSelectionIndicator} />
        <ScrollView
          ref={scrollRef}
          bounces={false}
          contentContainerStyle={styles.pickerScrollContent}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          showsVerticalScrollIndicator={false}
          snapToInterval={PICKER_ITEM_HEIGHT}
        >
          {items.map((item, i) => (
            <View key={item} style={styles.pickerItem}>
              <Text
                style={[
                  styles.pickerItemText,
                  i === selectedIndex && styles.pickerItemTextSelected,
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

function DatePickerSheet({
  initialDate,
  onClose,
  onSave,
  visible,
}: {
  initialDate: Date;
  onClose: () => void;
  onSave: (date: Date) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [dayIndex, setDayIndex] = useState(initialDate.getDate() - 1);
  const [monthIndex, setMonthIndex] = useState(initialDate.getMonth());
  const [yearIndex, setYearIndex] = useState(
    Math.max(0, initialDate.getFullYear() - PICKER_START_YEAR),
  );

  const initialDateRef = useRef(initialDate);
  initialDateRef.current = initialDate;

  const year = PICKER_START_YEAR + yearIndex;
  const daysInMonth = getDaysInMonth(monthIndex, year);
  const clampedDayIndex = Math.min(dayIndex, daysInMonth - 1);
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  const displayDate = `${clampedDayIndex + 1} ${PICKER_MONTHS_FULL[monthIndex]} ${year}`;

  // Clamp day when month/year changes
  useEffect(() => {
    if (dayIndex >= daysInMonth) setDayIndex(daysInMonth - 1);
  }, [dayIndex, daysInMonth]);

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
      const d = initialDateRef.current;
      setDayIndex(d.getDate() - 1);
      setMonthIndex(d.getMonth());
      setYearIndex(Math.max(0, d.getFullYear() - PICKER_START_YEAR));
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
    const d = Math.min(dayIndex, daysInMonth - 1);
    onSave(new Date(year, monthIndex, d + 1));
    closeSheet();
  }, [closeSheet, dayIndex, daysInMonth, monthIndex, onSave, year]);

  return (
    <Modal
      animationType="none"
      onRequestClose={closeSheet}
      transparent
      visible={visible}
    >
      <View style={styles.categorySheetRoot}>
        <Animated.View
          style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close date picker"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.datePickerSheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
              { transform: [{ translateY }] },
            ]}
          >
            <View>
              <View style={styles.categorySheetHeader}>
                <Text style={styles.datePickerTitle}>Date</Text>
                <Pressable
                  accessibilityLabel="Close date picker"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
              <View style={styles.datePickerDivider} />
            </View>

            <Text style={styles.datePickerDisplayDate}>{displayDate}</Text>

            <View style={styles.datePickerColumns}>
              <PickerColumn
                items={days}
                key={`day-${daysInMonth}`}
                label="Day"
                onSelect={setDayIndex}
                selectedIndex={clampedDayIndex}
              />
              <PickerColumn
                items={PICKER_MONTHS_SHORT}
                label="Month"
                onSelect={setMonthIndex}
                selectedIndex={monthIndex}
              />
              <PickerColumn
                items={PICKER_YEARS}
                label="Year"
                onSelect={setYearIndex}
                selectedIndex={yearIndex}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleSave}
              style={styles.datePickerSaveButton}
            >
              <Text style={styles.datePickerSaveButtonText}>Save</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const RECURRING_ROW_1 = ["Daily", "Weekly", "Monthly", "Yearly"] as const;
const RECURRING_ROW_2 = ["Semi-Annual", "Never", "Custom"] as const;
const CUSTOM_UNITS = ["days", "weeks", "months"] as const;
type CustomUnit = (typeof CUSTOM_UNITS)[number];
type RecurringOption = string;

function RecurringSheet({
  onClose,
  onCustom,
  onSelect,
  selected,
  visible,
}: {
  onClose: () => void;
  onCustom?: () => void;
  onSelect: (option: string) => void;
  selected: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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

  const handleSelect = useCallback(
    (option: string) => {
      if (option === "Custom") {
        Animated.parallel([
          Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
          Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) {
            onClose();
            onCustom?.();
          }
        });
      } else {
        onSelect(option);
        closeSheet();
      }
    },
    [backdropOpacity, closeSheet, onClose, onCustom, onSelect, translateY],
  );

  const renderRow = (options: readonly string[]) => (
    <View style={styles.recurringRow}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: option === selected }}
          key={option}
          onPress={() => handleSelect(option)}
          style={[
            styles.recurringChip,
            option === selected && styles.recurringChipSelected,
          ]}
        >
          <Text
            style={[
              styles.recurringChipText,
              option === selected && styles.recurringChipTextSelected,
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Modal
      animationType="none"
      onRequestClose={closeSheet}
      transparent
      visible={visible}
    >
      <View style={styles.categorySheetRoot}>
        <Animated.View
          style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close recurring picker"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.recurringSheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
              { transform: [{ translateY }] },
            ]}
          >
            <View>
              <View style={styles.categorySheetHeader}>
                <Text style={styles.categorySheetTitle}>Recurring</Text>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
              <View style={styles.recurringDivider} />
            </View>

            {renderRow(RECURRING_ROW_1)}
            {renderRow(RECURRING_ROW_2)}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function CustomIntervalSheet({
  initialNumber,
  initialUnit,
  onClose,
  onSave,
  visible,
}: {
  initialNumber: number;
  initialUnit: CustomUnit;
  onClose: () => void;
  onSave: (n: number, unit: CustomUnit) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [number, setNumber] = useState(initialNumber);
  const [unit, setUnit] = useState<CustomUnit>(initialUnit);

  const initialNumberRef = useRef(initialNumber);
  const initialUnitRef = useRef(initialUnit);
  initialNumberRef.current = initialNumber;
  initialUnitRef.current = initialUnit;

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
      setNumber(initialNumberRef.current);
      setUnit(initialUnitRef.current);
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

  const cycleUnit = useCallback((dir: 1 | -1) => {
    setUnit((current) => {
      const idx = CUSTOM_UNITS.indexOf(current);
      const next = (idx + dir + CUSTOM_UNITS.length) % CUSTOM_UNITS.length;
      return CUSTOM_UNITS[next];
    });
  }, []);

  const handleSave = useCallback(() => {
    onSave(number, unit);
    closeSheet();
  }, [closeSheet, number, onSave, unit]);

  return (
    <Modal
      animationType="none"
      onRequestClose={closeSheet}
      transparent
      visible={visible}
    >
      <View style={styles.categorySheetRoot}>
        <Animated.View
          style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close custom interval"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.customIntervalSheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
              { transform: [{ translateY }] },
            ]}
          >
            <View>
              <View style={styles.categorySheetHeader}>
                <Text style={styles.categorySheetTitle}>Custom interval</Text>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
              <View style={styles.customIntervalDivider} />
            </View>

            <View style={styles.customIntervalContent}>
              <Text style={styles.customIntervalLabel}>Repeats every</Text>
              <View style={styles.customIntervalSpinners}>
                <View style={styles.customIntervalSpinner}>
                  <Pressable
                    accessibilityLabel="Increase number"
                    accessibilityRole="button"
                    onPress={() => setNumber((n) => Math.min(999, n + 1))}
                    style={styles.stepperButton}
                  >
                    <ChevronUpIcon />
                  </Pressable>
                  <View style={styles.stepperValueBox}>
                    <Text style={styles.stepperValueText}>{number}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Decrease number"
                    accessibilityRole="button"
                    onPress={() => setNumber((n) => Math.max(1, n - 1))}
                    style={styles.stepperButton}
                  >
                    <ChevronDownIcon />
                  </Pressable>
                </View>

                <View style={styles.customIntervalSpinner}>
                  <Pressable
                    accessibilityLabel="Previous unit"
                    accessibilityRole="button"
                    onPress={() => cycleUnit(-1)}
                    style={styles.stepperButton}
                  >
                    <ChevronUpIcon />
                  </Pressable>
                  <View style={[styles.stepperValueBox, styles.stepperUnitBox]}>
                    <Text style={styles.stepperValueText}>{unit}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Next unit"
                    accessibilityRole="button"
                    onPress={() => cycleUnit(1)}
                    style={styles.stepperButton}
                  >
                    <ChevronDownIcon />
                  </Pressable>
                </View>
              </View>
            </View>

            <Pressable
              accessibilityLabel="Save custom interval"
              accessibilityRole="button"
              onPress={handleSave}
              style={styles.datePickerSaveButton}
            >
              <Text style={styles.datePickerSaveButtonText}>Save</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function CategoryPickerSheet({
  type = "expense",
  onClose,
  onSelectCategory,
  selectedCategory,
  visible,
}: {
  type?: "expense" | "income";
  onClose: () => void;
  onSelectCategory: (category: ExpenseCategory) => void;
  selectedCategory: ExpenseCategory | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isEditMode, setIsEditMode] = useState(false);
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    category: ExpenseCategory;
    color: string;
  } | null>(null);
  const {
    expenseCategories: storeExpense,
    incomeCategories: storeIncome,
    categoryColors,
    addCategory,
    deleteCategory,
    updateCategory,
    reorderCategories,
  } = useCategoriesStore();
  const storeCategories = type === "expense" ? storeExpense : storeIncome;
  const title = type === "expense" ? "Expense Categories" : "Income Categories";
  const [localCategories, setLocalCategories] = useState<ExpenseCategory[]>(
    () => [...storeCategories],
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [snapTarget, setSnapTarget] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const snapTargetRef = useRef<number | null>(null);
  const localLengthRef = useRef(localCategories.length);
  localLengthRef.current = localCategories.length;

  useEffect(() => {
    setLocalCategories([...storeCategories]);
  }, [storeCategories]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        duration: 220,
        toValue: 600,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: 220,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(500);
      setIsEditMode(false);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          duration: 300,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          bounciness: 0,
          speed: 18,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(500);
    }
  }, [backdropOpacity, translateY, visible]);

  const handleDelete = useCallback((name: string) => {
    deleteCategory(type, name);
    setLocalCategories((prev) => prev.filter((c) => c.name !== name));
  }, [deleteCategory, type]);

  const handleAddCategory = useCallback(
    (category: ExpenseCategory, color: string) => {
      addCategory(type, category, color);
      setLocalCategories((prev) => [...prev, category]);
    },
    [addCategory, type],
  );

  const handleUpdateCategory = useCallback(
    (newCategory: ExpenseCategory, color: string) => {
      const oldName = editingCategory?.category.name;
      if (!oldName) return;
      updateCategory(type, oldName, newCategory, color);
      setLocalCategories((prev) =>
        prev.map((c) => (c.name === oldName ? newCategory : c)),
      );
      setEditingCategory(null);
    },
    [editingCategory, type, updateCategory],
  );

  const handleDeleteEditingCategory = useCallback(() => {
    if (!editingCategory) return;
    deleteCategory(type, editingCategory.category.name);
    setLocalCategories((prev) =>
      prev.filter((c) => c.name !== editingCategory.category.name),
    );
    setEditingCategory(null);
  }, [deleteCategory, editingCategory, type]);

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
    snapTargetRef.current = index;
    setDragIndex(index);
    setSnapTarget(index);
  }, []);

  const handleDragMove = useCallback((dy: number) => {
    if (dragIndexRef.current === null) return;
    const to = Math.max(
      0,
      Math.min(
        localLengthRef.current - 1,
        dragIndexRef.current + Math.round(dy / CATEGORY_ITEM_HEIGHT),
      ),
    );
    if (to !== snapTargetRef.current) {
      snapTargetRef.current = to;
      setSnapTarget(to);
    }
  }, []);

  const handleDragEnd = useCallback((dy: number) => {
    const from = dragIndexRef.current;
    if (from === null) return;
    dragIndexRef.current = null;
    snapTargetRef.current = null;
    setDragIndex(null);
    setSnapTarget(null);
    setLocalCategories((prev) => {
      const to = Math.max(
        0,
        Math.min(prev.length - 1, from + Math.round(dy / CATEGORY_ITEM_HEIGHT)),
      );
      if (to === from) return prev;
      reorderCategories(type, from, to);
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, [reorderCategories, type]);

  return (
    <Modal
      animationType="none"
      onRequestClose={isEditMode ? () => setIsEditMode(false) : closeSheet}
      transparent
      visible={visible}
    >
      <View style={styles.categorySheetRoot}>
        <Animated.View
          style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close category picker"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.categorySheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>{title}</Text>
              <View style={styles.categorySheetHeaderActions}>
                <Pressable
                  accessibilityLabel={
                    isEditMode ? "Add new category" : "Edit categories"
                  }
                  accessibilityRole="button"
                  onPress={
                    isEditMode
                      ? () => setIsNewCategoryOpen(true)
                      : () => setIsEditMode(true)
                  }
                  style={styles.categoryHeaderButton}
                >
                  {isEditMode ? <PlusIcon /> : <PencilIcon />}
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    isEditMode ? "Done editing" : "Close category picker"
                  }
                  accessibilityRole="button"
                  onPress={isEditMode ? () => setIsEditMode(false) : closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
            </View>

            <View style={styles.categoryDivider} />

            <ScrollView
              contentContainerStyle={
                isEditMode ? styles.categoryList : styles.categoryGrid
              }
              scrollEnabled={dragIndex === null}
              showsVerticalScrollIndicator={false}
            >
              {isEditMode ? (
                localCategories.map((category, index) => {
                  const isDragging = index === dragIndex;
                  let shift = 0;
                  if (dragIndex !== null && snapTarget !== null) {
                    if (dragIndex < snapTarget && index > dragIndex && index <= snapTarget) {
                      shift = -CATEGORY_ITEM_HEIGHT;
                    } else if (dragIndex > snapTarget && index < dragIndex && index >= snapTarget) {
                      shift = CATEGORY_ITEM_HEIGHT;
                    }
                  }
                  return (
                    <EditRow
                      category={category}
                      color={
                        categoryColors[category.name] ??
                        figmaColors.grayNeutral["400"]
                      }
                      isDragging={isDragging}
                      key={category.name}
                      onDelete={() => handleDelete(category.name)}
                      onDragEnd={handleDragEnd}
                      onDragMove={handleDragMove}
                      onDragStart={() => handleDragStart(index)}
                      onEdit={() => {
                        const color =
                          categoryColors[category.name] ??
                          figmaColors.grayNeutral["400"];
                        setEditingCategory({ category, color });
                      }}
                      shift={shift}
                    />
                  );
                })
              ) : (
                <>
                  {localCategories.map((category) => {
                    const isSelected = selectedCategory?.name === category.name;
                    return (
                      <Pressable
                        accessibilityLabel={`Select ${category.name}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        key={category.name}
                        onPress={() => {
                          onSelectCategory(category);
                          closeSheet();
                        }}
                        style={[
                          styles.categoryChip,
                          isSelected && styles.categoryChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            isSelected && styles.categoryChipTextSelected,
                          ]}
                        >
                          {category.emoji} {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityLabel="Add new category"
                    accessibilityRole="button"
                    onPress={() => setIsNewCategoryOpen(true)}
                    style={styles.categoryChip}
                  >
                    <Text style={styles.categoryChipText}>+ New category</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </View>

      <NewCategorySheet
        initialColor={editingCategory?.color}
        initialEmoji={editingCategory?.category.emoji}
        initialName={editingCategory?.category.name}
        onClose={() => {
          setIsNewCategoryOpen(false);
          setEditingCategory(null);
        }}
        onDelete={editingCategory ? handleDeleteEditingCategory : undefined}
        onSave={editingCategory ? handleUpdateCategory : handleAddCategory}
        type={type}
        visible={isNewCategoryOpen || editingCategory !== null}
      />
    </Modal>
  );
}

const DescriptionInput = forwardRef<TextInput, {
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  value: string;
}>(function DescriptionInput({ onChangeText, onSubmitEditing, placeholder, value }, ref) {
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || value.length > 0;

  return (
    <View style={[styles.pill, isActive && styles.pillAccent]}>
      {/* Invisible sizer — pill width tracks content or placeholder */}
      <Text numberOfLines={1} style={[styles.pillText, styles.descriptionSizer]}>
        {value || placeholder}
      </Text>
      <TextInput
        ref={ref}
        autoCapitalize="sentences"
        cursorColor={figmaColors.blue["500"]}
        onBlur={() => setIsFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={figmaColors.grayNeutral["400"]}
        returnKeyType="done"
        selectionColor={figmaColors.blue["500"]}
        style={[
          styles.pillText,
          isActive && styles.pillTextAccent,
          styles.descriptionInput,
        ]}
        value={value}
      />
    </View>
  );
});

function SentencePill({
  children,
  onPress,
  variant = "default",
}: {
  children: string;
  onPress?: () => void;
  variant?: "default" | "accent" | "filled";
}) {
  const isAccent = variant === "accent" || variant === "filled";
  const isFilled = variant === "filled";

  const content = (
    <View
      style={[
        styles.pill,
        isAccent && styles.pillAccent,
        isFilled && styles.pillFilled,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          isAccent && styles.pillTextAccent,
          isFilled && styles.pillTextFilled,
        ]}
      >
        {children}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}

function AmountDisplay({
  expression,
}: {
  expression: string;
}) {
  const displayParts = getExpressionDisplayParts(expression);
  const formattedExpression = formatExpressionWithCommas(expression);

  if (!expression) {
    return (
      <View style={styles.amountDisplayRow}>
        <Text style={styles.amountWhole}>0.</Text>
        <Text style={styles.amountDecimal}>00</Text>
      </View>
    );
  }

  if (displayParts) {
    return (
      <View style={styles.amountDisplayRowFit}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.45}
          numberOfLines={1}
          style={styles.amountExpressionBase}
        >
          <Text style={styles.amountWhole}>{displayParts.whole}.</Text>
          <Text style={styles.amountDecimal}>{displayParts.decimal}</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.amountDisplayRowFit}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.45}
        numberOfLines={1}
        style={styles.amountExpression}
      >
        {formattedExpression}
      </Text>
    </View>
  );
}

function AmountInputSheet({
  amountCents,
  onChangeAmount,
  onClose,
  onConfirm,
  onDismiss,
  onSelectCurrency,
  selectedCurrency,
  visible,
}: {
  amountCents: number;
  onChangeAmount: (amountCents: number) => void;
  onClose: () => void;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onSelectCurrency: (currency: Currency) => void;
  selectedCurrency: Currency;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [expression, setExpression] = useState(centsToExpression(amountCents));
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const currencyCode = selectedCurrency.code;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(800)).current;

  useEffect(() => {
    if (visible) {
      setExpression(centsToExpression(amountCents));
      translateY.setValue(800);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const closeWithAnimation = useCallback((afterClose?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 220, toValue: 800, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        onClose();
        afterClose?.();
        onDismiss?.();
      }
    });
  }, [backdropOpacity, onClose, onDismiss, translateY]);

  const handleKeyPress = (key: KeypadKey) => {
    if (key.type === "empty") {
      return;
    }

    if (key.type === "ok") {
      onChangeAmount(expressionToCents(expression));
      closeWithAnimation(onConfirm);
      return;
    }

    if (key.type === "delete") {
      setExpression((current) => current.slice(0, -1));
      return;
    }

    if (key.type === "operator") {
      if (key.value === "=") {
        const result = evaluateExpression(expression);

        if (result === 0) {
          setExpression("");
        } else {
          const rounded = Math.round(result * 100) / 100;

          setExpression(rounded.toString());
        }
        return;
      }

      if (key.value === ".") {
        setExpression((current) => appendDecimal(current));
        return;
      }

      setExpression((current) => appendOperator(current, key.value));
      return;
    }

    setExpression((current) => {
      const next = `${current}${key.value}`;

      if (expressionToCents(next) > MAX_AMOUNT_CENTS) {
        return current;
      }

      return next;
    });
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={() => closeWithAnimation()}
      transparent
      visible={visible}
    >
      <View style={styles.amountSheetBackdrop}>
        <Animated.View
          pointerEvents="box-none"
          style={[styles.amountSheetOverlay, { opacity: backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close amount input"
            accessibilityRole="button"
            onPress={() => closeWithAnimation()}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.amountSheet,
            { paddingBottom: Math.max(insets.bottom, 8), transform: [{ translateY }] },
          ]}
        >
          <View style={styles.amountSheetHeader}>
            <Text style={styles.amountSheetTitle}>Amount</Text>
            <Pressable
              accessibilityLabel="Close amount input"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => closeWithAnimation()}
              style={styles.closeButton}
            >
              <CloseIcon />
            </Pressable>
          </View>

          <View style={styles.amountDisplaySection}>
            <AmountDisplay expression={expression} />

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChangeAmount(expressionToCents(expression));
                setIsCurrencyPickerOpen(true);
              }}
              style={styles.currencySelector}
            >
              <Text style={styles.currencySelectorText}>{currencyCode}</Text>
              <DownIcon />
            </Pressable>
          </View>

          <View style={styles.keypad}>
            {keypadRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.keypadRow}>
                {row.map((key, keyIndex) => {
                  if (key.type === "empty") {
                    return (
                      <View
                        key={`empty-${rowIndex}-${keyIndex}`}
                        style={styles.keypadCell}
                      />
                    );
                  }

                  const isOk = key.type === "ok";

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        key.type === "digit"
                          ? `Number ${key.value}`
                          : key.type === "delete"
                            ? "Delete"
                            : key.type === "ok"
                              ? "Confirm amount"
                              : key.value
                      }
                      key={`${rowIndex}-${keyIndex}`}
                      onPress={() => handleKeyPress(key)}
                      style={[
                        styles.keypadCell,
                        isOk && styles.keypadOkCell,
                      ]}
                    >
                      {key.type === "digit" ? (
                        <Text style={styles.keypadDigitText}>{key.value}</Text>
                      ) : null}
                      {key.type === "operator" ? (
                        <Text style={styles.keypadOperatorText}>{key.value}</Text>
                      ) : null}
                      {key.type === "delete" ? <BackspaceIcon /> : null}
                      {key.type === "ok" ? (
                        <Text style={styles.keypadOkText}>OK</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      <CurrencyPicker
        onClose={() => setIsCurrencyPickerOpen(false)}
        onSelectCurrency={(currency) => {
          onSelectCurrency(currency);
          setIsCurrencyPickerOpen(false);
        }}
        visible={isCurrencyPickerOpen}
      />
    </Modal>
  );
}

const PHOTO_TILE_SIZE = Math.floor((Dimensions.get("window").width - 32 - 8) / 4);

function ImageUploadBottomSheet({
  initialImages,
  onClose,
  onConfirm,
  visible,
}: {
  initialImages: SelectedImage[];
  onClose: () => void;
  onConfirm: (images: SelectedImage[]) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [selected, setSelected] = useState<SelectedImage[]>([]);
  const [recentAssets, setRecentAssets] = useState<MediaLibrary.Asset[]>([]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      setSelected(initialImages);
      translateY.setValue(600);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
      loadRecent();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(600);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRecent() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") return;
    const { assets } = await MediaLibrary.getAssetsAsync({
      first: 20,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: MediaLibrary.SortBy.creationTime,
    });
    setRecentAssets(assets);
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setSelected((prev) => [
        ...prev,
        {
          id: a.assetId ?? `camera-${a.uri}`,
          uri: a.uri,
          width: a.width,
          height: a.height,
          fileName: a.fileName,
          mimeType: a.mimeType,
          source: "camera",
        },
      ]);
    }
  }

  async function handleAllPhotos() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (!result.canceled) {
      const newImgs: SelectedImage[] = result.assets.map((a) => ({
        id: a.assetId ?? `gallery-${a.uri}`,
        uri: a.uri,
        width: a.width,
        height: a.height,
        fileName: a.fileName,
        mimeType: a.mimeType,
        source: "gallery" as const,
      }));
      setSelected((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        return [...prev, ...newImgs.filter((i) => !existingIds.has(i.id))];
      });
    }
  }

  function toggleAsset(asset: MediaLibrary.Asset) {
    setSelected((prev) => {
      const exists = prev.find((i) => i.id === asset.id);
      if (exists) return prev.filter((i) => i.id !== asset.id);
      return [
        ...prev,
        {
          id: asset.id,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          fileName: asset.filename,
          source: "recent" as const,
        },
      ];
    });
  }

  const addLabel =
    selected.length > 0
      ? `Add ${selected.length} image${selected.length > 1 ? "s" : ""}`
      : "Add images";

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <View style={styles.imgUploadRoot}>
        <Animated.View style={[styles.imgUploadBackdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View pointerEvents="box-none" style={styles.imgUploadContainer}>
          <Animated.View
            style={[
              styles.imgUploadSheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
              { transform: [{ translateY }] },
            ]}
          >
            {/* Handle */}
            <View style={styles.imgUploadHandle} />

            {/* Header */}
            <View style={styles.imgUploadHeader}>
              <Text style={styles.imgUploadTitle}>Upload image</Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleAllPhotos}
              >
                <Text style={styles.imgUploadAllPhotos}>All Photos</Text>
              </Pressable>
            </View>

            <View style={styles.imgUploadDivider} />

            {/* Horizontal photo row: camera tile + recent photos */}
            <ScrollView
              contentContainerStyle={styles.imgUploadRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imgUploadRowScroll}
            >
              {/* Camera tile */}
              <Pressable
                accessibilityLabel="Take photo"
                accessibilityRole="button"
                onPress={handleCamera}
                style={styles.imgUploadCameraTile}
              >
                <CameraIcon size={PHOTO_TILE_SIZE * 0.38} />
              </Pressable>

              {/* Recent photo tiles */}
              {recentAssets.map((asset) => {
                const isSelected = selected.some((i) => i.id === asset.id);
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => toggleAsset(asset)}
                    style={styles.imgUploadPhotoTile}
                  >
                    <Image
                      contentFit="cover"
                      source={{ uri: asset.uri }}
                      style={styles.imgUploadPhotoThumb}
                    />
                    {/* Selection circle */}
                    <View style={[
                      styles.imgUploadSelectCircle,
                      isSelected && styles.imgUploadSelectCircleActive,
                    ]}>
                      {isSelected && (
                        <Text style={styles.imgUploadSelectCheck}>✓</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Add images button */}
            <Pressable
              accessibilityRole="button"
              onPress={() => { onConfirm(selected); closeSheet(); }}
              style={[
                styles.imgUploadAddBtn,
                selected.length > 0 && styles.imgUploadAddBtnActive,
              ]}
            >
              <Text style={[
                styles.imgUploadAddBtnText,
                selected.length > 0 && styles.imgUploadAddBtnTextActive,
              ]}>
                {addLabel}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

export default function AddEntryScreen() {
  const router = useRouter();
  const { transactionId: routeTransactionId, accountId: routeAccountId, date: routeDate } = useLocalSearchParams<{
    transactionId?: string;
    accountId?: string;
    date?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { categoryColors } = useCategoriesStore();
  const transactionId =
    typeof routeTransactionId === "string" ? routeTransactionId : undefined;
  const initialDate =
    typeof routeDate === "string" && !Number.isNaN(new Date(routeDate).getTime())
      ? new Date(routeDate)
      : new Date();
  const isEditing = transactionId !== undefined;
  const editInitializedRef = useRef(false);
  const [transactionType, setTransactionType] =
    useState<TransactionType>("expense");
  const [amountCents, setAmountCents] = useState(0);
  const [description, setDescription] = useState("");
  const [isAmountSheetOpen, setIsAmountSheetOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(
    currencies.find((c) => c.code === "USD") ?? currencies[0],
  );
  const [selectedDate, setSelectedDate] = useState(() => initialDate);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [recurringOption, setRecurringOption] = useState("Never");
  const [isRecurringSheetOpen, setIsRecurringSheetOpen] = useState(false);
  const [isCustomIntervalOpen, setIsCustomIntervalOpen] = useState(false);
  const [customNumber, setCustomNumber] = useState(1);
  const [customUnit, setCustomUnit] = useState<CustomUnit>("months");
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const {
    accounts: storeAccounts,
    hiddenAccountIds: hiddenAccountIdsArray,
    addAccount: storeAddAccount,
    removeAccount: storeRemoveAccount,
    reorderInGroup,
    moveToGroup,
    setOpeningBalance,
  } = useAccountsStore();
  const hiddenAccountIdSet = useMemo(() => new Set(hiddenAccountIdsArray), [hiddenAccountIdsArray]);
  const localAccounts: Account[] = storeAccounts.map((a) => ({ ...a, balanceCents: a.openingBalanceCents }));
  const [allTransactions, setAllTransactions] = useState<StoredTransaction[]>([]);
  const [editBalanceAccountId, setEditBalanceAccountId] = useState<string | null>(null);
  const [editBalanceCents, setEditBalanceCents] = useState(0);
  const [isEditBalanceOpen, setIsEditBalanceOpen] = useState(false);

  useEffect(() => {
    editInitializedRef.current = false;
  }, [transactionId]);

  const accountId = typeof routeAccountId === "string" ? routeAccountId : undefined;
  const localAccountsRef = useRef(localAccounts);
  localAccountsRef.current = localAccounts;

  useEffect(() => {
    if (!accountId || isEditing) return;
    const match = localAccountsRef.current.find((a) => a.id === accountId);
    if (match) setSelectedAccount(match);
    // localAccounts intentionally accessed via ref to avoid re-running on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, isEditing]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        AsyncStorage.getItem(TRANSACTIONS_KEY),
        AsyncStorage.getItem(HOME_CURRENCY_KEY),
      ]).then(([txData, homeCurrencyCode]) => {
        const storedTransactions = txData
          ? (JSON.parse(txData) as RecordedTransaction[])
          : [];

        setAllTransactions(storedTransactions);

        if (homeCurrencyCode && !transactionId) {
          const homeCurrency = currencies.find((c) => c.code === homeCurrencyCode);
          if (homeCurrency) setSelectedCurrency(homeCurrency);
        }

        if (!transactionId || editInitializedRef.current) return;

        const transaction = storedTransactions.find(
          (stored) => stored.id === transactionId,
        );
        if (!transaction) return;

        editInitializedRef.current = true;
        setTransactionType(transaction.type);
        setAmountCents(transaction.amountCents);
        setDescription(transaction.description ?? "");
        setSelectedCurrency(
          currencies.find((currency) => currency.code === transaction.currencyCode) ??
            currencies[0],
        );
        setSelectedDate(new Date(transaction.date));
        setRecurringOption(transaction.recurringOption ?? "Never");
        setSelectedCategory(
          transaction.type === "transfer" ||
            !transaction.categoryName ||
            transaction.categoryName === "Uncategorized"
            ? null
            : {
                emoji: transaction.categoryEmoji,
                name: transaction.categoryName,
              },
        );
        setSelectedAccount(
          localAccounts.find((account) => account.name === transaction.accountName) ??
            null,
        );
        setTransferDestinationAccount(
          localAccounts.find(
            (account) => account.name === transaction.destinationAccountName,
          ) ?? null,
        );
        setTransactionImages(
          (transaction.imageUris ?? []).map((uri, index) => ({
            height: 0,
            id: `${transaction.id}-image-${index}`,
            source: "gallery" as const,
            uri,
            width: 0,
          })),
        );
      }).catch(() => {});
    }, [transactionId]),
  );

  const displayAccounts = useMemo(
    () => applyTransactionsToAccounts(localAccounts, allTransactions),
    [localAccounts, allTransactions],
  );

  function handleOpenEditBalance(accountId: string) {
    const account = displayAccounts.find((a) => a.id === accountId);
    if (!account) return;
    setEditBalanceAccountId(accountId);
    setEditBalanceCents(account.balanceCents);
    setIsEditBalanceOpen(true);
  }

  function handleConfirmEditBalance(newBalanceCents: number) {
    if (!editBalanceAccountId) return;
    const net = allTransactions.reduce((sum, tx) => {
      const account = localAccounts.find((a) => a.id === editBalanceAccountId);
      if (!account) return sum;
      if (tx.type === "transfer") {
        if (tx.accountName === account.name) return sum - tx.amountCents;
        if (tx.destinationAccountName === account.name) return sum + tx.amountCents;
        return sum;
      }
      if (tx.accountName !== account.name) return sum;
      if (tx.type === "income") return sum + tx.amountCents;
      if (tx.type === "expense") return sum - tx.amountCents;
      return sum;
    }, 0);
    setOpeningBalance(editBalanceAccountId, newBalanceCents - net);
    setIsEditBalanceOpen(false);
    setEditBalanceAccountId(null);
  }
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [transferDestinationAccount, setTransferDestinationAccount] =
    useState<Account | null>(null);
  const [isDestinationAccountPickerOpen, setIsDestinationAccountPickerOpen] =
    useState(false);
  const [isAccountsEditOpen, setIsAccountsEditOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const [transactionImages, setTransactionImages] = useState<SelectedImage[]>([]);
  const descriptionInputRef = useRef<TextInput>(null);
  const shouldOpenDestinationAfterSourceRef = useRef(false);
  const shouldFocusTitleAfterDestinationRef = useRef(false);
  const shouldOpenAccountAfterCategoryRef = useRef(false);

  const currencySymbol = currencySymbols[selectedCurrency.code] ?? selectedCurrency.code;
  const hasAmount = amountCents > 0;
  const amountLabel = hasAmount
    ? formatAmountLabel(amountCents, currencySymbol)
    : `e.g ${currencySymbol}${transactionType !== "expense" ? "1,000.00" : "500.00"}`;
  const isTransfer = transactionType === "transfer";
  const canRecord =
    hasAmount &&
    selectedAccount !== null &&
    (isTransfer
      ? transferDestinationAccount !== null &&
        selectedAccount.id !== transferDestinationAccount.id
      : selectedCategory !== null);

  const sentenceVerb =
    transactionType === "income"
      ? "received"
      : transactionType === "transfer"
        ? "moved"
        : "spent";

  const recordLabel =
    isEditing
      ? "Save"
      : transactionType === "income"
        ? "Record income"
        : transactionType === "transfer"
          ? "Record transfer"
          : "Record expense";

  const openNextRequiredTransactionInput = useCallback(() => {
    setTimeout(() => {
      if (transactionType === "transfer") {
        setIsAccountPickerOpen(true);
        return;
      }

      descriptionInputRef.current?.focus();
    }, 50);
  }, [transactionType]);

  const openNextInputAfterTitle = useCallback(() => {
    if (transactionType === "transfer") return;
    descriptionInputRef.current?.blur();
    setTimeout(() => setIsCategoryPickerOpen(true), 50);
  }, [transactionType]);

  async function handleRecord() {
    if (!canRecord) return;

    const transaction: RecordedTransaction = {
      id: transactionId ?? Math.random().toString(36).slice(2),
      type: transactionType,
      amountCents,
      description,
      categoryEmoji: isTransfer ? "↔️" : selectedCategory?.emoji ?? "",
      categoryName: isTransfer ? "Transfer" : selectedCategory?.name ?? "Uncategorized",
      categoryColor: isTransfer
        ? figmaColors.grayNeutral["400"]
        : categoryColors[selectedCategory?.name ?? ""] ?? figmaColors.grayNeutral["300"],
      accountName: selectedAccount?.name ?? "",
      destinationAccountName: isTransfer
        ? transferDestinationAccount?.name ?? ""
        : undefined,
      date: selectedDate.toISOString(),
      currencyCode: selectedCurrency.code,
      recurringOption,
      imageUris: transactionImages.map((i) => i.uri),
    };
    try {
      const existing = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      const list = existing ? (JSON.parse(existing) as RecordedTransaction[]) : [];
      const nextTransactions = isEditing
        ? list.map((stored) =>
            stored.id === transaction.id ? transaction : stored,
          )
        : [transaction, ...list];
      await AsyncStorage.setItem(
        TRANSACTIONS_KEY,
        JSON.stringify(nextTransactions),
      );
    } catch {
      // silently continue — don't block navigation on storage failure
    }
    router.replace(isEditing ? "/?recorded=saved" : "/?recorded=1");
  }

  async function handleDelete() {
    if (!transactionId) return;

    try {
      const existing = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      const list = existing ? (JSON.parse(existing) as RecordedTransaction[]) : [];
      const originalIndex = list.findIndex((stored) => stored.id === transactionId);
      const transaction = originalIndex >= 0 ? list[originalIndex] : null;
      await AsyncStorage.setItem(
        TRANSACTIONS_KEY,
        JSON.stringify(list.filter((stored) => stored.id !== transactionId)),
      );
      if (transaction) {
        useUIStore.getState().setPendingDeletedTransaction({
          originalIndex,
          transaction,
        });
      }
    } catch {
      // Keep navigation reliable even if local persistence fails.
    }
    router.replace({
      pathname: "/",
      params: { deletedType: transactionType, recorded: "deleted" },
    });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable
            accessibilityLabel="Close add entry"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <CloseIcon />
          </Pressable>

          {isEditing ? (
            <Pressable
              accessibilityLabel="Delete transaction"
              accessibilityRole="button"
              hitSlop={10}
              onPress={handleDelete}
              style={styles.deleteButton}
            >
              <TrashIcon />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.tabSwitcher}>
          {transactionTabs.map((tab) => {
            const isActive = tab.value === transactionType;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                key={tab.value}
                onPress={() => setTransactionType(tab.value)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sentenceContainer}>
          <Text style={styles.sentenceWord}>I {sentenceVerb}</Text>
          <SentencePill
            onPress={() => setIsAmountSheetOpen(true)}
            variant={hasAmount ? "filled" : "default"}
          >
            {amountLabel}
          </SentencePill>

          {isTransfer ? (
            <>
              <Text style={styles.sentenceWord}>from</Text>
              <SentencePill
                onPress={() => setIsAccountPickerOpen(true)}
                variant={selectedAccount ? "filled" : "default"}
              >
                {selectedAccount?.name ?? "e.g checking account"}
              </SentencePill>
              <Text style={styles.sentenceWord}>to</Text>
              <SentencePill
                onPress={() => setIsDestinationAccountPickerOpen(true)}
                variant={transferDestinationAccount ? "filled" : "default"}
              >
                {transferDestinationAccount?.name ?? "e.g joint account"}
              </SentencePill>
              <Text style={styles.sentenceWord}>for</Text>
              <DescriptionInput
                ref={descriptionInputRef}
                onChangeText={setDescription}
                placeholder="e.g rent share"
                value={description}
              />
            </>
          ) : (
            <>
              <Text style={styles.sentenceWord}>
                {transactionType === "income" ? "for" : "on"}
              </Text>
              <DescriptionInput
                ref={descriptionInputRef}
                onChangeText={setDescription}
                onSubmitEditing={openNextInputAfterTitle}
                placeholder={
                  transactionType === "income"
                    ? "e.g logo design"
                    : "e.g Nike"
                }
                value={description}
              />
              <Text style={styles.sentenceWord}>as</Text>
              <SentencePill
                onPress={() => setIsCategoryPickerOpen(true)}
                variant={selectedCategory ? "filled" : "default"}
              >
                {selectedCategory
                  ? `${selectedCategory.emoji} ${selectedCategory.name}`
                  : transactionType === "income"
                    ? "e.g 💻 freelance"
                    : "e.g 🧥 apparel"}
              </SentencePill>
              <Text style={styles.sentenceWord}>
                {transactionType === "income" ? "into" : "from"}
              </Text>
              <SentencePill
                onPress={() => setIsAccountPickerOpen(true)}
                variant={selectedAccount ? "filled" : "default"}
              >
                {selectedAccount
                  ? selectedAccount.name
                  : transactionType === "income"
                    ? "e.g bank account"
                    : "e.g cash wallet"}
              </SentencePill>
            </>
          )}

          <Text style={styles.sentenceWord}>on</Text>
          <SentencePill onPress={() => setIsDatePickerOpen(true)} variant="accent">
            {`🗓️ ${format(selectedDate, "d MMMM yyyy")}`}
          </SentencePill>
        </View>

        <View style={styles.divider} />

        <View style={styles.optionsSection}>
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>Repeats</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsRecurringSheetOpen(true)}
              style={styles.optionPillAccent}
            >
              <Text style={styles.optionPillAccentText}>{recurringOption}</Text>
            </Pressable>
          </View>

          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>Attach image (optional)</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsImageUploadOpen(true)}
              style={styles.optionPillDefault}
            >
              <Text style={styles.optionPillDefaultText}>Upload</Text>
            </Pressable>
          </View>

          {transactionImages.length > 0 && (
            <ScrollView
              contentContainerStyle={styles.attachedImagesRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.attachedImagesScroll}
            >
              {transactionImages.map((img) => (
                <View key={img.id} style={styles.attachedImageWrap}>
                  <Image
                    contentFit="cover"
                    source={{ uri: img.uri }}
                    style={styles.attachedImageThumb}
                  />
                  <Pressable
                    accessibilityLabel="Remove image"
                    accessibilityRole="button"
                    hitSlop={6}
                    onPress={() =>
                      setTransactionImages((prev) => prev.filter((i) => i.id !== img.id))
                    }
                    style={styles.attachedImageRemove}
                  >
                    <Text style={styles.attachedImageRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canRecord }}
          disabled={!canRecord}
          onPress={handleRecord}
          style={[
            styles.recordButton,
            canRecord && styles.recordButtonEnabled,
          ]}
        >
          <Text
            style={[
              styles.recordButtonText,
              canRecord && styles.recordButtonTextEnabled,
            ]}
          >
            {recordLabel}
          </Text>
        </Pressable>
      </View>

      <AmountInputSheet
        amountCents={amountCents}
        onChangeAmount={setAmountCents}
        onClose={() => {
          setIsAmountSheetOpen(false);
        }}
        onConfirm={openNextRequiredTransactionInput}
        onSelectCurrency={setSelectedCurrency}
        selectedCurrency={selectedCurrency}
        visible={isAmountSheetOpen}
      />

      <CategoryPickerSheet
        type={transactionType === "income" ? "income" : "expense"}
        onClose={() => {
          setIsCategoryPickerOpen(false);
          if (shouldOpenAccountAfterCategoryRef.current) {
            shouldOpenAccountAfterCategoryRef.current = false;
            setTimeout(() => setIsAccountPickerOpen(true), 50);
          }
        }}
        onSelectCategory={(category) => {
          setSelectedCategory(category);
          shouldOpenAccountAfterCategoryRef.current = transactionType !== "transfer";
        }}
        selectedCategory={selectedCategory}
        visible={isCategoryPickerOpen}
      />

      <AccountPickerSheet
        accounts={displayAccounts.filter((a) => !hiddenAccountIdSet.has(a.id))}
        onClose={() => {
          setIsAccountPickerOpen(false);
          if (shouldOpenDestinationAfterSourceRef.current) {
            shouldOpenDestinationAfterSourceRef.current = false;
            setTimeout(() => setIsDestinationAccountPickerOpen(true), 50);
          }
        }}
        onEditAccounts={() => {
          setIsAccountPickerOpen(false);
          setIsAccountsEditOpen(true);
        }}
        onNewAccount={() => {
          setIsAccountPickerOpen(false);
          setIsCreateAccountOpen(true);
        }}
        onSelectAccount={(account) => {
          setSelectedAccount(account);
          shouldOpenDestinationAfterSourceRef.current = transactionType === "transfer";
          if (transferDestinationAccount?.id === account.id) {
            setTransferDestinationAccount(null);
          }
        }}
        selectedAccount={selectedAccount}
        visible={isAccountPickerOpen}
      />

      <AccountPickerSheet
        accounts={displayAccounts.filter(
          (account) => !hiddenAccountIdSet.has(account.id) && account.id !== selectedAccount?.id,
        )}
        onClose={() => {
          setIsDestinationAccountPickerOpen(false);
          if (shouldFocusTitleAfterDestinationRef.current) {
            shouldFocusTitleAfterDestinationRef.current = false;
            setTimeout(() => descriptionInputRef.current?.focus(), 50);
          }
        }}
        onEditAccounts={() => {
          setIsDestinationAccountPickerOpen(false);
          setIsAccountsEditOpen(true);
        }}
        onNewAccount={() => {
          setIsDestinationAccountPickerOpen(false);
          setIsCreateAccountOpen(true);
        }}
        onSelectAccount={(account) => {
          setTransferDestinationAccount(account);
          shouldFocusTitleAfterDestinationRef.current = transactionType === "transfer";
        }}
        selectedAccount={transferDestinationAccount}
        visible={isDestinationAccountPickerOpen}
      />

      <AccountsBottomSheet
        groups={groupAccounts(displayAccounts)}
        onClose={() => setIsAccountsEditOpen(false)}
        onEditBalance={handleOpenEditBalance}
        onMoveAccountToGroup={(accountId, toGroup, atIndex) => moveToGroup(accountId, toGroup, atIndex)}
        onNewAccount={() => {
          setIsAccountsEditOpen(false);
          setIsCreateAccountOpen(true);
        }}
        onRemoveAccount={(id) => storeRemoveAccount(id)}
        onReorderAccounts={(group, ids) => reorderInGroup(group, ids)}
        onSelectAccount={(account) => {
          setSelectedAccount(account);
          setIsAccountsEditOpen(false);
        }}
        selectedAccountId={selectedAccount?.id ?? null}
        visible={isAccountsEditOpen}
      />

      <AmountInputSheet
        amountCents={editBalanceCents}
        onChangeAmount={setEditBalanceCents}
        onClose={() => handleConfirmEditBalance(editBalanceCents)}
        onSelectCurrency={setSelectedCurrency}
        selectedCurrency={selectedCurrency}
        visible={isEditBalanceOpen}
      />

      <CreateAccountBottomSheet
        groups={accountGroupOrder}
        onClose={() => setIsCreateAccountOpen(false)}
        onSubmit={(values) => {
          const openingCents = Math.round(values.balance * 100);
          storeAddAccount({
            id: Date.now().toString(36),
            name: values.name,
            group: values.groupId,
            openingBalanceCents: openingCents,
            currencyCode: values.currencyCode,
          });
          setIsCreateAccountOpen(false);
        }}
        selectedCurrency={selectedCurrency}
        visible={isCreateAccountOpen}
      />

      <DatePickerSheet
        initialDate={selectedDate}
        onClose={() => setIsDatePickerOpen(false)}
        onSave={setSelectedDate}
        visible={isDatePickerOpen}
      />

      <RecurringSheet
        onClose={() => setIsRecurringSheetOpen(false)}
        onCustom={() => setIsCustomIntervalOpen(true)}
        onSelect={setRecurringOption}
        selected={recurringOption}
        visible={isRecurringSheetOpen}
      />

      <CustomIntervalSheet
        initialNumber={customNumber}
        initialUnit={customUnit}
        onClose={() => setIsCustomIntervalOpen(false)}
        onSave={(n, u) => {
          setCustomNumber(n);
          setCustomUnit(u);
          const label = n === 1 ? u.slice(0, -1) : u;
          setRecurringOption(`Every ${n} ${label}`);
        }}
        visible={isCustomIntervalOpen}
      />

      <ImageUploadBottomSheet
        initialImages={transactionImages}
        onClose={() => setIsImageUploadOpen(false)}
        onConfirm={(images) => {
          setTransactionImages(images);
          setIsImageUploadOpen(false);
        }}
        visible={isImageUploadOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: figmaColors.bg,
    flex: 1,
  },
  header: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: figmaColors.error["100"],
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  tabSwitcher: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 9999,
    flexDirection: "row",
    gap: 2,
    padding: 4,
  },
  tabItem: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabItemActive: {
    backgroundColor: figmaColors.base.white,
    elevation: 2,
    shadowColor: "#18181B",
    shadowOffset: {
      height: 4,
      width: 0,
    },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  tabLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.084,
    lineHeight: 20,
  },
  tabLabelActive: {
    color: figmaColors.grayNeutral["900"],
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sentenceContainer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sentenceWord: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.56,
    lineHeight: 34,
  },
  pill: {
    backgroundColor: figmaColors.grayNeutral["200"],
    borderRadius: 8,
    padding: 8,
  },
  pillAccent: {
    backgroundColor: figmaColors.blue["50"],
  },
  pillFilled: {
    backgroundColor: figmaColors.blue["50"],
  },
  pillText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.48,
    lineHeight: 29,
  },
  pillTextAccent: {
    color: figmaColors.blue["500"],
  },
  pillTextFilled: {
    color: figmaColors.blue["500"],
  },
  descriptionSizer: {
    includeFontPadding: false,
    opacity: 0,
  },
  descriptionInput: {
    bottom: 0,
    includeFontPadding: false,
    left: 0,
    padding: 8,
    position: "absolute",
    right: 0,
    top: 0,
  },
  amountSheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  amountSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: figmaColors.base.overlay,
  },
  amountSheet: {
    backgroundColor: figmaColors.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  amountSheetHeader: {
    alignItems: "center",
    borderBottomColor: figmaColors.grayNeutral["200"],
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  amountSheetTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 18,
    letterSpacing: -0.27,
    lineHeight: 24,
  },
  amountDisplaySection: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 56,
  },
  amountDisplayRow: {
    alignItems: "baseline",
    flexDirection: "row",
  },
  amountDisplayRowFit: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    width: "100%",
  },
  amountExpressionBase: {
    fontFamily: fontFamily.medium,
    fontSize: 48,
    letterSpacing: -0.48,
    lineHeight: 56,
    textAlign: "center",
    width: "100%",
  },
  amountExpression: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 48,
    letterSpacing: -0.48,
    lineHeight: 56,
    textAlign: "center",
    width: "100%",
  },
  amountWhole: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 48,
    letterSpacing: -0.48,
    lineHeight: 56,
  },
  amountDecimal: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 48,
    letterSpacing: -0.48,
    lineHeight: 56,
  },
  currencySelector: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingLeft: 16,
    paddingVertical: 8,
  },
  currencySelectorText: {
    color: figmaColors.grayNeutral["600"],
    fontFamily: fontFamily.medium,
    fontSize: 18,
    letterSpacing: -0.27,
    lineHeight: 24,
  },
  keypad: {
    gap: 8,
    paddingHorizontal: 16,
  },
  keypadRow: {
    flexDirection: "row",
    gap: 6,
    height: 72,
  },
  keypadCell: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  keypadOkCell: {
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
  keypadDigitText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.36,
    lineHeight: 32,
  },
  keypadOperatorText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.36,
    lineHeight: 32,
  },
  keypadOkText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.176,
    lineHeight: 24,
  },
  divider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  optionsSection: {
    gap: 16,
  },
  optionRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  optionLabel: {
    color: figmaColors.grayNeutral["700"],
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 24,
    marginRight: 12,
  },
  optionPillAccent: {
    backgroundColor: figmaColors.blue["50"],
    borderRadius: 8,
    padding: 8,
  },
  optionPillAccentText: {
    color: figmaColors.blue["500"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  optionPillDefault: {
    backgroundColor: figmaColors.grayNeutral["200"],
    borderRadius: 8,
    padding: 8,
  },
  optionPillDefaultText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  footer: {
    backgroundColor: figmaColors.bg,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  recordButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: "100%",
  },
  recordButtonEnabled: {
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
  recordButtonText: {
    color: figmaColors.grayNeutral["300"],
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.176,
    lineHeight: 24,
  },
  recordButtonTextEnabled: {
    color: figmaColors.base.white,
  },
  categorySheetRoot: {
    flex: 1,
  },
  categorySheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: figmaColors.base.overlay,
  },
  categorySheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  categorySheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  categorySheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  categorySheetTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  categorySheetHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  categoryHeaderButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  categoryHeaderButtonDanger: {
    backgroundColor: "#FECACA",
  },
  categoryDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  accountGroupChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  createAccountSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  createAccountRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  createAccountLabel: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  createAccountControl: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  createAccountControlFilled: {
    backgroundColor: figmaColors.blue["50"],
  },
  createAccountControlText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  createAccountControlTextFilled: {
    color: figmaColors.blue["600"],
  },
  createAccountPlaceholder: {
    color: figmaColors.grayNeutral["400"],
  },
  createAccountInputWrapper: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    overflow: "hidden",
  },
  createAccountInputWrapperFilled: {
    backgroundColor: figmaColors.blue["50"],
  },
  createAccountInputSizer: {
    color: "transparent",
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  createAccountInputText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  createAccountInputTextFilled: {
    color: figmaColors.blue["600"],
  },
  createAccountInput: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    height: 44,
    letterSpacing: -0.15,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  createAccountDivider: {
    borderBottomColor: figmaColors.grayNeutral["200"],
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  createAccountDescriptionSection: {
    gap: 10,
    paddingBottom: 8,
    paddingTop: 14,
  },
  createAccountDescriptionInput: {
    backgroundColor: figmaColors.grayNeutral["50"],
    borderRadius: 10,
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 22,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  createAccountButton: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    marginTop: 12,
  },
  createAccountButtonDisabled: {
    backgroundColor: figmaColors.grayNeutral["100"],
  },
  createAccountButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  createAccountButtonTextDisabled: {
    color: figmaColors.grayNeutral["400"],
  },
  accountsSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "65%",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  accountsSheetList: {
    paddingBottom: 8,
  },
  accountGroupHeader: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["50"],
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 11,
  },
  accountGroupName: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  accountGroupTotal: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  accountEditRow: {
    alignItems: "center",
    backgroundColor: figmaColors.base.white,
    flexDirection: "row",
    gap: 12,
    minHeight: ACCOUNT_ITEM_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  accountEditRowDragging: {
    borderRadius: 12,
    elevation: 12,
    shadowColor: figmaColors.base.black,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  accountEditNameArea: {
    flex: 1,
  },
  accountEditName: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  accountEditBalance: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  categoryChip: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryChipText: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  categoryChipSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  categoryChipTextSelected: {
    color: figmaColors.base.white,
  },
  accountsEmptyState: {
    alignItems: "center",
    gap: 8,
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  accountsEmptyTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    marginTop: 8,
    textAlign: "center",
  },
  accountsEmptySubtitle: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 22,
    textAlign: "center",
  },
  accountsEmptyButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    marginTop: 16,
    paddingHorizontal: 32,
    width: "100%",
  },
  accountsEmptyButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  categoryList: {
    paddingBottom: 8,
  },
  editRow: {
    alignItems: "center",
    backgroundColor: figmaColors.base.white,
    borderBottomColor: figmaColors.grayNeutral["200"],
    borderBottomWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
  },
  editRowDragging: {
    borderRadius: 12,
    elevation: 12,
    shadowColor: figmaColors.base.black,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  editRowTextArea: {
    flex: 1,
  },
  editRowText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 17,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  editRowRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  colorChip: {
    borderRadius: 8,
    height: 32,
    width: 32,
  },
  newCategorySheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  newCategoryEmojiSection: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emojiPreviewBox: {
    alignItems: "center",
    borderRadius: 20,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  emojiPreviewText: {
    fontSize: 44,
    lineHeight: 52,
  },
  newCategoryNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  newCategoryColorChip: {
    borderRadius: 12,
    height: 48,
    width: 48,
  },
  newCategoryNameInput: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    height: 48,
    paddingHorizontal: 14,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  newCategorySaveButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  newCategorySaveButtonDisabled: {
    backgroundColor: figmaColors.grayNeutral["300"],
  },
  colorPickerPanel: {
    alignSelf: "flex-start",
    backgroundColor: figmaColors.base.white,
    borderRadius: 8,
    boxShadow:
      "0px 17px 38px 0px rgba(24,24,27,0.10), 0px 68px 68px 0px rgba(24,24,27,0.09), 0px 154px 92px 0px rgba(24,24,27,0.05), 0px 273px 109px 0px rgba(24,24,27,0.01), 0px 426px 119px 0px rgba(24,24,27,0.00)",
    gap: 6,
    padding: 8,
  },
  colorPickerRow: {
    flexDirection: "row",
    gap: 8,
  },
  colorSwatch: {
    alignItems: "center",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  recurringSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  recurringDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
  },
  recurringRow: {
    flexDirection: "row",
    gap: 8,
  },
  recurringChip: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  recurringChipSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  recurringChipText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  recurringChipTextSelected: {
    color: figmaColors.base.white,
  },
  customIntervalSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  customIntervalDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
  },
  customIntervalContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  customIntervalLabel: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  customIntervalSpinners: {
    flexDirection: "row",
    gap: 8,
  },
  customIntervalSpinner: {
    alignItems: "center",
    gap: 6,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  stepperValueBox: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    justifyContent: "center",
    minWidth: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepperUnitBox: {
    minWidth: 104,
  },
  stepperValueText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  datePickerSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  datePickerDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
  },
  datePickerTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  datePickerDisplayDate: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  datePickerColumns: {
    flexDirection: "row",
    gap: 8,
  },
  pickerColumnWrapper: {
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  pickerColumnLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  pickerColumnInner: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 16,
    height: PICKER_COLUMN_HEIGHT,
    overflow: "hidden",
    width: "100%",
  },
  pickerScrollContent: {
    paddingVertical: PICKER_ITEM_HEIGHT * 2,
  },
  pickerItem: {
    alignItems: "center",
    height: PICKER_ITEM_HEIGHT,
    justifyContent: "center",
    marginHorizontal: 6,
    borderRadius: 10,
  },
  pickerItemSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  pickerSelectionIndicator: {
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 10,
    bottom: undefined,
    height: PICKER_ITEM_HEIGHT,
    left: 6,
    position: "absolute",
    right: 6,
    top: PICKER_ITEM_HEIGHT * 2,
  },
  pickerItemText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
  },
  pickerItemTextSelected: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
  },
  datePickerSaveButton: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
  },
  datePickerSaveButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  imgUploadRoot: {
    flex: 1,
  },
  imgUploadBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: figmaColors.base.overlay,
  },
  imgUploadContainer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  imgUploadSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  imgUploadHandle: {
    alignSelf: "center",
    backgroundColor: figmaColors.grayNeutral["300"],
    borderRadius: 999,
    height: 4,
    marginBottom: 16,
    width: 36,
  },
  imgUploadHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  imgUploadTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  imgUploadAllPhotos: {
    color: figmaColors.blue["500"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  imgUploadDivider: {
    backgroundColor: figmaColors.grayNeutral["100"],
    height: 1,
    marginBottom: 16,
  },
  imgUploadRowScroll: {
    marginBottom: 20,
  },
  imgUploadRow: {
    gap: 8,
    paddingRight: 8,
  },
  imgUploadCameraTile: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    height: PHOTO_TILE_SIZE,
    justifyContent: "center",
    width: PHOTO_TILE_SIZE,
  },
  imgUploadPhotoTile: {
    borderRadius: 12,
    height: PHOTO_TILE_SIZE,
    overflow: "hidden",
    width: PHOTO_TILE_SIZE,
  },
  imgUploadPhotoThumb: {
    height: PHOTO_TILE_SIZE,
    width: PHOTO_TILE_SIZE,
  },
  imgUploadSelectCircle: {
    alignItems: "center",
    borderColor: figmaColors.base.white,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
  },
  imgUploadSelectCircleActive: {
    backgroundColor: figmaColors.blue["500"],
    borderColor: figmaColors.blue["500"],
  },
  imgUploadSelectCheck: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 12,
  },
  imgUploadAddBtn: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
  },
  imgUploadAddBtnActive: {
    backgroundColor: figmaColors.blue["500"],
  },
  imgUploadAddBtnText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  imgUploadAddBtnTextActive: {
    color: figmaColors.base.white,
  },
  attachedImagesScroll: {
    marginTop: 10,
    marginBottom: 4,
  },
  attachedImagesRow: {
    gap: 10,
    paddingRight: 4,
  },
  attachedImageWrap: {
    borderRadius: 12,
    overflow: "hidden",
  },
  attachedImageThumb: {
    borderRadius: 12,
    height: 110,
    width: 110,
  },
  attachedImageRemove: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["700"],
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
  },
  attachedImageRemoveText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
});
