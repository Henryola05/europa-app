import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import { currencies, Currency, CurrencyPicker } from "./index";

const HOME_CURRENCY_KEY = "europa:home-currency";
const WEEK_START_KEY = "europa:week-start";
const BUDGET_RESET_KEY = "europa:budget-reset-day";

const PICKER_ITEM_HEIGHT = 52;
const PICKER_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
type Day = (typeof DAYS)[number];

// ─── SVG paths ───────────────────────────────────────────────────────────────

type IconPath = { d: string; evenodd?: boolean };

const BASE_CURRENCY_ICON: IconPath[] = [
  { d: "M9.40616 3.93048L9.66199 3.82214C12.037 2.76548 14.3953 2.79131 15.9378 2.99214L16.2795 3.04048L16.5895 3.09298L16.867 3.14714L17.1087 3.19964C17.8287 3.36464 18.2787 3.98048 18.3287 4.64214L18.3337 4.76714V14.4213C18.3337 15.2771 17.5203 15.8388 16.7562 15.663L16.5228 15.6113L16.252 15.5596L15.9478 15.5096C15.7772 15.4838 15.6061 15.4619 15.4345 15.4438L15.057 15.4105C13.8212 15.3238 12.212 15.4113 10.5945 16.0688L10.3387 16.1771C8.14699 17.1521 5.96866 17.2055 4.43283 17.0496L4.06283 17.008L3.72116 16.958L3.41116 16.9055C3.36333 16.8969 3.31555 16.888 3.26783 16.8788L2.89283 16.7996C2.17199 16.6346 1.72199 16.0188 1.67199 15.3571L1.66699 15.2321V5.57798C1.66699 4.72214 2.48033 4.15964 3.24449 4.33631L3.47783 4.38798L3.74866 4.43964L4.05283 4.48964C5.33283 4.68131 7.36283 4.76131 9.40616 3.93048ZM10.0003 6.66631C9.11627 6.66631 8.26842 7.0175 7.6433 7.64262C7.01818 8.26774 6.66699 9.11559 6.66699 9.99964C6.66699 10.8837 7.01818 11.7315 7.6433 12.3567C8.26842 12.9818 9.11627 13.333 10.0003 13.333C10.8844 13.333 11.7322 12.9818 12.3573 12.3567C12.9825 11.7315 13.3337 10.8837 13.3337 9.99964C13.3337 9.11559 12.9825 8.26774 12.3573 7.64262C11.7322 7.0175 10.8844 6.66631 10.0003 6.66631ZM10.0003 8.33298C10.4424 8.33298 10.8663 8.50857 11.1788 8.82113C11.4914 9.13369 11.667 9.55762 11.667 9.99964C11.667 10.4417 11.4914 10.8656 11.1788 11.1782C10.8663 11.4907 10.4424 11.6663 10.0003 11.6663C9.5583 11.6663 9.13437 11.4907 8.82181 11.1782C8.50925 10.8656 8.33366 10.4417 8.33366 9.99964C8.33366 9.55762 8.50925 9.13369 8.82181 8.82113C9.13437 8.50857 9.5583 8.33298 10.0003 8.33298Z" },
];

const START_OF_WEEK_ICON: IconPath[] = [
  { d: "M15.8333 2.5C16.2538 2.49987 16.6588 2.65867 16.9671 2.94458C17.2754 3.23049 17.4643 3.62237 17.4958 4.04167L17.5 4.16667V15.8333C17.5001 16.2538 17.3413 16.6588 17.0554 16.9671C16.7695 17.2754 16.3776 17.4643 15.9583 17.4958L15.8333 17.5H4.16667C3.74619 17.5001 3.34119 17.3413 3.03288 17.0554C2.72456 16.7695 2.5357 16.3776 2.50417 15.9583L2.5 15.8333V4.16667C2.49987 3.74619 2.65867 3.34119 2.94458 3.03288C3.23049 2.72456 3.62237 2.5357 4.04167 2.50417L4.16667 2.5H15.8333ZM6.66667 5.83333C6.44565 5.83333 6.23369 5.92113 6.07741 6.07741C5.92113 6.23369 5.83333 6.44565 5.83333 6.66667V13.3333C5.83333 13.5543 5.92113 13.7663 6.07741 13.9226C6.23369 14.0789 6.44565 14.1667 6.66667 14.1667C6.88768 14.1667 7.09964 14.0789 7.25592 13.9226C7.4122 13.7663 7.5 13.5543 7.5 13.3333V6.66667C7.5 6.44565 7.4122 6.23369 7.25592 6.07741C7.09964 5.92113 6.88768 5.83333 6.66667 5.83333ZM10 5.83333C9.79589 5.83336 9.59889 5.9083 9.44636 6.04393C9.29383 6.17956 9.19638 6.36646 9.1725 6.56917L9.16667 6.66667V13.3333C9.1669 13.5457 9.24823 13.75 9.39404 13.9045C9.53985 14.0589 9.73913 14.1519 9.95116 14.1643C10.1632 14.1768 10.372 14.1078 10.5349 13.9714C10.6977 13.8351 10.8024 13.6417 10.8275 13.4308L10.8333 13.3333V6.66667C10.8333 6.44565 10.7455 6.23369 10.5893 6.07741C10.433 5.92113 10.221 5.83333 10 5.83333ZM13.3333 5.83333C13.1123 5.83333 12.9004 5.92113 12.7441 6.07741C12.5878 6.23369 12.5 6.44565 12.5 6.66667V13.3333C12.5 13.5543 12.5878 13.7663 12.7441 13.9226C12.9004 14.0789 13.1123 14.1667 13.3333 14.1667C13.5543 14.1667 13.7663 14.0789 13.9226 13.9226C14.0789 13.7663 14.1667 13.5543 14.1667 13.3333V6.66667C14.1667 6.44565 14.0789 6.23369 13.9226 6.07741C13.7663 5.92113 13.5543 5.83333 13.3333 5.83333Z", evenodd: true },
];

const BUDGET_RESET_ICON: IconPath[] = [
  { d: "M14.9999 2.5C15.4204 2.49987 15.8254 2.65867 16.1337 2.94458C16.4421 3.23049 16.6309 3.62237 16.6624 4.04167L16.6666 4.16667V5.83333H16.8258C17.0296 5.83327 17.2302 5.88302 17.4104 5.97826C17.5905 6.0735 17.7447 6.21133 17.8594 6.37976C17.9741 6.54818 18.0458 6.7421 18.0685 6.94461C18.0911 7.14712 18.0638 7.35209 17.9891 7.54167L17.9441 7.64167L16.6666 10.1975V15.8333C16.6667 16.2538 16.5079 16.6588 16.222 16.9671C15.9361 17.2754 15.5442 17.4643 15.1249 17.4958L14.9999 17.5H4.99995C4.57961 17.4999 4.17483 17.341 3.86669 17.0551C3.55854 16.7692 3.36981 16.3775 3.33828 15.9583L3.33328 15.8333V10.1967L2.05578 7.6425C1.96466 7.46024 1.91947 7.25847 1.92416 7.05475C1.92885 6.85103 1.98327 6.65155 2.08268 6.47368C2.18209 6.2958 2.32348 6.14493 2.49454 6.03419C2.6656 5.92346 2.86113 5.85622 3.06411 5.83833L3.17495 5.83333H3.33328V4.16667C3.33315 3.74619 3.49195 3.34119 3.77786 3.03288C4.06377 2.72456 4.45565 2.5357 4.87495 2.50417L4.99995 2.5H14.9999ZM8.74995 10.0133C8.75005 9.87801 8.71752 9.74465 8.65511 9.62457C8.5927 9.50449 8.50226 9.40123 8.39146 9.32355C8.28065 9.24586 8.15275 9.19604 8.01859 9.1783C7.88443 9.16057 7.74797 9.17544 7.62078 9.22167L7.53161 9.26083L6.71078 9.67167C6.55065 9.75175 6.42057 9.88128 6.3398 10.0411C6.25903 10.2009 6.23188 10.3824 6.26236 10.5589C6.29284 10.7353 6.37933 10.8972 6.50903 11.0206C6.63873 11.1441 6.80473 11.2224 6.98245 11.2442L7.08328 11.25V13.3333C7.08352 13.5457 7.16485 13.75 7.31065 13.9045C7.45646 14.0589 7.65574 14.1519 7.86778 14.1643C8.07981 14.1768 8.2886 14.1078 8.45147 13.9714C8.61435 13.8351 8.71903 13.6417 8.74411 13.4308L8.74995 13.3333V10.0133ZM12.0833 9.16667H11.2499C10.8295 9.16653 10.4245 9.32534 10.1162 9.61125C9.80784 9.89716 9.61898 10.289 9.58745 10.7083L9.58328 10.8333V12.5C9.58315 12.9205 9.74195 13.3255 10.0279 13.6338C10.3138 13.9421 10.7057 14.131 11.1249 14.1625L11.2499 14.1667H12.0833C12.5038 14.1668 12.9088 14.008 13.2171 13.7221C13.5254 13.4362 13.7142 13.0443 13.7458 12.625L13.7499 12.5V10.8333C13.7501 10.4129 13.5913 10.0079 13.3054 9.69954C13.0195 9.39123 12.6276 9.20237 12.2083 9.17083L12.2083 9.16667ZM12.0833 10.8333V12.5H11.2499V10.8333H12.0833ZM14.9999 4.16667H4.99995V5.83333H14.9999V4.16667Z" },
];

const CHEVRON_RIGHT_PATH =
  "M13.0892 9.41083C13.2454 9.56711 13.3332 9.77903 13.3332 10C13.3332 10.221 13.2454 10.4329 13.0892 10.5892L8.375 15.3033C8.29813 15.3829 8.20617 15.4464 8.1045 15.4901C8.00283 15.5338 7.89348 15.5567 7.78283 15.5577C7.67218 15.5587 7.56245 15.5376 7.46004 15.4957C7.35762 15.4538 7.26458 15.3919 7.18634 15.3137C7.10809 15.2354 7.04622 15.1424 7.00431 15.04C6.96241 14.9375 6.94133 14.8278 6.94229 14.7172C6.94325 14.6065 6.96624 14.4972 7.00992 14.3955C7.05359 14.2938 7.11707 14.2019 7.19667 14.125L11.3217 10L7.19667 5.875C7.04487 5.71783 6.96087 5.50733 6.96277 5.28883C6.96467 5.07033 7.05231 4.86132 7.20682 4.70682C7.36132 4.55231 7.57033 4.46467 7.78883 4.46277C8.00733 4.46087 8.21783 4.54487 8.375 4.69667L13.0892 9.41083Z";

const CLOSE_PATH =
  "M15.0893 4.91083C15.4147 5.23626 15.4147 5.7638 15.0893 6.08923L11.1785 10.0001L15.0893 13.9109C15.4147 14.2363 15.4147 14.7638 15.0893 15.0893C14.7638 15.4147 14.2363 15.4147 13.9109 15.0893L10.0001 11.1785L6.08923 15.0893C5.7638 15.4147 5.23626 15.4147 4.91083 15.0893C4.5854 14.7638 4.5854 14.2363 4.91083 13.9109L8.82166 10.0001L4.91083 6.08923C4.5854 5.7638 4.5854 5.23626 4.91083 4.91083C5.23626 4.5854 5.7638 4.5854 6.08923 4.91083L10.0001 8.82166L13.9109 4.91083C14.2363 4.5854 14.7638 4.5854 15.0893 4.91083Z";

// ─── Shared components ────────────────────────────────────────────────────────

function RowIcon({ paths, bg }: { paths: IconPath[]; bg: string }) {
  return (
    <View style={[styles.iconContainer, { backgroundColor: bg }]}>
      <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
        {paths.map((p, i) => (
          <Path
            key={i}
            clipRule={p.evenodd ? "evenodd" : "nonzero"}
            d={p.d}
            fill="#fff"
            fillRule={p.evenodd ? "evenodd" : "nonzero"}
          />
        ))}
      </Svg>
    </View>
  );
}

function ChevronRight() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
      <Path
        clipRule="evenodd"
        d={CHEVRON_RIGHT_PATH}
        fill={figmaColors.grayNeutral["300"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

// ─── Budget reset picker ──────────────────────────────────────────────────────

function DayScrollPicker({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [selectedIdx, setSelectedIdx] = useState(value - 1);

  useEffect(() => {
    scrollRef.current?.scrollTo({ animated: false, y: (value - 1) * PICKER_ITEM_HEIGHT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const idx = Math.max(0, Math.min(
        Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_HEIGHT),
        PICKER_DAYS.length - 1,
      ));
      setSelectedIdx(idx);
      onChange(idx + 1);
    },
    [onChange],
  );

  return (
    <View style={styles.dayPickerInner}>
      <View pointerEvents="none" style={styles.dayPickerIndicator} />
      <ScrollView
        ref={scrollRef}
        bounces={false}
        contentContainerStyle={styles.dayPickerScrollContent}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ITEM_HEIGHT}
      >
        {PICKER_DAYS.map((day, i) => (
          <View key={day} style={styles.dayPickerItem}>
            <Text style={[styles.dayPickerText, i === selectedIdx && styles.dayPickerTextSelected]}>
              {day}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function BudgetResetPicker({
  onClose,
  onSelect,
  value,
  visible,
}: {
  onClose: () => void;
  onSelect: (day: number) => void;
  value: number;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) { setMounted(false); onClose(); }
    });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      setLocalValue(value);
      setMounted(true);
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

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}>
      <Animated.View pointerEvents="box-none" style={[styles.overlay, { opacity: backdropOpacity }]}>
        <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Budget Reset Date</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CLOSE_PATH} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>
        <View style={styles.divider} />
        <View style={styles.budgetPickerRow}>
          <DayScrollPicker
            value={localValue}
            onChange={(day) => { setLocalValue(day); onSelect(day); }}
          />
          <Text style={styles.ofTheMonthText}>of the month</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Week start picker ────────────────────────────────────────────────────────

function WeekStartPicker({
  onClose,
  onSelect,
  selected,
  visible,
}: {
  onClose: () => void;
  onSelect: (day: Day) => void;
  selected: Day;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) { setMounted(false); onClose(); }
    });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
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

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.overlay, { opacity: backdropOpacity }]}
      >
        <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 8, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Start of the Week</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CLOSE_PATH} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>

        <View style={styles.divider} />

        <View style={styles.dayGrid}>
          {DAYS.map((day) => {
            const isSelected = day === selected;
            return (
              <Pressable
                key={day}
                onPress={() => { onSelect(day); closeSheet(); }}
                style={[styles.dayChip, isSelected && styles.dayChipSelected]}
              >
                <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CurrencyPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [weekPickerVisible, setWeekPickerVisible] = useState(false);
  const [budgetPickerVisible, setBudgetPickerVisible] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<Currency | null>(null);
  const [startOfWeek, setStartOfWeek] = useState<Day>("Monday");
  const [budgetResetDay, setBudgetResetDay] = useState(1);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    AsyncStorage.getItem(HOME_CURRENCY_KEY).then((code) => {
      if (code) {
        const found = currencies.find((c) => c.code === code);
        if (found) setBaseCurrency(found);
      }
    }).catch(() => {});
    AsyncStorage.getItem(WEEK_START_KEY).then((day) => {
      if (day && DAYS.includes(day as Day)) setStartOfWeek(day as Day);
    }).catch(() => {});
    AsyncStorage.getItem(BUDGET_RESET_KEY).then((val) => {
      if (val) { const n = parseInt(val, 10); if (n >= 1 && n <= 28) setBudgetResetDay(n); }
    }).catch(() => {});
  }, []);

  function handleCurrencySelect(currency: Currency) {
    setBaseCurrency(currency);
    AsyncStorage.setItem(HOME_CURRENCY_KEY, currency.code).catch(() => {});
    setPickerVisible(false);
  }

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

  return (
    <View style={styles.root}>
      {/* Dim overlay — tapping dismisses */}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.overlay, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Currency & Preferences</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path
                clipRule="evenodd"
                d={CLOSE_PATH}
                fill={figmaColors.grayNeutral["500"]}
                fillRule="evenodd"
              />
            </Svg>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* Rows */}
        <View style={styles.content}>
          {/* Base Currency */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            onPress={() => setPickerVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <RowIcon bg={figmaColors.blue["500"]} paths={BASE_CURRENCY_ICON} />
            <Text style={styles.label}>Base Currency</Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>{baseCurrency?.code ?? "USD"}</Text>
              <ChevronRight />
            </View>
          </Pressable>

          {/* Start of the Week */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            onPress={() => setWeekPickerVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <RowIcon bg={figmaColors.warning["500"]} paths={START_OF_WEEK_ICON} />
            <Text style={styles.label}>Start of the Week</Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>{startOfWeek}</Text>
              <ChevronRight />
            </View>
          </Pressable>

          {/* Budget Reset Date */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            onPress={() => setBudgetPickerVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <RowIcon bg={figmaColors.success["500"]} paths={BUDGET_RESET_ICON} />
            <Text style={styles.label}>Budget Reset Date</Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>{ordinal(budgetResetDay)}</Text>
              <ChevronRight />
            </View>
          </Pressable>
        </View>
      </Animated.View>

      <CurrencyPicker
        onClose={() => setPickerVisible(false)}
        onSelectCurrency={handleCurrencySelect}
        visible={pickerVisible}
      />

      <BudgetResetPicker
        onClose={() => setBudgetPickerVisible(false)}
        onSelect={(day) => {
          setBudgetResetDay(day);
          AsyncStorage.setItem(BUDGET_RESET_KEY, String(day)).catch(() => {});
        }}
        value={budgetResetDay}
        visible={budgetPickerVisible}
      />

      <WeekStartPicker
        onClose={() => setWeekPickerVisible(false)}
        onSelect={(day) => {
          setStartOfWeek(day);
          AsyncStorage.setItem(WEEK_START_KEY, day).catch(() => {});
        }}
        selected={startOfWeek}
        visible={weekPickerVisible}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  divider: {
    backgroundColor: figmaColors.grayNeutral["100"],
    height: 1,
    marginHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: figmaColors.grayNeutral["50"],
  },
  iconContainer: {
    alignItems: "center",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  label: {
    color: figmaColors.grayNeutral["800"],
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.18,
  },
  valueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  value: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.18,
  },
  budgetPickerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  dayPickerInner: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 16,
    flex: 1,
    height: PICKER_ITEM_HEIGHT * 5,
    overflow: "hidden",
  },
  dayPickerIndicator: {
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 10,
    height: PICKER_ITEM_HEIGHT,
    left: 6,
    position: "absolute",
    right: 6,
    top: PICKER_ITEM_HEIGHT * 2,
  },
  dayPickerScrollContent: {
    paddingVertical: PICKER_ITEM_HEIGHT * 2,
  },
  dayPickerItem: {
    alignItems: "center",
    height: PICKER_ITEM_HEIGHT,
    justifyContent: "center",
    marginHorizontal: 6,
  },
  dayPickerText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  dayPickerTextSelected: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
  },
  ofTheMonthText: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.18,
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  dayChip: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dayChipSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  dayLabel: {
    color: figmaColors.grayNeutral["800"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  dayLabelSelected: {
    color: "#fff",
  },
});
