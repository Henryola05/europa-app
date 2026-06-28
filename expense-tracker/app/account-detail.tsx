import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays, format, subMonths, subYears } from "date-fns";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import { useAccountsStore } from "@/stores/accounts";
import { currencySymbols } from "./index";

// ─── Types ────────────────────────────────────────────────────────────────────

type RecordedTransaction = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  accountName: string;
  destinationAccountName?: string;
  categoryColor?: string;
  categoryEmoji: string;
  categoryName: string;
  currencyCode: string;
  date: string;
  description: string;
};

const TRANSACTIONS_KEY = "europa:transactions";

type Period = "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";
const PERIODS: Period[] = ["1M", "3M", "6M", "YTD", "1Y", "All"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBalance(cents: number, symbol = "$"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimal = (abs % 100).toString().padStart(2, "0");
  return `${sign}${symbol}${whole}.${decimal}`;
}

function formatBalanceAbbr(cents: number, symbol = "$"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  if (abs >= 100_000_000) return `${sign}${symbol}${(abs / 100_000_000).toFixed(1)}M`;
  if (abs >= 100_000) return `${sign}${symbol}${(abs / 100_000).toFixed(1)}k`;
  return formatBalance(cents, symbol);
}

function getBalanceEffect(tx: RecordedTransaction, accountName: string): number {
  if (tx.type === "income" && tx.accountName === accountName) return tx.amountCents;
  if (tx.type === "expense" && tx.accountName === accountName) return -tx.amountCents;
  if (tx.type === "transfer") {
    if (tx.destinationAccountName === accountName) return tx.amountCents;
    if (tx.accountName === accountName) return -tx.amountCents;
  }
  return 0;
}

function getPeriodStart(period: Period, today: Date): Date {
  switch (period) {
    case "1M": return subMonths(today, 1);
    case "3M": return subMonths(today, 3);
    case "6M": return subMonths(today, 6);
    case "YTD": return new Date(today.getFullYear(), 0, 1);
    case "1Y": return subYears(today, 1);
    case "All": return new Date(0);
  }
}

function periodSuffix(period: Period): string {
  switch (period) {
    case "YTD": return "year";
    case "1M": return "month";
    case "3M": return "3 months";
    case "6M": return "6 months";
    case "1Y": return "year";
    case "All": return "beginning";
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <Path
        clipRule="evenodd"
        d="M3.63556 11.2932C3.44809 11.4807 3.34277 11.735 3.34277 12.0002C3.34277 12.2653 3.44809 12.5197 3.63556 12.7072L9.29256 18.3642C9.48116 18.5463 9.73376 18.6471 9.99596 18.6449C10.2582 18.6426 10.509 18.5374 10.6944 18.352C10.8798 18.1666 10.985 17.9158 10.9872 17.6536C10.9895 17.3914 10.8887 17.1388 10.7066 16.9502L6.75656 13.0002H19.9996C20.2648 13.0002 20.5191 12.8948 20.7067 12.7073C20.8942 12.5198 20.9996 12.2654 20.9996 12.0002C20.9996 11.735 20.8942 11.4806 20.7067 11.2931C20.5191 11.1055 20.2648 11.0002 19.9996 11.0002H6.75656L10.7066 7.05018C10.8887 6.86158 10.9895 6.60898 10.9872 6.34678C10.985 6.08458 10.8798 5.83377 10.6944 5.64836C10.509 5.46295 10.2582 5.35778 9.99596 5.35551C9.73376 5.35323 9.48116 5.45402 9.29256 5.63618L3.63556 11.2932Z"
        fill={figmaColors.grayNeutral["700"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function ChartBarIcon() {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <Path
        clipRule="evenodd"
        d="M5 5C5 4.73478 4.89464 4.48043 4.70711 4.29289C4.51957 4.10536 4.26522 4 4 4C3.73478 4 3.48043 4.10536 3.29289 4.29289C3.10536 4.48043 3 4.73478 3 5V19C3 19.2652 3.10536 19.5196 3.29289 19.7071C3.48043 19.8946 3.73478 20 4 20H20C20.2652 20 20.5196 19.8946 20.7071 19.7071C20.8946 19.5196 21 19.2652 21 19C21 18.7348 20.8946 18.4804 20.7071 18.2929C20.5196 18.1054 20.2652 18 20 18H5V5ZM9 12C9 11.7348 8.89464 11.4804 8.70711 11.2929C8.51957 11.1054 8.26522 11 8 11C7.73478 11 7.48043 11.1054 7.29289 11.2929C7.10536 11.4804 7 11.7348 7 12V15C7 15.2652 7.10536 15.5196 7.29289 15.7071C7.48043 15.8946 7.73478 16 8 16C8.26522 16 8.51957 15.8946 8.70711 15.7071C8.89464 15.5196 9 15.2652 9 15V12ZM12 6C12.2652 6 12.5196 6.10536 12.7071 6.29289C12.8946 6.48043 13 6.73478 13 7V15C13 15.2652 12.8946 15.5196 12.7071 15.7071C12.5196 15.8946 12.2652 16 12 16C11.7348 16 11.4804 15.8946 11.2929 15.7071C11.1054 15.5196 11 15.2652 11 15V7C11 6.73478 11.1054 6.48043 11.2929 6.29289C11.4804 6.10536 11.7348 6 12 6ZM17 10C17 9.73478 16.8946 9.48043 16.7071 9.29289C16.5196 9.10536 16.2652 9 16 9C15.7348 9 15.4804 9.10536 15.2929 9.29289C15.1054 9.48043 15 9.73478 15 10V15C15 15.2652 15.1054 15.5196 15.2929 15.7071C15.4804 15.8946 15.7348 16 16 16C16.2652 16 16.5196 15.8946 16.7071 15.7071C16.8946 15.5196 17 15.2652 17 15V10Z"
        fill={figmaColors.grayNeutral["600"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function DotsVerticalIcon() {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <Path
        d="M12 16.5C12.3978 16.5 12.7794 16.658 13.0607 16.9393C13.342 17.2206 13.5 17.6022 13.5 18C13.5 18.3978 13.342 18.7794 13.0607 19.0607C12.7794 19.342 12.3978 19.5 12 19.5C11.6022 19.5 11.2206 19.342 10.9393 19.0607C10.658 18.7794 10.5 18.3978 10.5 18C10.5 17.6022 10.658 17.2206 10.9393 16.9393C11.2206 16.658 11.6022 16.5 12 16.5ZM12 10.5C12.3978 10.5 12.7794 10.658 13.0607 10.9393C13.342 11.2206 13.5 11.6022 13.5 12C13.5 12.3978 13.342 12.7794 13.0607 13.0607C12.7794 13.342 12.3978 13.5 12 13.5C11.6022 13.5 11.2206 13.342 10.9393 13.0607C10.658 12.7794 10.5 12.3978 10.5 12C10.5 11.6022 10.658 11.2206 10.9393 10.9393C11.2206 10.658 11.6022 10.5 12 10.5ZM12 4.5C12.3978 4.5 12.7794 4.65804 13.0607 4.93934C13.342 5.22064 13.5 5.60218 13.5 6C13.5 6.39782 13.342 6.77936 13.0607 7.06066C12.7794 7.34196 12.3978 7.5 12 7.5C11.6022 7.5 11.2206 7.34196 10.9393 7.06066C10.658 6.77936 10.5 6.39782 10.5 6C10.5 5.60218 10.658 5.22064 10.9393 4.93934C11.2206 4.65804 11.6022 4.5 12 4.5Z"
        fill={figmaColors.grayNeutral["600"]}
      />
    </Svg>
  );
}

function ChevronDownIcon() {
  return (
    <Svg fill="none" height={14} viewBox="0 0 24 24" width={14}>
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

// ─── Chart ────────────────────────────────────────────────────────────────────

function BalanceChart({
  data,
  height,
  width,
}: {
  data: number[];
  height: number;
  width: number;
}) {
  if (data.length < 2) return <View style={{ height, width }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || Math.abs(max) || 1;
  const padded = range * 0.1;
  const yMin = min - padded;
  const yMax = max + padded;
  const yRange = yMax - yMin;

  const toX = (i: number) => (i / (data.length - 1)) * width;
  const toY = (v: number) => height - ((v - yMin) / yRange) * height;

  const points = data.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = `${lineD} L${width.toFixed(1)},${height} L0,${height} Z`;

  return (
    <Svg height={height} width={width}>
      <Defs>
        <LinearGradient id="chartGrad" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0%" stopColor={figmaColors.success["500"]} stopOpacity="0.18" />
          <Stop offset="100%" stopColor={figmaColors.success["500"]} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaD} fill="url(#chartGrad)" />
      <Path
        d={lineD}
        fill="none"
        stroke={figmaColors.success["700"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts } = useAccountsStore();

  const account = useMemo(() => accounts.find((a) => a.id === id), [accounts, id]);

  const [allTransactions, setAllTransactions] = useState<RecordedTransaction[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("YTD");
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(TRANSACTIONS_KEY).then((data) => {
        if (data) setAllTransactions(JSON.parse(data));
      });
    }, []),
  );

  // stable reference for today — treat as constant within this render cycle
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const currencySymbol = currencySymbols[account?.currencyCode ?? "USD"] ?? "$";

  // All transactions touching this account
  const accountTransactions = useMemo(() => {
    if (!account) return [];
    return allTransactions.filter(
      (tx) =>
        tx.accountName === account.name ||
        (tx.type === "transfer" && tx.destinationAccountName === account.name),
    );
  }, [allTransactions, account]);

  const periodStart = useMemo(() => {
    const d = getPeriodStart(selectedPeriod, today);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedPeriod, today]);

  // Balance at start of selected period
  const balanceAtPeriodStart = useMemo(() => {
    if (!account) return 0;
    const before = accountTransactions.filter((tx) => new Date(tx.date) < periodStart);
    return (
      account.openingBalanceCents +
      before.reduce((sum, tx) => sum + getBalanceEffect(tx, account.name), 0)
    );
  }, [account, accountTransactions, periodStart]);

  // Current balance (all time)
  const currentBalance = useMemo(() => {
    if (!account) return 0;
    return (
      account.openingBalanceCents +
      accountTransactions.reduce((sum, tx) => sum + getBalanceEffect(tx, account.name), 0)
    );
  }, [account, accountTransactions]);

  // Transactions within the period, sorted oldest → newest
  const periodTransactions = useMemo(
    () =>
      accountTransactions
        .filter((tx) => new Date(tx.date) >= periodStart)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [accountTransactions, periodStart],
  );

  // Chart data — daily running balance, downsampled to ≤120 points
  const chartData = useMemo(() => {
    const txByDay = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (!account) continue;
      const key = tx.date.slice(0, 10);
      txByDay.set(key, (txByDay.get(key) ?? 0) + getBalanceEffect(tx, account.name));
    }

    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
    );
    const step = Math.max(1, Math.floor(totalDays / 120));

    const points: number[] = [];
    let balance = balanceAtPeriodStart;
    let d = new Date(start);
    let dayCount = 0;

    while (d <= end) {
      const key = format(d, "yyyy-MM-dd");
      if (txByDay.has(key)) balance += txByDay.get(key)!;
      if (dayCount % step === 0) points.push(balance);
      d = addDays(d, 1);
      dayCount++;
    }
    if (points[points.length - 1] !== balance) points.push(balance);
    return points.length > 0 ? points : [balanceAtPeriodStart, currentBalance];
  }, [account, balanceAtPeriodStart, currentBalance, periodStart, periodTransactions, today]);

  // Deposit / withdrawal totals for the period
  const { depositCents, withdrawalCents } = useMemo(() => {
    let deposit = 0;
    let withdrawal = 0;
    for (const tx of periodTransactions) {
      if (!account) continue;
      if (tx.type === "income" && tx.accountName === account.name) deposit += tx.amountCents;
      if (tx.type === "expense" && tx.accountName === account.name) withdrawal += tx.amountCents;
    }
    return { depositCents: deposit, withdrawalCents: withdrawal };
  }, [account, periodTransactions]);

  // Balance change vs period start
  const balanceChange = currentBalance - balanceAtPeriodStart;
  const balanceChangePercent =
    balanceAtPeriodStart !== 0
      ? (balanceChange / Math.abs(balanceAtPeriodStart)) * 100
      : 0;
  const changePositive = balanceChange >= 0;

  // Transactions grouped by date (newest first)
  const groupedTransactions = useMemo(() => {
    const sorted = [...periodTransactions].reverse();
    const groups: {
      dateKey: string;
      date: Date;
      netCents: number;
      transactions: RecordedTransaction[];
    }[] = [];
    for (const tx of sorted) {
      const dateKey = tx.date.slice(0, 10);
      let group = groups.find((g) => g.dateKey === dateKey);
      if (!group) {
        const [y, m, dy] = dateKey.split("-").map(Number);
        group = { dateKey, date: new Date(y, m - 1, dy), netCents: 0, transactions: [] };
        groups.push(group);
      }
      group.transactions.push(tx);
      if (account) group.netCents += getBalanceEffect(tx, account.name);
    }
    return groups;
  }, [periodTransactions, account]);

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 40;

  const firstTxDate =
    periodTransactions.length > 0 ? new Date(periodTransactions[0].date) : periodStart;
  const periodStartLabel =
    selectedPeriod === "All" && periodTransactions.length > 0
      ? format(firstTxDate, "MMM dd, yyyy")
      : format(periodStart, "MMM dd, yyyy");
  const periodEndLabel = format(today, "MMM dd, yyyy");

  if (!account) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <BackIcon />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={styles.emptyText}>Account not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <BackIcon />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {account.name}
        </Text>
        <View style={styles.headerRight}>
          <Pressable accessibilityRole="button" style={styles.headerButton}>
            <ChartBarIcon />
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.headerButton}>
            <DotsVerticalIcon />
          </Pressable>
        </View>
        <Text numberOfLines={1} pointerEvents="none" style={styles.headerTitleOverlay}>
          {account.name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance section */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceTopRow}>
            <View>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceAmount}>
                {formatBalance(currentBalance, currencySymbol)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsPeriodPickerOpen(true)}
              style={styles.periodPill}
            >
              <Text style={styles.periodPillText}>{selectedPeriod}</Text>
              <ChevronDownIcon />
            </Pressable>
          </View>

          {/* Delta */}
          <View style={styles.deltaRow}>
            <Text
              style={[
                styles.deltaAmount,
                { color: changePositive ? figmaColors.success["600"] : figmaColors.error["600"] },
              ]}
            >
              {changePositive ? "+" : ""}
              {formatBalance(balanceChange, currencySymbol)} (
              {changePositive ? "↑" : "↓"}
              {Math.abs(balanceChangePercent).toFixed(1)}%)
            </Text>
            <Text style={styles.deltaSuffix}>
              {" "}vs start of {periodSuffix(selectedPeriod)}
            </Text>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartWrapper}>
          <BalanceChart data={chartData} height={180} width={chartWidth} />
          <View style={styles.chartDateRow}>
            <Text style={styles.chartDateLabel}>{periodStartLabel}</Text>
            <Text style={styles.chartDateLabel}>{periodEndLabel}</Text>
          </View>
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Deposit</Text>
            <Text style={[styles.statAmount, { color: figmaColors.success["700"] }]}>
              {formatBalanceAbbr(depositCents, currencySymbol)}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Withdrawal</Text>
            <Text style={[styles.statAmount, { color: figmaColors.error["700"] }]}>
              {formatBalanceAbbr(withdrawalCents, currencySymbol)}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={[styles.statAmount, { color: figmaColors.grayNeutral["900"] }]}>
              {formatBalanceAbbr(depositCents - withdrawalCents, currencySymbol)}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Transaction list */}
        {groupedTransactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <Text style={styles.emptyText}>No transactions in this period.</Text>
          </View>
        ) : (
          groupedTransactions.map((group) => (
            <View key={group.dateKey}>
              {/* Date header */}
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>
                  {format(group.date, "EEE, d MMM")}
                </Text>
                <Text style={styles.dateHeaderNet}>
                  {group.netCents >= 0 ? "+" : ""}
                  {formatBalance(group.netCents, currencySymbol)}
                </Text>
              </View>

              {/* Rows */}
              {group.transactions.map((tx) => {
                const effect = getBalanceEffect(tx, account.name);
                const isTransfer = tx.type === "transfer";
                const amountColor = isTransfer
                  ? figmaColors.grayNeutral["500"]
                  : effect >= 0
                    ? figmaColors.success["600"]
                    : figmaColors.error["600"];
                const prefix = isTransfer ? "" : effect >= 0 ? "+" : "";
                const subtitle = isTransfer
                  ? `${tx.accountName} → ${tx.destinationAccountName ?? ""}`
                  : tx.accountName;

                return (
                  <View key={tx.id} style={styles.txRow}>
                    <View
                      style={[
                        styles.txEmojiCircle,
                        { backgroundColor: tx.categoryColor ?? figmaColors.grayNeutral["100"] },
                      ]}
                    >
                      <Text style={styles.txEmoji}>{tx.categoryEmoji}</Text>
                    </View>
                    <View style={styles.txInfo}>
                      <Text numberOfLines={1} style={styles.txName}>
                        {tx.categoryName}
                      </Text>
                      <Text numberOfLines={1} style={styles.txSubtitle}>
                        {subtitle}
                      </Text>
                    </View>
                    <Text style={[styles.txAmount, { color: amountColor }]}>
                      {prefix}
                      {formatBalance(Math.abs(effect), currencySymbol)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Period picker modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setIsPeriodPickerOpen(false)}
        transparent
        visible={isPeriodPickerOpen}
      >
        <Pressable
          onPress={() => setIsPeriodPickerOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.periodPickerCard}>
            {PERIODS.map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  setSelectedPeriod(p);
                  setIsPeriodPickerOpen(false);
                }}
                style={[styles.periodOption, p === selectedPeriod && styles.periodOptionActive]}
              >
                <Text
                  style={[
                    styles.periodOptionText,
                    p === selectedPeriod && styles.periodOptionTextActive,
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: figmaColors.bg,
    flex: 1,
  },
  // Header
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerTitle: {
    display: "none",
  },
  headerTitleOverlay: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    letterSpacing: -0.2,
    left: 0,
    position: "absolute",
    right: 0,
    textAlign: "center",
  },
  headerRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  // Scroll
  scrollContent: {
    paddingBottom: 20,
  },
  // Balance
  balanceSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  balanceTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceLabel: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    lineHeight: 18,
    marginBottom: 4,
  },
  balanceAmount: {
    color: figmaColors.grayNeutral["950"],
    fontFamily: fontFamily.bold,
    fontSize: 32,
    letterSpacing: -1,
    lineHeight: 38,
  },
  periodPill: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  periodPillText: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  deltaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  deltaAmount: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  deltaSuffix: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  // Chart
  chartWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  chartDateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  chartDateLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
    letterSpacing: -0.1,
  },
  // Stats bar
  statsBar: {
    flexDirection: "row",
    paddingVertical: 20,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  statDivider: {
    backgroundColor: figmaColors.grayNeutral["300"],
    width: StyleSheet.hairlineWidth,
  },
  statLabel: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  statAmount: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  divider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
  },
  // Transaction list
  dateHeader: {
    backgroundColor: figmaColors.grayNeutral["50"],
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  dateHeaderText: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  dateHeaderNet: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  txRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  txEmojiCircle: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  txEmoji: {
    fontSize: 22,
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txName: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  txSubtitle: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  txAmount: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  // Empty
  emptyTransactions: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  // Period picker modal
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    flex: 1,
    justifyContent: "center",
  },
  periodPickerCard: {
    backgroundColor: figmaColors.bg,
    borderRadius: 16,
    overflow: "hidden",
    width: 200,
  },
  periodOption: {
    alignItems: "center",
    paddingVertical: 14,
  },
  periodOptionActive: {
    backgroundColor: figmaColors.blue["50"],
  },
  periodOptionText: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
  },
  periodOptionTextActive: {
    color: figmaColors.blue["600"],
    fontFamily: fontFamily.semiBold,
  },
});
