import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";

// ─── SVG paths ───────────────────────────────────────────────────────────────

const EXPENSE_D =
  "M14.1667 1.66667H5.83333C4.91667 1.66667 4.16667 2.41667 4.16667 3.33333V16.6667C4.16667 17.5833 4.91667 18.3333 5.83333 18.3333H8.75L10 16.6667L11.25 18.3333H14.1667C15.0833 18.3333 15.8333 17.5833 15.8333 16.6667V3.33333C15.8333 2.41667 15.0833 1.66667 14.1667 1.66667ZM7.5 14.1667H12.5C12.9583 14.1667 13.3333 13.7917 13.3333 13.3333C13.3333 12.875 12.9583 12.5 12.5 12.5H7.5C7.04167 12.5 6.66667 12.875 6.66667 13.3333C6.66667 13.7917 7.04167 14.1667 7.5 14.1667ZM7.5 10.8333H12.5C12.9583 10.8333 13.3333 10.4583 13.3333 10C13.3333 9.54167 12.9583 9.16667 12.5 9.16667H7.5C7.04167 9.16667 6.66667 9.54167 6.66667 10C6.66667 10.4583 7.04167 10.8333 7.5 10.8333ZM7.5 7.5H12.5C12.9583 7.5 13.3333 7.125 13.3333 6.66667C13.3333 6.20833 12.9583 5.83333 12.5 5.83333H7.5C7.04167 5.83333 6.66667 6.20833 6.66667 6.66667C6.66667 7.125 7.04167 7.5 7.5 7.5Z";

const INCOME_D =
  "M14.1667 1.66667H5.83333C4.91667 1.66667 4.16667 2.41667 4.16667 3.33333V16.6667C4.16667 17.5833 4.91667 18.3333 5.83333 18.3333H14.1667C15.0833 18.3333 15.8333 17.5833 15.8333 16.6667V3.33333C15.8333 2.41667 15.0833 1.66667 14.1667 1.66667ZM10.8333 10.8333H12.5C12.9583 10.8333 13.3333 10.4583 13.3333 10C13.3333 9.54167 12.9583 9.16667 12.5 9.16667H10.8333V7.5C10.8333 7.04167 10.4583 6.66667 10 6.66667C9.54167 6.66667 9.16667 7.04167 9.16667 7.5V9.16667H7.5C7.04167 9.16667 6.66667 9.54167 6.66667 10C6.66667 10.4583 7.04167 10.8333 7.5 10.8333H9.16667V12.5C9.16667 12.9583 9.54167 13.3333 10 13.3333C10.4583 13.3333 10.8333 12.9583 10.8333 12.5V10.8333Z";

const ACCOUNTS_D =
  "M15.8333 4.16667H4.16667C3.25 4.16667 2.5 4.91667 2.5 5.83333V6.25H17.5V5.83333C17.5 4.91667 16.75 4.16667 15.8333 4.16667ZM2.5 7.5V14.1667C2.5 15.0833 3.25 15.8333 4.16667 15.8333H15.8333C16.75 15.8333 17.5 15.0833 17.5 14.1667V7.5H2.5ZM12.5 11.6667C12.5 10.75 13.25 10 14.1667 10H15C15.9167 10 16.6667 10.75 16.6667 11.6667C16.6667 12.5833 15.9167 13.3333 15 13.3333H14.1667C13.25 13.3333 12.5 12.5833 12.5 11.6667Z";

const BUDGET_D =
  "M10.8333 2.135C14.7833 2.77583 17.8333 6.24083 17.8333 10.4167C17.8333 10.8333 17.4917 11.25 17.0833 11.25H11.6667V5.00583C11.6667 4.12583 10.9583 3.41667 10.0833 3.5C6.23333 3.9775 3.25 7.17417 3.25 11.0833C3.25 15.225 6.60417 18.5833 10.75 18.5833C12.375 18.5833 13.8667 18.05 15.0667 17.1333C15.6917 16.6642 16.5542 16.7008 17.0625 17.2667C17.6208 17.8917 17.5 18.8917 16.7917 19.3842C15.0583 20.5667 12.9917 21.25 10.75 21.25C5.225 21.25 0.75 16.775 0.75 11.25C0.75 5.9225 4.79 1.54667 9.95833 1.74583C10.25 1.75833 10.5417 1.93167 10.8333 2.135Z";

const CHEVRON_D =
  "M13.0892 9.41083C13.2454 9.56711 13.3332 9.77903 13.3332 10C13.3332 10.221 13.2454 10.4329 13.0892 10.5892L8.375 15.3033C8.29813 15.3829 8.20617 15.4464 8.1045 15.4901C8.00283 15.5338 7.89348 15.5567 7.78283 15.5577C7.67218 15.5587 7.56245 15.5376 7.46004 15.4957C7.35762 15.4538 7.26458 15.3919 7.18634 15.3137C7.10809 15.2354 7.04622 15.1424 7.00431 15.04C6.96241 14.9375 6.94133 14.8278 6.94229 14.7172C6.94325 14.6065 6.96624 14.4972 7.00992 14.3955C7.05359 14.2938 7.11707 14.2019 7.19667 14.125L11.3217 10L7.19667 5.875C7.04487 5.71783 6.96087 5.50733 6.96277 5.28883C6.96467 5.07033 7.05231 4.86132 7.20682 4.70682C7.36132 4.55231 7.57033 4.46467 7.78883 4.46277C8.00733 4.46087 8.21783 4.54487 8.375 4.69667L13.0892 9.41083Z";

const CLOSE_D =
  "M15.0893 4.91083C15.4147 5.23626 15.4147 5.7638 15.0893 6.08923L11.1785 10.0001L15.0893 13.9109C15.4147 14.2363 15.4147 14.7638 15.0893 15.0893C14.7638 15.4147 14.2363 15.4147 13.9109 15.0893L10.0001 11.1785L6.08923 15.0893C5.7638 15.4147 5.23626 15.4147 4.91083 15.0893C4.5854 14.7638 4.5854 14.2363 4.91083 13.9109L8.82166 10.0001L4.91083 6.08923C4.5854 5.7638 4.5854 5.23626 4.91083 4.91083C5.23626 4.5854 5.7638 4.5854 6.08923 4.91083L10.0001 8.82166L13.9109 4.91083C14.2363 4.5854 14.7638 4.5854 15.0893 4.91083Z";

// ─── Row data ─────────────────────────────────────────────────────────────────

const ROWS = [
  { label: "Expense Categories", icon: EXPENSE_D,  bg: figmaColors.error["500"],   evenodd: false },
  { label: "Income Categories",  icon: INCOME_D,   bg: figmaColors.success["500"], evenodd: false },
  { label: "Accounts",           icon: ACCOUNTS_D, bg: figmaColors.blue["500"],    evenodd: false },
  { label: "Budget Settings",    icon: BUDGET_D,   bg: figmaColors.warning["500"], evenodd: false },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CategoriesAccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
          <Text style={styles.title}>Categories & Accounts</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CLOSE_D} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>

        <View style={styles.divider} />

        <View style={styles.content}>
          {ROWS.map(({ label, icon, bg, evenodd }) => (
            <Pressable
              android_ripple={{ color: figmaColors.grayNeutral["100"] }}
              key={label}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={[styles.iconContainer, { backgroundColor: bg }]}>
                <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                  <Path
                    clipRule={evenodd ? "evenodd" : "nonzero"}
                    d={icon}
                    fill="#fff"
                    fillRule={evenodd ? "evenodd" : "nonzero"}
                  />
                </Svg>
              </View>
              <Text style={styles.label}>{label}</Text>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path clipRule="evenodd" d={CHEVRON_D} fill={figmaColors.grayNeutral["300"]} fillRule="evenodd" />
              </Svg>
            </Pressable>
          ))}
        </View>
      </Animated.View>
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
});
