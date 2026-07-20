import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import { useAccountsStore } from "@/stores/accounts";
import { useUIStore } from "@/stores/ui";

// ─── SVG paths ───────────────────────────────────────────────────────────────

const CLOSE_D =
  "M15.0893 4.91083C15.4147 5.23626 15.4147 5.7638 15.0893 6.08923L11.1785 10.0001L15.0893 13.9109C15.4147 14.2363 15.4147 14.7638 15.0893 15.0893C14.7638 15.4147 14.2363 15.4147 13.9109 15.0893L10.0001 11.1785L6.08923 15.0893C5.7638 15.4147 5.23626 15.4147 4.91083 15.0893C4.5854 14.7638 4.5854 14.2363 4.91083 13.9109L8.82166 10.0001L4.91083 6.08923C4.5854 5.7638 4.5854 5.23626 4.91083 4.91083C5.23626 4.5854 5.7638 4.5854 6.08923 4.91083L10.0001 8.82166L13.9109 4.91083C14.2363 4.5854 14.7638 4.5854 15.0893 4.91083Z";

const CHEVRON_D =
  "M13.0892 9.41083C13.2454 9.56711 13.3332 9.77903 13.3332 10C13.3332 10.221 13.2454 10.4329 13.0892 10.5892L8.375 15.3033C8.11783 15.5605 7.71217 15.5605 7.455 15.3033C7.19783 15.0461 7.19783 14.6405 7.455 14.3833L11.8383 10L7.455 5.61667C7.19783 5.3595 7.19783 4.95383 7.455 4.69667C7.71217 4.4395 8.11783 4.4395 8.375 4.69667L13.0892 9.41083Z";

// cloud_fill
const CLOUD_UPLOAD_D =
  "M4.16679 8.68027C4.18185 7.41688 4.63808 6.1985 5.45654 5.23595C6.27501 4.27341 7.40421 3.62726 8.64875 3.40932C9.89329 3.19139 11.1749 3.41537 12.2717 4.04251C13.3686 4.66966 14.2117 5.6605 14.6551 6.8436C15.8212 7.16518 16.8312 7.89845 17.4982 8.9076C18.1651 9.91675 18.4437 11.1334 18.2824 12.3322C18.1211 13.531 17.5309 14.6308 16.6209 15.4278C15.711 16.2247 14.5431 16.665 13.3335 16.6669H5.83346C4.87572 16.6676 3.947 16.3382 3.20362 15.7344C2.46024 15.1305 1.94758 14.289 1.75193 13.3514C1.55629 12.4139 1.68959 11.4376 2.12942 10.5868C2.56925 9.73602 3.28874 9.06274 4.16679 8.68027Z";

// upload_2_fill
const EXPORT_D =
  "M16.6663 12.0831C16.9979 12.0831 17.3158 12.2148 17.5502 12.4492C17.7846 12.6836 17.9163 13.0016 17.9163 13.3331V16.6664C17.9163 17.219 17.6968 17.7489 17.3061 18.1396C16.9154 18.5303 16.3855 18.7498 15.833 18.7498H4.16634C3.61381 18.7498 3.0839 18.5303 2.6932 18.1396C2.3025 17.7489 2.08301 17.219 2.08301 16.6664V13.3331C2.08301 13.0016 2.2147 12.6836 2.44912 12.4492C2.68354 12.2148 3.00149 12.0831 3.33301 12.0831C3.66453 12.0831 3.98247 12.2148 4.21689 12.4492C4.45131 12.6836 4.58301 13.0016 4.58301 13.3331V16.2498H15.4163V13.3331C15.4163 13.0016 15.548 12.6836 15.7825 12.4492C16.0169 12.2148 16.3348 12.0831 16.6663 12.0831ZM11.0305 2.59977L14.4188 5.98893C14.5382 6.10424 14.6335 6.24217 14.699 6.39468C14.7645 6.54718 14.799 6.71121 14.8004 6.87718C14.8018 7.04316 14.7702 7.20776 14.7074 7.36138C14.6445 7.515 14.5517 7.65456 14.4343 7.77193C14.317 7.88929 14.1774 7.98211 14.0238 8.04496C13.8702 8.10781 13.7056 8.13944 13.5396 8.138C13.3736 8.13655 13.2096 8.10207 13.0571 8.03656C12.9046 7.97105 12.7666 7.87582 12.6513 7.75643L11.2497 6.35477V13.3331C11.2497 13.6646 11.118 13.9826 10.8836 14.217C10.6491 14.4514 10.3312 14.5831 9.99967 14.5831C9.66815 14.5831 9.35021 14.4514 9.11579 14.217C8.88137 13.9826 8.74967 13.6646 8.74967 13.3331V6.35477L7.34801 7.75643C7.2327 7.87582 7.09477 7.97105 6.94226 8.03656C6.78976 8.10207 6.62573 8.13655 6.45976 8.138C6.29379 8.13944 6.12919 8.10781 5.97557 8.04496C5.82194 7.98211 5.68238 7.88929 5.56501 7.77193C5.44765 7.65456 5.35483 7.515 5.29198 7.36138C5.22913 7.20776 5.1975 7.04316 5.19894 6.87718C5.20039 6.71121 5.23487 6.54718 5.30038 6.39468C5.36589 6.24217 5.46112 6.10424 5.58051 5.98893L8.96884 2.6006C9.2423 2.32733 9.61308 2.17383 9.99967 2.17383C10.3863 2.17383 10.757 2.32733 11.0305 2.6006V2.59977Z";

// download_2_fill
const IMPORT_D =
  "M16.6663 12.0833C16.9979 12.0833 17.3158 12.215 17.5502 12.4494C17.7846 12.6839 17.9163 13.0018 17.9163 13.3333V16.6667C17.9163 17.2192 17.6968 17.7491 17.3061 18.1398C16.9154 18.5305 16.3855 18.75 15.833 18.75H4.16634C3.61381 18.75 3.0839 18.5305 2.6932 18.1398C2.3025 17.7491 2.08301 17.2192 2.08301 16.6667V13.3333C2.08301 13.0018 2.2147 12.6839 2.44912 12.4494C2.68354 12.215 3.00149 12.0833 3.33301 12.0833C3.66453 12.0833 3.98247 12.215 4.21689 12.4494C4.45131 12.6839 4.58301 13.0018 4.58301 13.3333V16.25H15.4163V13.3333C15.4163 13.0018 15.548 12.6839 15.7825 12.4494C16.0169 12.215 16.3348 12.0833 16.6663 12.0833ZM9.99967 1.25C10.3312 1.25 10.6491 1.3817 10.8836 1.61612C11.118 1.85054 11.2497 2.16848 11.2497 2.5V10.03L12.6513 8.62833C12.8878 8.4046 13.2021 8.28192 13.5276 8.28637C13.8531 8.29082 14.164 8.42205 14.3942 8.65216C14.6244 8.88227 14.7558 9.19311 14.7604 9.51857C14.765 9.84404 14.6425 10.1585 14.4188 10.395L11.0305 13.7842C10.757 14.0574 10.3863 14.2109 9.99967 14.2109C9.61308 14.2109 9.2423 14.0574 8.96884 13.7842L5.58051 10.3958C5.35281 10.1601 5.22682 9.84433 5.22967 9.51658C5.23251 9.18884 5.36397 8.87532 5.59573 8.64356C5.82749 8.4118 6.14101 8.28034 6.46876 8.27749C6.7965 8.27464 7.11225 8.40064 7.34801 8.62833L8.74967 10.03V2.5C8.74967 2.16848 8.88137 1.85054 9.11579 1.61612C9.35021 1.3817 9.66815 1.25 9.99967 1.25Z";

// delete_2_fill
const TRASH_D =
  "M11.9 1.66699C12.2498 1.66708 12.5907 1.77723 12.8744 1.98183C13.1581 2.18643 13.3703 2.47512 13.4808 2.80699L13.9333 4.16699H16.6667C16.8877 4.16699 17.0996 4.25479 17.2559 4.41107C17.4122 4.56735 17.5 4.77931 17.5 5.00033C17.5 5.22134 17.4122 5.4333 17.2559 5.58958C17.0996 5.74586 16.8877 5.83366 16.6667 5.83366L16.6642 5.89283L15.9417 16.012C15.8966 16.6425 15.6143 17.2325 15.1517 17.6633C14.6891 18.0941 14.0805 18.3336 13.4483 18.3337H6.55167C5.91955 18.3336 5.31092 18.0941 4.84831 17.6633C4.38569 17.2325 4.10342 16.6425 4.05833 16.012L3.33583 5.89199C3.33433 5.87258 3.33349 5.85313 3.33333 5.83366C3.11232 5.83366 2.90036 5.74586 2.74408 5.58958C2.5878 5.4333 2.5 5.22134 2.5 5.00033C2.5 4.77931 2.5878 4.56735 2.74408 4.41107C2.90036 4.25479 3.11232 4.16699 3.33333 4.16699H6.06667L6.51917 2.80699C6.62975 2.47498 6.84203 2.1862 7.12592 1.98159C7.4098 1.77697 7.75089 1.66691 8.10083 1.66699H11.9ZM7.5 8.33366C7.29589 8.33369 7.09889 8.40862 6.94636 8.54425C6.79383 8.67989 6.69638 8.86678 6.6725 9.06949L6.66667 9.16699V14.167C6.6669 14.3794 6.74823 14.5837 6.89404 14.7381C7.03985 14.8926 7.23913 14.9855 7.45116 14.998C7.6632 15.0104 7.87198 14.9414 8.03486 14.8051C8.19774 14.6688 8.30241 14.4754 8.3275 14.2645L8.33333 14.167V9.16699C8.33333 8.94598 8.24554 8.73402 8.08926 8.57774C7.93298 8.42146 7.72101 8.33366 7.5 8.33366ZM12.5 8.33366C12.279 8.33366 12.067 8.42146 11.9107 8.57774C11.7545 8.73402 11.6667 8.94598 11.6667 9.16699V14.167C11.6667 14.388 11.7545 14.6 11.9107 14.7562C12.067 14.9125 12.279 15.0003 12.5 15.0003C12.721 15.0003 12.933 14.9125 13.0893 14.7562C13.2455 14.6 13.3333 14.388 13.3333 14.167V9.16699C13.3333 8.94598 13.2455 8.73402 13.0893 8.57774C12.933 8.42146 12.721 8.33366 12.5 8.33366ZM11.9 3.33366H8.1L7.8225 4.16699H12.1775L11.9 3.33366Z";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DataManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [iCloudEnabled, setICloudEnabled] = useState(false);
  const [isEraseSheetOpen, setIsEraseSheetOpen] = useState(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;
  const eraseBackdropOpacity = useRef(new Animated.Value(0)).current;
  const eraseTranslateY = useRef(new Animated.Value(600)).current;

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
  }, [router]);

  const openEraseSheet = useCallback(() => {
    setIsEraseSheetOpen(true);
    eraseTranslateY.setValue(600);
    Animated.parallel([
      Animated.timing(eraseBackdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
      Animated.spring(eraseTranslateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [eraseBackdropOpacity, eraseTranslateY]);

  const closeEraseSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(eraseBackdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(eraseTranslateY, { duration: 220, toValue: 600, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setIsEraseSheetOpen(false); });
  }, [eraseBackdropOpacity, eraseTranslateY]);

  const confirmErase = useCallback(async () => {
    await AsyncStorage.multiRemove([
      "europa:transactions",
      "europa:accounts",
      "europa:categories",
      "europa:home-currency",
      "europa:week-start",
      "europa:budget-reset-day",
      "europa:haptic-enabled",
      "europa:notifications-enabled",
      "europa:daily-reminder-enabled",
      "europa:reminder-time",
    ]);
    useAccountsStore.setState({ accounts: [] });
    useUIStore.getState().setShouldResetOnboarding(true);
    router.replace("/");
  }, [router]);

  const handleExport = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const europaKeys = keys.filter((k) => k.startsWith("europa:"));
      const pairs = await AsyncStorage.multiGet(europaKeys);
      const data: Record<string, unknown> = {};
      pairs.forEach(([key, value]) => {
        if (value !== null) {
          try { data[key] = JSON.parse(value); }
          catch { data[key] = value; }
        }
      });
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: "Europa App Data Export",
      });
    } catch {
      // share cancelled or failed — no-op
    }
  }, []);

  const handleImport = useCallback(() => {
    // placeholder — requires document picker
  }, []);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        toValue: isEraseSheetOpen ? 0 : 1,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        toValue: isEraseSheetOpen ? 0.96 : 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentScale, isEraseSheetOpen]);

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents={isEraseSheetOpen ? "none" : "auto"}
        style={[
          styles.root,
          { opacity: contentOpacity, transform: [{ scale: contentScale }] },
        ]}
      >
      <Animated.View
        pointerEvents="box-none"
        style={[styles.overlay, { opacity: backdropOpacity }]}
      >
        <Pressable onPress={closeSheet} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Data Management</Text>
          <Pressable hitSlop={10} onPress={closeSheet} style={styles.closeButton}>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CLOSE_D} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>

        <View style={styles.divider} />

        <View style={styles.content}>
          {/* iCloud Backup */}
          <View style={styles.row}>
            <View style={[styles.iconContainer, { backgroundColor: figmaColors.warning["500"] }]}>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path clipRule="evenodd" d={CLOUD_UPLOAD_D} fill="#fff" fillRule="evenodd" />
              </Svg>
            </View>
            <Text style={styles.label}>iCloud Backup</Text>
            <Switch
              onValueChange={setICloudEnabled}
              style={styles.toggle}
              thumbColor="#fff"
              trackColor={{ false: figmaColors.grayNeutral["300"], true: figmaColors.blue["500"] }}
              value={iCloudEnabled}
            />
          </View>

          {/* Export Data */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            onPress={handleExport}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={[styles.iconContainer, { backgroundColor: figmaColors.pink["500"] }]}>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path d={EXPORT_D} fill="#fff" fillRule="nonzero" />
              </Svg>
            </View>
            <Text style={styles.label}>Export Data</Text>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CHEVRON_D} fill={figmaColors.grayNeutral["300"]} fillRule="evenodd" />
            </Svg>
          </Pressable>

          {/* Import Data */}
          <Pressable
            android_ripple={{ color: figmaColors.grayNeutral["100"] }}
            onPress={handleImport}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={[styles.iconContainer, { backgroundColor: figmaColors.cyan["500"] }]}>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path d={IMPORT_D} fill="#fff" fillRule="nonzero" />
              </Svg>
            </View>
            <Text style={styles.label}>Import Data</Text>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CHEVRON_D} fill={figmaColors.grayNeutral["300"]} fillRule="evenodd" />
            </Svg>
          </Pressable>

          {/* Erase All Data */}
          <Pressable
            android_ripple={{ color: figmaColors.error["50"] }}
            onPress={openEraseSheet}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={[styles.iconContainer, { backgroundColor: figmaColors.error["500"] }]}>
              <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                <Path clipRule="evenodd" d={TRASH_D} fill="#fff" fillRule="evenodd" />
              </Svg>
            </View>
            <Text style={[styles.label, styles.eraseLabel]}>Erase All Data</Text>
            <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
              <Path clipRule="evenodd" d={CHEVRON_D} fill={figmaColors.grayNeutral["300"]} fillRule="evenodd" />
            </Svg>
          </Pressable>
        </View>
      </Animated.View>
      </Animated.View>

      {/* Erase confirmation sheet */}
      <Modal animationType="none" onRequestClose={closeEraseSheet} transparent visible={isEraseSheetOpen}>
        <View style={styles.root}>
          <Animated.View
            pointerEvents="box-none"
            style={[styles.overlay, { opacity: eraseBackdropOpacity }]}
          >
            <Pressable onPress={closeEraseSheet} style={StyleSheet.absoluteFill} />
          </Animated.View>

          <Animated.View
            style={[
              styles.eraseSheet,
              { paddingBottom: insets.bottom + 8, transform: [{ translateY: eraseTranslateY }] },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Erase All Data</Text>
              <Pressable hitSlop={10} onPress={closeEraseSheet} style={styles.closeButton}>
                <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
                  <Path clipRule="evenodd" d={CLOSE_D} fill={figmaColors.grayNeutral["500"]} fillRule="evenodd" />
                </Svg>
              </Pressable>
            </View>

            <View style={styles.divider} />

            <View style={styles.eraseContent}>
              <View style={styles.eraseIconCircle}>
                <Svg fill="none" height={32} viewBox="0 0 20 20" width={32}>
                  <Path clipRule="evenodd" d={TRASH_D} fill="#fff" fillRule="evenodd" />
                </Svg>
              </View>

              <Text style={styles.eraseTitle}>Delete everything?</Text>
              <Text style={styles.eraseSubtitle}>
                {"All your data will be permanently deleted. This can't be undone."}
              </Text>
            </View>

            <Pressable
              onPress={confirmErase}
              style={({ pressed }) => [styles.eraseButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.eraseButtonText}>Erase data</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
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
  eraseLabel: {
    color: figmaColors.error["600"],
  },
  toggle: {
    alignSelf: "center",
  },
  eraseSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
  },
  eraseContent: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  eraseIconCircle: {
    alignItems: "center",
    backgroundColor: figmaColors.error["500"],
    borderRadius: 999,
    height: 72,
    justifyContent: "center",
    marginBottom: 8,
    width: 72,
  },
  eraseTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  eraseSubtitle: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 22,
    textAlign: "center",
  },
  eraseButton: {
    alignItems: "center",
    backgroundColor: figmaColors.error["500"],
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    marginTop: 8,
  },
  eraseButtonText: {
    color: "#fff",
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
