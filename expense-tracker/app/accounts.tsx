import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import {
  accountGroupOrder,
  type AccountGroup,
  type StoredAccount,
  useAccountsStore,
} from "@/stores/accounts";
import { BottomTabBar } from "@/components/BottomTabBar";
import {
  convertCents,
  currencies,
  currencySymbols,
  fetchExchangeRates,
} from "./index";
import {
  CreateAccountBottomSheet,
  type CreateAccountValues,
} from "./add-entry";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_ITEM_HEIGHT = 52;
const TRANSACTIONS_KEY = "europa:transactions";
const HOME_CURRENCY_KEY = "europa:home-currency";

// ─── Types ────────────────────────────────────────────────────────────────────

type StoredTransaction = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  currencyCode?: string;
  accountName: string;
  destinationAccountName?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBalance(cents: number, symbol = "$") {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimal = (abs % 100).toString().padStart(2, "0");
  return `${sign}${symbol}${whole}.${decimal}`;
}

function computeLiveBalance(
  account: StoredAccount,
  transactions: StoredTransaction[],
  exchangeRates: Record<string, number>,
): number {
  const accountCurrency = account.currencyCode ?? "USD";
  return account.openingBalanceCents + transactions.reduce((sum, tx) => {
    const txCurrency = tx.currencyCode ?? accountCurrency;
    const amount = txCurrency !== accountCurrency
      ? convertCents(tx.amountCents, txCurrency, accountCurrency, exchangeRates)
      : tx.amountCents;
    if (tx.type === "transfer") {
      if (tx.accountName === account.name) return sum - amount;
      if (tx.destinationAccountName === account.name) return sum + amount;
      return sum;
    }
    if (tx.accountName !== account.name) return sum;
    if (tx.type === "income") return sum + amount;
    if (tx.type === "expense") return sum - amount;
    return sum;
  }, 0);
}

type DisplayAccount = StoredAccount & { balanceCents: number };

type GroupData = {
  group: AccountGroup;
  totalCents: number;
  accounts: DisplayAccount[];
};

function groupAccounts(
  accounts: DisplayAccount[],
  homeCurrencyCode: string,
  exchangeRates: Record<string, number>,
): GroupData[] {
  return accountGroupOrder
    .map((group) => {
      const items = accounts.filter((a) => a.group === group);
      return {
        group,
        totalCents: items.reduce(
          (s, a) => s + convertCents(a.balanceCents, a.currencyCode ?? homeCurrencyCode, homeCurrencyCode, exchangeRates),
          0,
        ),
        accounts: items,
      };
    })
    .filter((g) => g.accounts.length > 0);
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Icons ────────────────────────────────────────────────────────────────────

function PencilIcon({ active = false }: { active?: boolean }) {
  const stroke = active ? figmaColors.blue["500"] : figmaColors.grayNeutral["600"];
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={stroke}
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
      <Path d="M8 12h8" stroke="#fff" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function DotsVerticalIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Circle cx={12} cy={5} fill={figmaColors.grayNeutral["400"]} r={1.5} />
      <Circle cx={12} cy={12} fill={figmaColors.grayNeutral["400"]} r={1.5} />
      <Circle cx={12} cy={19} fill={figmaColors.grayNeutral["400"]} r={1.5} />
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

// ─── AccountRow ───────────────────────────────────────────────────────────────

function AccountRow({
  account,
  balance,
  currencySymbol,
  isDragging,
  isEditMode,
  onDelete,
  onDragEnd,
  onDragMove,
  onDragStart,
  shift,
}: {
  account: StoredAccount;
  balance: number;
  currencySymbol: string;
  isDragging: boolean;
  isEditMode: boolean;
  onDelete: () => void;
  onDragEnd: (dy: number) => void;
  onDragMove: (dy: number) => void;
  onDragStart: (y0: number) => void;
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
        styles.accountRow,
        isDragging && styles.accountRowDragging,
        { transform: [{ translateY }], zIndex: isDragging ? 10 : 0, opacity: isDragging ? 0 : 1 },
      ]}
    >
      {isEditMode && (
        <Pressable accessibilityLabel={`Delete ${account.name}`} accessibilityRole="button" hitSlop={8} onPress={onDelete}>
          <MinusCircleIcon />
        </Pressable>
      )}
      <View style={styles.accountNameArea}>
        <Text style={styles.accountName}>{account.name}</Text>
      </View>
      <Text style={[
        styles.accountBalance,
        isEditMode
          ? (balance > 0
              ? { color: figmaColors.grayNeutral["900"] }
              : balance < 0
                ? { color: figmaColors.error["600"] }
                : undefined)
          : { color: figmaColors.grayNeutral["400"] },
      ]}>
        {formatBalance(balance, currencySymbol)}
      </Text>
      {isEditMode && (
        <View {...panResponder.panHandlers}>
          <DragHandleIcon />
        </View>
      )}
    </Animated.View>
  );
}

function AccountsEmptyIcon() {
  return (
    <Svg fill="none" height={80} viewBox="0 0 79 80" width={79}>
      <Defs>
        <ClipPath id="acct-settings-empty-clip">
          <Rect fill="white" height={80} width={79} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#acct-settings-empty-clip)">
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountsScreen() {
  const {
    accounts: storeAccounts,
    addAccount,
    removeAccount,
    reorderInGroup,
    moveToGroup,
  } = useAccountsStore();

  const [allTransactions, setAllTransactions] = useState<StoredTransaction[]>([]);
  const [homeCurrencyCode, setHomeCurrencyCode] = useState("USD");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        AsyncStorage.getItem(TRANSACTIONS_KEY),
        AsyncStorage.getItem(HOME_CURRENCY_KEY),
      ]).then(([txData, homeCurrency]) => {
        if (txData) setAllTransactions(JSON.parse(txData));
        const code = homeCurrency ?? "USD";
        if (homeCurrency) setHomeCurrencyCode(code);
        fetchExchangeRates(code).then(setExchangeRates).catch(() => {});
      }).catch(() => {});
    }, []),
  );

  const displayAccounts: DisplayAccount[] = useMemo(
    () => storeAccounts.map((a) => ({ ...a, balanceCents: computeLiveBalance(a, allTransactions, exchangeRates) })),
    [storeAccounts, allTransactions, exchangeRates],
  );

  const groups = groupAccounts(displayAccounts, homeCurrencyCode, exchangeRates);

  const currencySymbol = currencySymbols[homeCurrencyCode] ?? "$";

  const { totalAssetsCents, totalLiabilitiesCents } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const a of displayAccounts) {
      const converted = convertCents(a.balanceCents, a.currencyCode ?? homeCurrencyCode, homeCurrencyCode, exchangeRates);
      if (converted >= 0) assets += converted;
      else liabilities += converted;
    }
    return { totalAssetsCents: assets, totalLiabilitiesCents: liabilities };
  }, [displayAccounts, homeCurrencyCode, exchangeRates]);

  const totalNetCents = totalAssetsCents + totalLiabilitiesCents;

  const [dragGroup, setDragGroup] = useState<AccountGroup | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [snapGroup, setSnapGroup] = useState<AccountGroup | null>(null);
  const [snapGroupIndex, setSnapGroupIndex] = useState<number | null>(null);

  const dragGroupRef = useRef<AccountGroup | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const snapGroupRef = useRef<AccountGroup | null>(null);
  const snapGroupIndexRef = useRef<number | null>(null);
  const groupLengthRef = useRef<Partial<Record<AccountGroup, number>>>({});
  const groupYRef = useRef<Partial<Record<AccountGroup, number>>>({});
  const groupHeaderHeightRef = useRef<Partial<Record<AccountGroup, number>>>({});
  const dragItemStartYRef = useRef(0);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  groups.forEach((g) => { groupLengthRef.current[g.group] = g.accounts.length; });

  const floatTopAnim = useRef(new Animated.Value(0)).current;
  const floatDyAnim = useRef(new Animated.Value(0)).current;
  const floatTranslateY = useRef(Animated.add(floatTopAnim, floatDyAnim)).current;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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
        if (account) moveToGroup(account.id, toGroup, toIndex);
      } else if (from !== toIndex) {
        const groupData = groupsRef.current.find((g) => g.group === group);
        if (groupData) {
          const newOrder = [...groupData.accounts];
          const [removed] = newOrder.splice(from, 1);
          newOrder.splice(toIndex, 0, removed);
          reorderInGroup(group, newOrder.map((a) => a.id));
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
  }, [floatDyAnim, moveToGroup, reorderInGroup]);

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
    <SafeAreaView edges={["top"]} style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Accounts</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={isEditMode ? "Done editing" : "Edit accounts"}
            accessibilityRole="button"
            onPress={() => setIsEditMode((v) => !v)}
            style={[styles.headerButton, isEditMode && styles.headerButtonActive]}
          >
            <PencilIcon active={isEditMode} />
          </Pressable>
          <Pressable
            accessibilityLabel="Add new account"
            accessibilityRole="button"
            onPress={() => setIsCreateOpen(true)}
            style={styles.headerButton}
          >
            <PlusIcon />
          </Pressable>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: figmaColors.success["500"] }]}>Assets</Text>
          <Text style={styles.summaryAmount}>{formatBalance(totalAssetsCents, currencySymbol)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: figmaColors.error["500"] }]}>Liabilities</Text>
          <Text style={styles.summaryAmount}>{formatBalance(Math.abs(totalLiabilitiesCents), currencySymbol)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryAmount}>{formatBalance(totalNetCents, currencySymbol)}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Content */}
      <View style={styles.content}>
        {storeAccounts.length === 0 ? (
          <View style={styles.emptyState}>
            <AccountsEmptyIcon />
            <Text style={styles.emptyTitle}>No accounts yet</Text>
            <Text style={styles.emptySubtitle}>
              {"Add an account to start\ntracking your money."}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsCreateOpen(true)}
              style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.emptyButtonText}>+ Add account</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
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
                  style={styles.groupHeader}
                >
                  <Text style={styles.groupName}>{groupData.group}</Text>
                  <Text style={[
                    styles.groupTotal,
                    groupData.totalCents > 0
                      ? { color: figmaColors.grayNeutral["900"] }
                      : groupData.totalCents < 0
                        ? { color: figmaColors.error["600"] }
                        : undefined,
                  ]}>
                    {formatBalance(groupData.totalCents, currencySymbols[homeCurrencyCode] ?? homeCurrencyCode)}
                  </Text>
                </View>
                {groupData.accounts.map((account, index) => (
                  <AccountRow
                    account={account}
                    balance={account.balanceCents}
                    currencySymbol={currencySymbols[account.currencyCode ?? "USD"] ?? account.currencyCode ?? "$"}
                    isDragging={dragGroup === groupData.group && dragIndex === index}
                    isEditMode={isEditMode}
                    key={account.id}
                    onDelete={() => removeAccount(account.id)}
                    onDragEnd={(dy) => handleDragEnd(groupData.group, dy)}
                    onDragMove={(dy) => handleDragMove(groupData.group, dy)}
                    onDragStart={(y0) => handleDragStart(groupData.group, index, y0)}
                    shift={getShift(groupData.group, index)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Floating drag ghost */}
      {dragGroup !== null && dragIndex !== null && (() => {
        const account = groupsRef.current.find((g) => g.group === dragGroup)?.accounts[dragIndex];
        if (!account) return null;
        return (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.accountRow,
              styles.accountRowDragging,
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
            {isEditMode && <MinusCircleIcon />}
            <View style={styles.accountNameArea}>
              <Text style={styles.accountName}>{account.name}</Text>
            </View>
            <Text style={[
              styles.accountBalance,
              isEditMode
                ? (account.balanceCents > 0
                    ? { color: figmaColors.grayNeutral["900"] }
                    : account.balanceCents < 0
                      ? { color: figmaColors.error["600"] }
                      : undefined)
                : { color: figmaColors.grayNeutral["400"] },
            ]}>
              {formatBalance(account.balanceCents, currencySymbols[account.currencyCode ?? "USD"] ?? account.currencyCode ?? "$")}
            </Text>
            {isEditMode && <DragHandleIcon />}
          </Animated.View>
        );
      })()}

      {/* Tab bar */}
      <BottomTabBar activeTab="Accounts" />

      {/* Create account sheet */}
      <CreateAccountBottomSheet
        groups={accountGroupOrder}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={(values: CreateAccountValues) => {
          addAccount({
            id: Date.now().toString(36),
            name: values.name,
            group: values.groupId,
            openingBalanceCents: Math.round(values.balance * 100),
            currencyCode: values.currencyCode,
          });
          setIsCreateOpen(false);
        }}
        selectedCurrency={currencies.find((c) => c.code === homeCurrencyCode) ?? currencies[0]}
        visible={isCreateOpen}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: figmaColors.bg,
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerButtonActive: {
    backgroundColor: figmaColors.blue["50"],
  },
  divider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  summaryBar: {
    flexDirection: "row",
    paddingVertical: 16,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  summaryDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    width: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  summaryAmount: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  listContent: {
    paddingBottom: 8,
    paddingTop: 8,
  },
  groupHeader: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["50"],
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 11,
  },
  groupName: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  groupTotal: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  accountRow: {
    alignItems: "center",
    backgroundColor: figmaColors.base.white,
    flexDirection: "row",
    gap: 12,
    minHeight: ACCOUNT_ITEM_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  accountRowDragging: {
    borderRadius: 12,
    elevation: 12,
    shadowColor: figmaColors.base.black,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  accountNameArea: {
    flex: 1,
  },
  accountName: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  accountBalance: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingBottom: 40,
  },
  emptyTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    marginTop: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 22,
    textAlign: "center",
  },
  emptyButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    marginTop: 16,
    paddingHorizontal: 32,
    width: "100%",
  },
  emptyButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
