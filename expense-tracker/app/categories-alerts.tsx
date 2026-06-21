import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";

const NOTIFICATIONS_KEY = "europa:notifications-enabled";
const DAILY_REMINDER_KEY = "europa:daily-reminder-enabled";
const REMINDER_TIME_KEY = "europa:reminder-time";

const DEFAULT_TIME = "9:00 AM";
const PICKER_ITEM_HEIGHT = 52;
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(time: string): { hourIdx: number; minuteIdx: number; period: "AM" | "PM" } {
  const [hm, p] = time.split(" ");
  const [h, m] = hm.split(":");
  return {
    hourIdx: HOURS.indexOf(Number(h)),
    minuteIdx: MINUTES.indexOf((m ?? "00").padStart(2, "0")),
    period: (p ?? "AM") as "AM" | "PM",
  };
}

function formatTime(hourIdx: number, minuteIdx: number, period: "AM" | "PM"): string {
  return `${HOURS[hourIdx]}:${MINUTES[minuteIdx]} ${period}`;
}

// ─── SVG paths ───────────────────────────────────────────────────────────────

const NOTIFICATIONS_D =
  "M10 1.66667C8.23333 1.66667 6.55833 2.3625 5.32917 3.59167C4.1 4.82083 3.40417 6.49583 3.40417 8.26667V11.5083L2.24167 13.4917C2.1 13.7333 2.025 14.0083 2.025 14.2917C2.025 15.1583 2.72917 15.8583 3.59583 15.8583H16.4042C17.2708 15.8583 17.975 15.1583 17.975 14.2917C17.975 14.0083 17.9 13.7333 17.7583 13.4917L16.5958 11.5083V8.26667C16.5958 6.49583 15.9 4.82083 14.6708 3.59167C13.4417 2.3625 11.7667 1.66667 10 1.66667ZM8.33333 16.6667C8.33333 17.1087 8.50893 17.5326 8.82149 17.8452C9.13405 18.1577 9.55797 18.3333 10 18.3333C10.442 18.3333 10.8659 18.1577 11.1785 17.8452C11.4911 17.5326 11.6667 17.1087 11.6667 16.6667H8.33333Z";

const DAILY_REMINDER_D =
  "M9.99977 3.33345C10.9847 3.33345 11.96 3.52744 12.8699 3.90435C13.7798 4.28126 14.6066 4.83371 15.3031 5.53015C15.9995 6.22659 16.552 7.05338 16.9289 7.96332C17.3058 8.87326 17.4998 9.84853 17.4998 10.8334C17.4998 11.8184 17.3058 12.7936 16.9289 13.7036C16.552 14.6135 15.9995 15.4403 15.3031 16.1367C14.6066 16.8332 13.7798 17.3856 12.8699 17.7625C11.96 18.1395 10.9847 18.3334 9.99977 18.3334C8.01065 18.3334 6.10299 17.5433 4.69647 16.1367C3.28995 14.7302 2.49977 12.8226 2.49977 10.8334C2.49977 8.84432 3.28995 6.93667 4.69647 5.53015C6.10299 4.12362 8.01065 3.33345 9.99977 3.33345ZM9.99977 6.66678C9.79566 6.66681 9.59866 6.74174 9.44613 6.87738C9.2936 7.01301 9.19615 7.19991 9.17227 7.40262L9.16644 7.50011V10.8218C9.16368 11.0071 9.22292 11.1881 9.33477 11.3359L9.40977 11.4226L11.1648 13.1768C11.3144 13.3278 11.5161 13.416 11.7286 13.4232C11.941 13.4304 12.1482 13.3561 12.3078 13.2156C12.4673 13.075 12.567 12.8788 12.5866 12.6671C12.6062 12.4554 12.5441 12.2442 12.4131 12.0768L12.3431 11.9984L10.8331 10.4884V7.50011C10.8331 7.2791 10.7453 7.06714 10.589 6.91086C10.4327 6.75458 10.2208 6.66678 9.99977 6.66678ZM14.9998 2.17178C16.0397 2.77361 16.9632 3.55714 17.7264 4.48512C17.8595 4.65648 17.9205 4.87298 17.8964 5.0886C17.8723 5.30421 17.7651 5.50195 17.5976 5.63977C17.43 5.77759 17.2153 5.84463 16.9991 5.82665C16.7829 5.80866 16.5823 5.70706 16.4398 5.54345C15.8032 4.76956 15.0329 4.11615 14.1656 3.61428C14.0709 3.55945 13.9879 3.48651 13.9214 3.39961C13.8548 3.31271 13.8061 3.21356 13.7779 3.10782C13.7497 3.00207 13.7426 2.89181 13.757 2.78332C13.7714 2.67483 13.807 2.57025 13.8619 2.47553C13.9167 2.38082 13.9896 2.29783 14.0765 2.2313C14.1634 2.16478 14.2626 2.11602 14.3683 2.08781C14.4741 2.05961 14.5843 2.05251 14.6928 2.06691C14.8013 2.08132 14.9051 2.11695 14.9998 2.17178ZM6.1381 2.47595C6.24861 2.66735 6.27855 2.8948 6.22135 3.10828C6.16416 3.32176 6.0245 3.50377 5.8331 3.61428C4.9657 4.1164 4.19544 4.77009 3.55894 5.54428C3.49061 5.63228 3.40534 5.70568 3.30816 5.76015C3.21097 5.81462 3.10385 5.84905 2.99313 5.86141C2.88241 5.87376 2.77034 5.86379 2.66354 5.83208C2.55674 5.80038 2.45738 5.74758 2.37134 5.6768C2.2853 5.60603 2.21432 5.51873 2.16261 5.42005C2.11089 5.32137 2.07949 5.21333 2.07025 5.1023C2.06102 4.99128 2.07413 4.87953 2.10883 4.77366C2.14353 4.6678 2.19911 4.56996 2.27227 4.48595C3.03516 3.55774 3.9584 2.77393 4.9981 2.17178C5.09286 2.1169 5.19751 2.08124 5.30605 2.06682C5.4146 2.05241 5.52493 2.05953 5.63073 2.08778C5.73652 2.11602 5.83571 2.16485 5.92263 2.23145C6.00955 2.29806 6.08248 2.38114 6.13727 2.47595H6.1381Z";

const CLOCK_D =
  "M10 1.66667C14.6025 1.66667 18.3333 5.3975 18.3333 10C18.3333 14.6025 14.6025 18.3333 10 18.3333C5.3975 18.3333 1.66667 14.6025 1.66667 10C1.66667 5.3975 5.3975 1.66667 10 1.66667ZM10.8333 5.83333C10.8333 5.37333 10.46 5 10 5C9.54 5 9.16667 5.37333 9.16667 5.83333V10C9.16667 10.221 9.25446 10.433 9.41074 10.5893L12.0774 13.2559C12.4029 13.5814 12.9304 13.5814 13.2559 13.2559C13.5814 12.9304 13.5814 12.4029 13.2559 12.0774L10.8333 9.655V5.83333Z";

const CHEVRON_DOWN_D =
  "M10.5892 13.0892C10.4329 13.2454 10.221 13.3332 10 13.3332C9.77903 13.3332 9.56711 13.2454 9.41083 13.0892L4.69667 8.375C4.61707 8.29813 4.55359 8.20617 4.50992 8.1045C4.46624 8.00283 4.44325 7.89348 4.44229 7.78283C4.44133 7.67218 4.46241 7.56245 4.50431 7.46004C4.54622 7.35762 4.60809 7.26458 4.68634 7.18634C4.76458 7.10809 4.85762 7.04622 4.96004 7.00431C5.06245 6.96241 5.17218 6.94133 5.28283 6.94229C5.39348 6.94325 5.50283 6.96624 5.6045 7.00992C5.70617 7.05359 5.79813 7.11707 5.875 7.19667L10 11.3217L14.125 7.19667C14.2822 7.04487 14.4927 6.96087 14.7112 6.96277C14.9297 6.96467 15.1387 7.05231 15.2932 7.20682C15.4477 7.36132 15.5353 7.57033 15.5372 7.78883C15.5391 8.00733 15.4551 8.21783 15.3033 8.375L10.5892 13.0892Z";

const CLOSE_D =
  "M15.0893 4.91083C15.4147 5.23626 15.4147 5.7638 15.0893 6.08923L11.1785 10.0001L15.0893 13.9109C15.4147 14.2363 15.4147 14.7638 15.0893 15.0893C14.7638 15.4147 14.2363 15.4147 13.9109 15.0893L10.0001 11.1785L6.08923 15.0893C5.7638 15.4147 5.23626 15.4147 4.91083 15.0893C4.5854 14.7638 4.5854 14.2363 4.91083 13.9109L8.82166 10.0001L4.91083 6.08923C4.5854 5.7638 4.5854 5.23626 4.91083 4.91083C5.23626 4.5854 5.7638 4.5854 6.08923 4.91083L10.0001 8.82166L13.9109 4.91083C14.2363 4.5854 14.7638 4.5854 15.0893 4.91083Z";

// ─── Time picker drum column ───────────────────────────────────────────────────

function TimeColumn({
  items,
  selectedIdx,
  onSelect,
}: {
  items: (string | number)[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ animated: false, y: selectedIdx * PICKER_ITEM_HEIGHT });
  }, []);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const idx = Math.max(
        0,
        Math.min(Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_HEIGHT), items.length - 1)
      );
      onSelect(idx);
    },
    [items.length, onSelect]
  );

  return (
    <View style={colStyles.outer}>
      <View pointerEvents="none" style={colStyles.indicator} />
      <ScrollView
        ref={scrollRef}
        bounces={false}
        contentContainerStyle={colStyles.scrollContent}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ITEM_HEIGHT}
      >
        {items.map((item, i) => (
          <View key={i} style={colStyles.item}>
            <Text style={[colStyles.text, i === selectedIdx && colStyles.textSelected]}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const colStyles = StyleSheet.create({
  outer: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 16,
    flex: 1,
    height: PICKER_ITEM_HEIGHT * 5,
    overflow: "hidden",
  },
  indicator: {
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 10,
    height: PICKER_ITEM_HEIGHT,
    left: 6,
    position: "absolute",
    right: 6,
    top: PICKER_ITEM_HEIGHT * 2,
  },
  scrollContent: { paddingVertical: PICKER_ITEM_HEIGHT * 2 },
  item: {
    alignItems: "center",
    height: PICKER_ITEM_HEIGHT,
    justifyContent: "center",
    marginHorizontal: 6,
  },
  text: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.medium,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  textSelected: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.bold,
  },
});

// ─── Reminder time picker sheet ───────────────────────────────────────────────

function ReminderTimePicker({
  visible,
  initialTime,
  onSelect,
  onClose,
}: {
  visible: boolean;
  initialTime: string;
  onSelect: (time: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  const parsed = parseTime(initialTime);
  const [hourIdx, setHourIdx] = useState(Math.max(0, parsed.hourIdx));
  const [minuteIdx, setMinuteIdx] = useState(Math.max(0, parsed.minuteIdx));
  const [period, setPeriod] = useState<"AM" | "PM">(parsed.period);

  useEffect(() => {
    if (visible && !mounted) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [mounted]);

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
  }, [onClose]);

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.overlay, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>
      <Animated.View
        style={[
          styles.pickerSheet,
          { paddingBottom: insets.bottom + 8, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Reminder Time</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CLOSE_D} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>
        <View style={styles.divider} />
        <Text style={styles.timePreview}>
          {`${HOURS[hourIdx]}:${MINUTES[minuteIdx]} ${period}`}
        </Text>
        <View style={styles.columnsRow}>
          <TimeColumn items={HOURS} selectedIdx={hourIdx} onSelect={setHourIdx} />
          <Text style={styles.colonSeparator}>:</Text>
          <TimeColumn items={MINUTES} selectedIdx={minuteIdx} onSelect={setMinuteIdx} />
        </View>
        <View style={styles.periodRow}>
          {(["AM", "PM"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.periodChip, period === p && styles.periodChipSelected]}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextSelected]}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => {
            onSelect(formatTime(hourIdx, minuteIdx, period));
            closeSheet();
          }}
          style={styles.saveButton}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CategoriesAlertsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_TIME);
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    AsyncStorage.multiGet([NOTIFICATIONS_KEY, DAILY_REMINDER_KEY, REMINDER_TIME_KEY])
      .then(([notif, reminder, time]) => {
        if (notif[1] === "true") setNotificationsEnabled(true);
        if (reminder[1] === "true") setDailyReminderEnabled(true);
        if (time[1]) setReminderTime(time[1]);
      })
      .catch(() => {});
  }, []);

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
    ]).start(({ finished }) => {
      if (finished) router.back();
    });
  }, []);

  function handleNotificationsToggle(val: boolean) {
    setNotificationsEnabled(val);
    AsyncStorage.setItem(NOTIFICATIONS_KEY, String(val)).catch(() => {});
    if (!val) {
      setDailyReminderEnabled(false);
      AsyncStorage.setItem(DAILY_REMINDER_KEY, "false").catch(() => {});
    }
  }

  function handleDailyReminderToggle(val: boolean) {
    if (!notificationsEnabled) return;
    setDailyReminderEnabled(val);
    AsyncStorage.setItem(DAILY_REMINDER_KEY, String(val)).catch(() => {});
  }

  function handleTimeSave(time: string) {
    setReminderTime(time);
    AsyncStorage.setItem(REMINDER_TIME_KEY, time).catch(() => {});
  }

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.overlay, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CLOSE_D} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>

        <View style={styles.divider} />

        <View style={styles.content}>
          {/* Notifications */}
          <View style={styles.row}>
            <View style={[styles.iconContainer, { backgroundColor: figmaColors.warning["500"] }]}>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path d={NOTIFICATIONS_D} fill="#fff" />
              </Svg>
            </View>
            <Text style={styles.label}>Notifications</Text>
            <Switch
              onValueChange={handleNotificationsToggle}
              style={styles.toggle}
              thumbColor={figmaColors.base.white}
              trackColor={{ false: figmaColors.grayNeutral["200"], true: figmaColors.blue["500"] }}
              value={notificationsEnabled}
            />
          </View>

          {/* Daily Reminder */}
          <View style={[styles.row, !notificationsEnabled && styles.rowDisabled]}>
            <View style={[styles.iconContainer, { backgroundColor: figmaColors.success["500"] }]}>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path d={DAILY_REMINDER_D} fill="#fff" />
              </Svg>
            </View>
            <Text style={[styles.label, !notificationsEnabled && styles.labelDisabled]}>
              Daily Reminder
            </Text>
            <Switch
              disabled={!notificationsEnabled}
              onValueChange={handleDailyReminderToggle}
              style={styles.toggle}
              thumbColor={figmaColors.base.white}
              trackColor={{ false: figmaColors.grayNeutral["200"], true: figmaColors.blue["500"] }}
              value={dailyReminderEnabled}
            />
          </View>

          {/* Reminder Time — visible only when daily reminder is on */}
          {dailyReminderEnabled && (
            <Pressable
              android_ripple={{ color: figmaColors.grayNeutral["100"] }}
              onPress={() => setTimePickerVisible(true)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={[styles.iconContainer, { backgroundColor: figmaColors.violet["500"] }]}>
                <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                  <Path clipRule="evenodd" d={CLOCK_D} fill="#fff" fillRule="evenodd" />
                </Svg>
              </View>
              <Text style={styles.label}>Reminder Time</Text>
              <View style={styles.timeValue}>
                <Text style={styles.timeText}>{reminderTime}</Text>
                <Svg fill="none" height={16} viewBox="0 0 20 20" width={16}>
                  <Path
                    clipRule="evenodd"
                    d={CHEVRON_DOWN_D}
                    fill={figmaColors.grayNeutral["400"]}
                    fillRule="evenodd"
                  />
                </Svg>
              </View>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <ReminderTimePicker
        initialTime={reminderTime}
        onClose={() => setTimePickerVisible(false)}
        onSelect={handleTimeSave}
        visible={timePickerVisible}
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
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
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
    paddingVertical: 10,
  },
  rowPressed: {
    backgroundColor: figmaColors.grayNeutral["50"],
  },
  rowDisabled: {
    opacity: 0.4,
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
  labelDisabled: {
    color: figmaColors.grayNeutral["400"],
  },
  toggle: {
    alignSelf: "center",
  },
  timeValue: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  timeText: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  // ─── Time picker ───
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  pickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    paddingBottom: 16,
  },
  pickerTitle: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  columnsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  colonSeparator: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },
  periodRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  periodChip: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    flex: 1,
    paddingVertical: 14,
  },
  periodChipSelected: {
    backgroundColor: figmaColors.grayNeutral["900"],
  },
  periodText: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.18,
  },
  periodTextSelected: {
    color: figmaColors.base.white,
  },
  timePreview: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 32,
    letterSpacing: -0.5,
    marginBottom: 20,
    marginTop: 20,
    textAlign: "center",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 14,
    marginTop: 16,
    paddingVertical: 16,
  },
  saveButtonText: {
    color: figmaColors.base.white,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.18,
  },
});
