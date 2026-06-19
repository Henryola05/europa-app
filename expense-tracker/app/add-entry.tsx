import { format } from "date-fns";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
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
  currencyCode,
  onChangeAmount,
  onClose,
  onCurrencyPress,
  onDismiss,
  visible,
}: {
  amountCents: number;
  currencyCode: string;
  onChangeAmount: (amountCents: number) => void;
  onClose: () => void;
  onCurrencyPress: () => void;
  onDismiss?: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [expression, setExpression] = useState(centsToExpression(amountCents));

  useEffect(() => {
    if (visible) {
      setExpression(centsToExpression(amountCents));
    }
  }, [amountCents, visible]);

  const handleKeyPress = (key: KeypadKey) => {
    if (key.type === "empty") {
      return;
    }

    if (key.type === "ok") {
      onChangeAmount(expressionToCents(expression));
      onClose();
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
      animationType="slide"
      onDismiss={onDismiss}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.amountSheetBackdrop}>
        <Pressable
          accessibilityLabel="Close amount input"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.amountSheetDismissArea}
        />

        <View
          style={[
            styles.amountSheet,
            { paddingBottom: Math.max(insets.bottom, 8) },
          ]}
        >
          <View style={styles.amountSheetHeader}>
            <Text style={styles.amountSheetTitle}>Amount</Text>
            <Pressable
              accessibilityLabel="Close amount input"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
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
                onCurrencyPress();
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
        </View>
      </View>
    </Modal>
  );
}

export default function AddEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [transactionType, setTransactionType] =
    useState<TransactionType>("expense");
  const [amountCents, setAmountCents] = useState(0);
  const [isAmountSheetOpen, setIsAmountSheetOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(
    currencies.find((c) => c.code === "USD") ?? currencies[0],
  );
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const [pendingSheet, setPendingSheet] = useState<
    "amount" | "currency" | null
  >(null);
  const selectedDate = useMemo(() => new Date(2026, 1, 11), []);

  // iOS can't present a modal while another is mid-dismiss, so close the
  // current sheet first and open the next one once it has fully dismissed.
  // Android has no such restriction, so swap immediately.
  const requestSheet = (target: "amount" | "currency") => {
    if (Platform.OS === "ios") {
      setIsAmountSheetOpen(false);
      setIsCurrencyPickerOpen(false);
      setPendingSheet(target);
      return;
    }

    setIsAmountSheetOpen(target === "amount");
    setIsCurrencyPickerOpen(target === "currency");
  };

  const handleSheetDismiss = () => {
    if (!pendingSheet) {
      return;
    }

    const target = pendingSheet;
    setPendingSheet(null);
    setIsAmountSheetOpen(target === "amount");
    setIsCurrencyPickerOpen(target === "currency");
  };
  const currencyCode = selectedCurrency.code;
  const currencySymbol = currencySymbols[selectedCurrency.code] ?? selectedCurrency.code;
  const hasAmount = amountCents > 0;
  const amountLabel = hasAmount
    ? formatAmountLabel(amountCents, currencySymbol)
    : `e.g ${currencySymbol}500.00`;

  const sentenceVerb =
    transactionType === "income"
      ? "earned"
      : transactionType === "transfer"
        ? "transferred"
        : "spent";

  const recordLabel =
    transactionType === "income"
      ? "Record income"
      : transactionType === "transfer"
        ? "Record transfer"
        : "Record expense";

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close add entry"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <CloseIcon />
        </Pressable>

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
          <Text style={styles.sentenceWord}>on</Text>
          <SentencePill>e.g jollof and chicken</SentencePill>
          <Text style={styles.sentenceWord}>as</Text>
          <SentencePill>e.g 🍜 food</SentencePill>
          <Text style={styles.sentenceWord}>from</Text>
          <SentencePill>e.g cash wallet</SentencePill>
          <Text style={styles.sentenceWord}>on</Text>
          <SentencePill variant="accent">
            {`🗓️ ${format(selectedDate, "d MMMM yyyy")}`}
          </SentencePill>
        </View>

        <View style={styles.divider} />

        <View style={styles.optionsSection}>
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>Repeats</Text>
            <View style={styles.optionPillAccent}>
              <Text style={styles.optionPillAccentText}>Never</Text>
            </View>
          </View>

          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>Attach image (optional)</Text>
            <View style={styles.optionPillDefault}>
              <Text style={styles.optionPillDefaultText}>Upload</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasAmount }}
          disabled={!hasAmount}
          style={[
            styles.recordButton,
            hasAmount && styles.recordButtonEnabled,
          ]}
        >
          <Text
            style={[
              styles.recordButtonText,
              hasAmount && styles.recordButtonTextEnabled,
            ]}
          >
            {recordLabel}
          </Text>
        </Pressable>
      </View>

      <AmountInputSheet
        amountCents={amountCents}
        currencyCode={currencyCode}
        onChangeAmount={setAmountCents}
        onClose={() => setIsAmountSheetOpen(false)}
        onCurrencyPress={() => requestSheet("currency")}
        onDismiss={handleSheetDismiss}
        visible={isAmountSheetOpen}
      />

      <CurrencyPicker
        onClose={() => requestSheet("amount")}
        onDismiss={handleSheetDismiss}
        onSelectCurrency={(currency) => {
          setSelectedCurrency(currency);
          requestSheet("amount");
        }}
        visible={isCurrencyPickerOpen}
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
  closeButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
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
    fontFamily: fontFamily.medium,
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
  amountSheetBackdrop: {
    backgroundColor: figmaColors.base.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  amountSheetDismissArea: {
    flex: 1,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    fontFamily: fontFamily.medium,
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
});
