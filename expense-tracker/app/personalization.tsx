import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";

// ─── SVG paths ───────────────────────────────────────────────────────────────

type IconPath = { d: string; evenodd?: boolean };

const THEME_ICON: IconPath[] = [
  { d: "M19.8224 9.99987C19.8224 15.6856 16.8324 19.0813 11.4667 19.5813C10.6809 19.6527 10.0381 19.0056 10.0381 18.217V1.78416C10.0381 0.994155 10.6809 0.345584 11.4667 0.41987C16.8324 0.91987 19.8224 4.31273 19.8224 9.99987Z" },
  { d: "M4.60964 4.14592C4.4005 4.33839 4.12346 4.4399 3.83948 4.42811C3.5555 4.41632 3.28783 4.2922 3.09535 4.08306C2.90288 3.87392 2.80138 3.59688 2.81316 3.3129C2.819 3.17229 2.85248 3.0342 2.91168 2.90652C2.97088 2.77884 3.05465 2.66408 3.15821 2.56878C4.19071 1.63059 5.41677 0.930748 6.74964 0.518776C6.88378 0.476284 7.02497 0.460628 7.16515 0.472702C7.30534 0.484776 7.44178 0.524344 7.56667 0.589146C7.69157 0.653948 7.80247 0.742715 7.89306 0.85038C7.98365 0.958044 8.05215 1.0825 8.09464 1.21663C8.13713 1.35077 8.15279 1.49196 8.14071 1.63215C8.12864 1.77233 8.08907 1.90877 8.02427 2.03366C7.95947 2.15856 7.8707 2.26947 7.76304 2.36006C7.65537 2.45065 7.53092 2.51914 7.39678 2.56163C6.36339 2.87935 5.41241 3.42019 4.61107 4.14592H4.60964ZM0.318211 8.11449C0.222799 8.73851 0.175516 9.36894 0.176783 10.0002C0.176783 10.6488 0.225354 11.2788 0.31964 11.8859C0.367834 12.1625 0.522636 12.4091 0.750753 12.5726C0.97887 12.7362 1.26208 12.8038 1.53947 12.7607C1.81687 12.7177 2.06629 12.5675 2.23409 12.3424C2.40189 12.1174 2.47467 11.8355 2.43678 11.5573C2.35789 11.0421 2.31872 10.5215 2.31964 10.0002C2.31964 9.45449 2.35964 8.93449 2.43678 8.44306C2.48035 8.16212 2.41054 7.87538 2.24269 7.64592C2.07485 7.41645 1.82272 7.26306 1.54178 7.21949C1.26084 7.17592 0.9741 7.24574 0.744636 7.41358C0.515172 7.58143 0.361782 7.83355 0.318211 8.11449ZM3.09678 15.9259C3.00127 16.0293 2.92706 16.1504 2.87838 16.2825C2.82971 16.4145 2.80752 16.5549 2.81309 16.6955C2.81866 16.8361 2.85188 16.9743 2.91086 17.102C2.96983 17.2298 3.05339 17.3447 3.15678 17.4402C4.18914 18.3802 5.41723 19.0794 6.7525 19.4873C6.88673 19.5296 7.02796 19.5449 7.16812 19.5325C7.30829 19.5202 7.44464 19.4803 7.56941 19.4153C7.82137 19.2838 8.01082 19.0577 8.09607 18.7866C8.13828 18.6524 8.15364 18.5112 8.14127 18.371C8.1289 18.2308 8.08904 18.0945 8.02397 17.9697C7.95891 17.845 7.8699 17.7342 7.76204 17.6439C7.65419 17.5535 7.52958 17.4853 7.39535 17.4431C6.36151 17.13 5.41006 16.5913 4.60964 15.8659C4.40097 15.6735 4.12445 15.5717 3.8408 15.5829C3.55715 15.5942 3.28956 15.7175 3.09678 15.9259Z", evenodd: true },
];

const APP_ICON: IconPath[] = [
  { d: "M14.3272 17.584C14.0252 18.2542 13.6499 18.9105 13.1999 19.4784C16.9335 18.2215 19.682 14.8257 19.9846 10.75H18.6555C17.0335 10.75 15.7307 12.043 15.467 13.6415C15.224 15.1148 14.8352 16.4565 14.3272 17.584Z" },
  { d: "M11.3875 10.75C13.0856 10.75 14.4748 12.1649 14.1629 13.8321C13.4854 17.4534 11.8767 20 10 20C7.62533 20 5.67975 15.9225 5.50695 10.75H11.3875Z" },
  { d: "M15.5016 6.57508C15.7499 8.18843 17.0588 9.5 18.6931 9.5H20C19.7936 5.31357 17.0096 1.80408 13.1999 0.521585C13.6499 1.08946 14.0252 1.7458 14.3272 2.41598C14.86 3.5985 15.2617 5.01654 15.5016 6.57508Z" },
  { d: "M14.213 6.44786C14.4971 8.10664 13.114 9.5 11.429 9.5H5.5C5.61738 4.20944 7.5872 0 10 0C11.9247 0 13.5675 2.67861 14.213 6.44786Z" },
  { d: "M4.24818 9.5C4.30504 6.79584 4.82156 4.3053 5.6728 2.41598C5.97475 1.7458 6.35012 1.08946 6.80014 0.521585C2.99043 1.80408 0.2064 5.31357 0 9.5H4.24818Z" },
  { d: "M0.0154379 10.75C0.318009 14.8257 3.06651 18.2215 6.80014 19.4784C6.35012 18.9105 5.97475 18.2542 5.6728 17.584C4.84786 15.7531 4.33728 13.3575 4.25476 10.75H0.0154379Z" },
];

const HAND_FINGER_PATH =
  "M5.83332 3.75033C5.83332 3.19779 6.05281 2.66789 6.44351 2.27719C6.83421 1.88649 7.36412 1.66699 7.91665 1.66699C8.46919 1.66699 8.99909 1.88649 9.38979 2.27719C9.78049 2.66789 9.99998 3.19779 9.99998 3.75033V7.58782L14.535 8.09199C15.3502 8.18262 16.1033 8.57063 16.6503 9.18177C17.1974 9.79291 17.4999 10.5843 17.5 11.4045V11.667C17.5 13.4351 16.7976 15.1308 15.5474 16.381C14.2971 17.6313 12.6014 18.3337 10.8333 18.3337H10.2717C9.03366 18.3336 7.82013 17.9889 6.76702 17.338C5.71392 16.6872 4.86284 15.7559 4.30915 14.6487L1.94082 9.91199C1.64082 9.31199 1.86332 8.50949 2.56332 8.22199C3.43249 7.86616 4.25832 7.79949 5.10915 8.23199C5.35582 8.35699 5.59582 8.52116 5.83332 8.71866V3.75033Z";

const CHEVRON_RIGHT_PATH =
  "M13.0892 9.41083C13.2454 9.56711 13.3332 9.77903 13.3332 10C13.3332 10.221 13.2454 10.4329 13.0892 10.5892L8.375 15.3033C8.29813 15.3829 8.20617 15.4464 8.1045 15.4901C8.00283 15.5338 7.89348 15.5567 7.78283 15.5577C7.67218 15.5587 7.56245 15.5376 7.46004 15.4957C7.35762 15.4538 7.26458 15.3919 7.18634 15.3137C7.10809 15.2354 7.04622 15.1424 7.00431 15.04C6.96241 14.9375 6.94133 14.8278 6.94229 14.7172C6.94325 14.6065 6.96624 14.4972 7.00992 14.3955C7.05359 14.2938 7.11707 14.2019 7.19667 14.125L11.3217 10L7.19667 5.875C7.04487 5.71783 6.96087 5.50733 6.96277 5.28883C6.96467 5.07033 7.05231 4.86132 7.20682 4.70682C7.36132 4.55231 7.57033 4.46467 7.78883 4.46277C8.00733 4.46087 8.21783 4.54487 8.375 4.69667L13.0892 9.41083Z";

const CLOSE_PATH =
  "M15.0893 4.91083C15.4147 5.23626 15.4147 5.7638 15.0893 6.08923L11.1785 10.0001L15.0893 13.9109C15.4147 14.2363 15.4147 14.7638 15.0893 15.0893C14.7638 15.4147 14.2363 15.4147 13.9109 15.0893L10.0001 11.1785L6.08923 15.0893C5.7638 15.4147 5.23626 15.4147 4.91083 15.0893C4.5854 14.7638 4.5854 14.2363 4.91083 13.9109L8.82166 10.0001L4.91083 6.08923C4.5854 5.7638 4.5854 5.23626 4.91083 4.91083C5.23626 4.5854 5.7638 4.5854 6.08923 4.91083L10.0001 8.82166L13.9109 4.91083C14.2363 4.5854 14.7638 4.5854 15.0893 4.91083Z";

// ─── Icon components ──────────────────────────────────────────────────────────

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

// ─── Screen ───────────────────────────────────────────────────────────────────

const HAPTIC_KEY = "europa:haptic-enabled";

export default function PersonalizationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hapticEnabled, setHapticEnabled] = useState(false);

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

  useEffect(() => {
    AsyncStorage.getItem(HAPTIC_KEY)
      .then((val) => { if (val !== null) setHapticEnabled(val === "true"); })
      .catch(() => {});
  }, []);

  function handleHapticToggle(value: boolean) {
    setHapticEnabled(value);
    AsyncStorage.setItem(HAPTIC_KEY, String(value)).catch(() => {});
    if (value) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

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
          <Text style={styles.title}>Personalization</Text>
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
          {/* App Theme */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <RowIcon bg={figmaColors.blue["500"]} paths={THEME_ICON} />
            <Text style={styles.label}>App Theme</Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>System</Text>
              <ChevronRight />
            </View>
          </Pressable>

          {/* App Icon */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <RowIcon bg={figmaColors.warning["500"]} paths={APP_ICON} />
            <Text style={styles.label}>App Icon</Text>
            <ChevronRight />
          </Pressable>

          {/* Haptic Feedback */}
          <View style={styles.row}>
            <RowIcon bg={figmaColors.success["500"]} paths={[{ d: HAND_FINGER_PATH, evenodd: true }]} />
            <Text style={styles.label}>Haptic Feedback</Text>
            <Switch
              ios_backgroundColor={figmaColors.grayNeutral["200"]}
              onValueChange={handleHapticToggle}
              style={styles.toggle}
              thumbColor="#fff"
              trackColor={{
                false: figmaColors.grayNeutral["200"],
                true: figmaColors.blue["500"],
              }}
              value={hapticEnabled}
            />
          </View>
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
  toggle: {
    alignSelf: "center",
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
});
