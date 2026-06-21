import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import {
  accountGroupOrder,
  type AccountGroup,
  type StoredAccount,
  useAccountsStore,
} from "@/stores/accounts";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_ITEM_HEIGHT = 52;
const TRANSACTIONS_KEY = "europa:transactions";

// ─── Types ────────────────────────────────────────────────────────────────────

type StoredTransaction = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  accountName: string;
  destinationAccountName?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBalance(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimal = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${whole}.${decimal}`;
}

function computeLiveBalance(account: StoredAccount, transactions: StoredTransaction[]): number {
  return account.openingBalanceCents + transactions.reduce((sum, tx) => {
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
}

type DisplayAccount = StoredAccount & { balanceCents: number };

type GroupData = {
  group: AccountGroup;
  totalCents: number;
  accounts: DisplayAccount[];
};

function groupAccounts(accounts: DisplayAccount[]): GroupData[] {
  return accountGroupOrder
    .map((group) => {
      const items = accounts.filter((a) => a.group === group);
      return {
        group,
        totalCents: items.reduce((s, a) => s + a.balanceCents, 0),
        accounts: items,
      };
    })
    .filter((g) => g.accounts.length > 0);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function ChevronRightIcon() {
  return (
    <Svg fill="none" height={18} viewBox="0 0 20 20" width={18}>
      <Path
        clipRule="evenodd"
        d="M13.0892 9.41083C13.2454 9.56711 13.3332 9.77903 13.3332 10C13.3332 10.221 13.2454 10.4329 13.0892 10.5892L8.375 15.3033C8.11783 15.5605 7.71217 15.5605 7.455 15.3033C7.19783 15.0461 7.19783 14.6405 7.455 14.3833L11.8383 10L7.455 5.61667C7.19783 5.3595 7.19783 4.95383 7.455 4.69667C7.71217 4.4395 8.11783 4.4395 8.375 4.69667L13.0892 9.41083Z"
        fill={figmaColors.grayNeutral["400"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

// ─── GroupPickerSheet ─────────────────────────────────────────────────────────

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
      <View style={styles.sheetRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View pointerEvents="box-none" style={styles.sheetContainer}>
          <Animated.View
            style={[
              styles.innerSheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Account Group</Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={closeSheet}
                style={styles.headerButton}
              >
                <CloseIcon />
              </Pressable>
            </View>
            <View style={styles.divider} />
            <View style={styles.chipGrid}>
              {accountGroupOrder.map((group) => (
                <Pressable
                  accessibilityLabel={`Select ${group}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === group }}
                  key={group}
                  onPress={() => { onSelect(group); closeSheet(); }}
                  style={[styles.chip, selected === group && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected === group && styles.chipTextSelected]}>
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

// ─── CreateAccountSheet ───────────────────────────────────────────────────────

function CreateAccountSheet({
  onClose,
  onSubmit,
  visible,
}: {
  onClose: () => void;
  onSubmit: (account: StoredAccount) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [selectedGroup, setSelectedGroup] = useState<AccountGroup | null>(null);
  const [name, setName] = useState("");
  const [balanceText, setBalanceText] = useState("");
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);

  const canSubmit = selectedGroup !== null && name.trim().length > 0;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      setSelectedGroup(null);
      setName("");
      setBalanceText("");
      translateY.setValue(600);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(600);
    }
  }, [backdropOpacity, translateY, visible]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !selectedGroup) return;
    const parsedBalance = parseFloat(balanceText.replace(/,/g, "")) || 0;
    const openingBalanceCents = Math.round(parsedBalance * 100);
    onSubmit({
      id: Date.now().toString(36),
      name: name.trim(),
      group: selectedGroup,
      openingBalanceCents,
    });
    closeSheet();
  }, [balanceText, canSubmit, closeSheet, name, onSubmit, selectedGroup]);

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <View style={styles.sheetRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.sheetContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              style={[
                styles.createSheet,
                { paddingBottom: Math.max(insets.bottom, 16) },
                { transform: [{ translateY }] },
              ]}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New Account</Text>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.headerButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
              <View style={styles.divider} />

              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Group */}
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Group</Text>
                  <Pressable
                    accessibilityLabel={selectedGroup ?? "Select group"}
                    accessibilityRole="button"
                    onPress={() => setIsGroupPickerOpen(true)}
                    style={[styles.formControl, !!selectedGroup && styles.formControlFilled]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.formControlText,
                        !selectedGroup && styles.formPlaceholder,
                        !!selectedGroup && styles.formControlTextFilled,
                      ]}
                    >
                      {selectedGroup ?? "Select group"}
                    </Text>
                    <ChevronRightIcon />
                  </Pressable>
                </View>
                <View style={styles.formDivider} />

                {/* Name */}
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Name</Text>
                  <View style={[styles.formInputWrapper, !!name && styles.formInputWrapperFilled]}>
                    <Text style={styles.formInputSizer} numberOfLines={1}>
                      {name || "Account name"}
                    </Text>
                    <TextInput
                      autoCapitalize="words"
                      onChangeText={setName}
                      placeholder="Account name"
                      placeholderTextColor={figmaColors.grayNeutral["400"]}
                      returnKeyType="next"
                      style={[
                        StyleSheet.absoluteFill,
                        styles.formInputText,
                        !!name && styles.formInputTextFilled,
                      ]}
                      value={name}
                    />
                  </View>
                </View>
                <View style={styles.formDivider} />

                {/* Opening Balance */}
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Balance</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={setBalanceText}
                    placeholder="0.00"
                    placeholderTextColor={figmaColors.grayNeutral["400"]}
                    returnKeyType="done"
                    style={[
                      styles.formControl,
                      styles.formControlText,
                      !!balanceText && styles.formControlFilled,
                      !!balanceText && styles.formControlTextFilled,
                    ]}
                    value={balanceText}
                  />
                </View>
              </ScrollView>

              <Pressable
                accessibilityLabel="Add account"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              >
                <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
                  Add account
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
    </Modal>
  );
}

// ─── AccountRow ───────────────────────────────────────────────────────────────

function AccountRow({
  account,
  balance,
  isDragging,
  onDelete,
  onDragEnd,
  onDragMove,
  onDragStart,
  shift,
}: {
  account: StoredAccount;
  balance: number;
  isDragging: boolean;
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
      <Pressable accessibilityLabel={`Delete ${account.name}`} accessibilityRole="button" hitSlop={8} onPress={onDelete}>
        <MinusCircleIcon />
      </Pressable>
      <View style={styles.accountNameArea}>
        <Text style={styles.accountName}>{account.name}</Text>
      </View>
      <Text style={[
        styles.accountBalance,
        balance > 0
          ? { color: figmaColors.grayNeutral["900"] }
          : balance < 0
            ? { color: figmaColors.error["600"] }
            : undefined,
      ]}>
        {formatBalance(balance)}
      </Text>
      <View {...panResponder.panHandlers}>
        <DragHandleIcon />
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    accounts: storeAccounts,
    addAccount,
    removeAccount,
    reorderInGroup,
    moveToGroup,
  } = useAccountsStore();

  const [allTransactions, setAllTransactions] = useState<StoredTransaction[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(TRANSACTIONS_KEY).then((data) => {
        if (data) setAllTransactions(JSON.parse(data));
      }).catch(() => {});
    }, []),
  );

  const displayAccounts: DisplayAccount[] = useMemo(
    () => storeAccounts.map((a) => ({ ...a, balanceCents: computeLiveBalance(a, allTransactions) })),
    [storeAccounts, allTransactions],
  );

  const groups = groupAccounts(displayAccounts);

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

  // Sheet open animation
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, []);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) router.back(); });
  }, []);

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
    <View style={styles.root}>
      {/* Backdrop */}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) },
          { transform: [{ translateY }] },
        ]}
      >
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Accounts</Text>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="Add new account"
              accessibilityRole="button"
              onPress={() => setIsCreateOpen(true)}
              style={styles.headerButton}
            >
              <PlusIcon />
            </Pressable>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={closeSheet}
              style={styles.headerButton}
            >
              <CloseIcon />
            </Pressable>
          </View>
        </View>

        <View style={styles.divider} />

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
                  {formatBalance(groupData.totalCents)}
                </Text>
              </View>
              {groupData.accounts.map((account, index) => (
                <AccountRow
                  account={account}
                  balance={account.balanceCents}
                  isDragging={dragGroup === groupData.group && dragIndex === index}
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
      </Animated.View>

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
            <MinusCircleIcon />
            <View style={styles.accountNameArea}>
              <Text style={styles.accountName}>{account.name}</Text>
            </View>
            <Text style={[
              styles.accountBalance,
              account.balanceCents > 0
                ? { color: figmaColors.grayNeutral["900"] }
                : account.balanceCents < 0
                  ? { color: figmaColors.error["600"] }
                  : undefined,
            ]}>
              {formatBalance(account.balanceCents)}
            </Text>
            <DragHandleIcon />
          </Animated.View>
        );
      })()}

      {/* Create account sheet */}
      <CreateAccountSheet
        onClose={() => setIsCreateOpen(false)}
        onSubmit={addAccount}
        visible={isCreateOpen}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: figmaColors.base.overlay,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sheetRoot: {
    flex: 1,
  },
  sheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  innerSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  createSheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 28,
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
  divider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  listContent: {
    paddingBottom: 8,
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
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  chipText: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  chipTextSelected: {
    color: figmaColors.base.white,
  },
  formRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  formLabel: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  formControl: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formControlFilled: {
    backgroundColor: figmaColors.blue["50"],
  },
  formControlText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  formControlTextFilled: {
    color: figmaColors.blue["600"],
  },
  formPlaceholder: {
    color: figmaColors.grayNeutral["400"],
  },
  formInputWrapper: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 10,
    overflow: "hidden",
  },
  formInputWrapperFilled: {
    backgroundColor: figmaColors.blue["50"],
  },
  formInputSizer: {
    color: "transparent",
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formInputText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  formInputTextFilled: {
    color: figmaColors.blue["600"],
  },
  formDivider: {
    borderBottomColor: figmaColors.grayNeutral["200"],
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    marginTop: 12,
  },
  submitButtonDisabled: {
    backgroundColor: figmaColors.grayNeutral["100"],
  },
  submitButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  submitButtonTextDisabled: {
    color: figmaColors.grayNeutral["400"],
  },
});
