import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";

// ─── SVG paths ───────────────────────────────────────────────────────────────

const PALETTE_PATH =
  "M10 1.66667C14.6025 1.66667 18.3333 5.3975 18.3333 10C18.3333 10.5408 18.2817 11.07 18.1833 11.5833C17.8725 13.1958 16.3 13.9092 14.9275 13.7458L14.7817 13.725L13.3317 13.4833C13.1629 13.4552 12.9899 13.4678 12.827 13.5199C12.6641 13.5721 12.516 13.6624 12.395 13.7833C12.0867 14.0917 11.9392 14.5158 12.1467 14.93C12.4992 15.635 12.5042 16.44 12.1925 17.0992C11.7758 17.9833 10.925 18.3333 10 18.3333C5.3975 18.3333 1.66667 14.6025 1.66667 10C1.66667 5.3975 5.3975 1.66667 10 1.66667ZM6.25 9.16667C6.08585 9.16667 5.9233 9.199 5.77165 9.26182C5.61999 9.32464 5.48219 9.41671 5.36612 9.53278C5.25004 9.64886 5.15797 9.78666 5.09515 9.93831C5.03233 10.09 5 10.2525 5 10.4167C5 10.5808 5.03233 10.7434 5.09515 10.895C5.15797 11.0467 5.25004 11.1845 5.36612 11.3006C5.48219 11.4166 5.61999 11.5087 5.77165 11.5715C5.9233 11.6343 6.08585 11.6667 6.25 11.6667C6.58152 11.6667 6.89946 11.535 7.13388 11.3006C7.3683 11.0661 7.5 10.7482 7.5 10.4167C7.5 10.0851 7.3683 9.7672 7.13388 9.53278C6.89946 9.29836 6.58152 9.16667 6.25 9.16667ZM12.0833 5.83333C11.7518 5.83333 11.4339 5.96503 11.1994 6.19945C10.965 6.43387 10.8333 6.75181 10.8333 7.08333C10.8333 7.41485 10.965 7.7328 11.1994 7.96722C11.4339 8.20164 11.7518 8.33333 12.0833 8.33333C12.4149 8.33333 12.7328 8.20164 12.9672 7.96722C13.2016 7.7328 13.3333 7.41485 13.3333 7.08333C13.3333 6.75181 13.2016 6.43387 12.9672 6.19945C12.7328 5.96503 12.4149 5.83333 12.0833 5.83333ZM7.91667 5.83333C7.58515 5.83333 7.2672 5.96503 7.03278 6.19945C6.79836 6.43387 6.66667 6.75181 6.66667 7.08333C6.66667 7.41485 6.79836 7.7328 7.03278 7.96722C7.2672 8.20164 7.58515 8.33333 7.91667 8.33333C8.24819 8.33333 8.56613 8.20164 8.80055 7.96722C9.03497 7.7328 9.16667 7.41485 9.16667 7.08333C9.16667 6.75181 9.03497 6.43387 8.80055 6.19945C8.56613 5.96503 8.24819 5.83333 7.91667 5.83333Z";

const COIN_PATH =
  "M17.5 13.4525V14.5833C17.5 15.2617 17.1825 15.8417 16.7417 16.2975C16.3058 16.7492 15.7142 17.1175 15.0483 17.4092C13.7133 17.9925 11.9283 18.3333 10 18.3333C8.07167 18.3333 6.28667 17.9933 4.95167 17.4092C4.28583 17.1175 3.69417 16.7492 3.25833 16.2975C2.85417 15.8808 2.55417 15.3575 2.50667 14.7508L2.5 14.5833V13.4525C2.8875 13.6725 3.30167 13.8675 3.745 14.0317C5.43667 14.6575 7.64917 15.0067 10 15.0067C12.3508 15.0067 14.5633 14.6575 16.255 14.0317C16.5875 13.9083 16.9033 13.7683 17.2042 13.6125L17.5 13.4525ZM2.5 8.86917C2.8875 9.08917 3.30167 9.28417 3.745 9.44833C5.43667 10.0742 7.64917 10.4233 10 10.4233C12.3508 10.4233 14.5633 10.0742 16.255 9.44833C16.6851 9.28958 17.1015 9.09587 17.5 8.86917V11.4567C16.9466 11.8838 16.3319 12.2249 15.6767 12.4683C14.2142 13.01 12.2067 13.3408 10 13.3408C7.79417 13.3408 5.78667 13.01 4.32333 12.4683C3.66807 12.2249 3.05336 11.8838 2.5 11.4567V8.86917ZM10 2.5C11.9283 2.5 13.7133 2.84 15.0483 3.42417C15.7142 3.71583 16.3058 4.08417 16.7417 4.53583C17.1458 4.9525 17.4458 5.47583 17.4933 6.0825L17.5 6.25V6.87333C16.9467 7.30048 16.3319 7.64155 15.6767 7.885C14.2142 8.42667 12.2067 8.7575 10 8.7575C7.79417 8.7575 5.78667 8.42667 4.32333 7.885C3.75987 7.67599 3.22617 7.39416 2.73583 7.04667L2.5 6.87333V6.25C2.5 5.57167 2.8175 4.99167 3.25833 4.53583C3.69417 4.08417 4.28583 3.71583 4.95167 3.42417C6.28667 2.84083 8.07167 2.5 10 2.5Z";

const GRID_PATH =
  "M7.5 10.8333C7.94203 10.8333 8.36595 11.0089 8.67851 11.3215C8.99107 11.634 9.16667 12.058 9.16667 12.5V15.8333C9.16667 16.2754 8.99107 16.6993 8.67851 17.0118C8.36595 17.3244 7.94203 17.5 7.5 17.5H4.16667C3.72464 17.5 3.30072 17.3244 2.98816 17.0118C2.67559 16.6993 2.5 16.2754 2.5 15.8333V12.5C2.5 12.058 2.67559 11.634 2.98816 11.3215C3.30072 11.0089 3.72464 10.8333 4.16667 10.8333H7.5ZM15.8333 10.8333C16.2754 10.8333 16.6993 11.0089 17.0118 11.3215C17.3244 11.634 17.5 12.058 17.5 12.5V15.8333C17.5 16.2754 17.3244 16.6993 17.0118 17.0118C16.6993 17.3244 16.2754 17.5 15.8333 17.5H12.5C12.058 17.5 11.634 17.3244 11.3215 17.0118C11.0089 16.6993 10.8333 16.2754 10.8333 15.8333V12.5C10.8333 12.058 11.0089 11.634 11.3215 11.3215C11.634 11.0089 12.058 10.8333 12.5 10.8333H15.8333ZM7.5 2.5C7.94203 2.5 8.36595 2.67559 8.67851 2.98816C8.99107 3.30072 9.16667 3.72464 9.16667 4.16667V7.5C9.16667 7.94203 8.99107 8.36595 8.67851 8.67851C8.36595 8.99107 7.94203 9.16667 7.5 9.16667H4.16667C3.72464 9.16667 3.30072 8.99107 2.98816 8.67851C2.67559 8.36595 2.5 7.94203 2.5 7.5V4.16667C2.5 3.72464 2.67559 3.30072 2.98816 2.98816C3.30072 2.67559 3.72464 2.5 4.16667 2.5H7.5ZM15.8333 2.5C16.2754 2.5 16.6993 2.67559 17.0118 2.98816C17.3244 3.30072 17.5 3.72464 17.5 4.16667V7.5C17.5 7.94203 17.3244 8.36595 17.0118 8.67851C16.6993 8.99107 16.2754 9.16667 15.8333 9.16667H12.5C12.058 9.16667 11.634 8.99107 11.3215 8.67851C11.0089 8.36595 10.8333 7.94203 10.8333 7.5V4.16667C10.8333 3.72464 11.0089 3.30072 11.3215 2.98816C11.634 2.67559 12.058 2.5 12.5 2.5H15.8333Z";

const CHEVRON_RIGHT_PATH =
  "M13.0892 9.41083C13.2454 9.56711 13.3332 9.77903 13.3332 10C13.3332 10.221 13.2454 10.4329 13.0892 10.5892L8.375 15.3033C8.29813 15.3829 8.20617 15.4464 8.1045 15.4901C8.00283 15.5338 7.89348 15.5567 7.78283 15.5577C7.67218 15.5587 7.56245 15.5376 7.46004 15.4957C7.35762 15.4538 7.26458 15.3919 7.18634 15.3137C7.10809 15.2354 7.04622 15.1424 7.00431 15.04C6.96241 14.9375 6.94133 14.8278 6.94229 14.7172C6.94325 14.6065 6.96624 14.4972 7.00992 14.3955C7.05359 14.2938 7.11707 14.2019 7.19667 14.125L11.3217 10L7.19667 5.875C7.04487 5.71783 6.96087 5.50733 6.96277 5.28883C6.96467 5.07033 7.05231 4.86132 7.20682 4.70682C7.36132 4.55231 7.57033 4.46467 7.78883 4.46277C8.00733 4.46087 8.21783 4.54487 8.375 4.69667L13.0892 9.41083Z";

// ─── Icon components ──────────────────────────────────────────────────────────

function RowIcon({ path, bg, evenodd = true }: { path: string; bg: string; evenodd?: boolean }) {
  return (
    <View style={[styles.iconContainer, { backgroundColor: bg }]}>
      <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
        <Path
          clipRule={evenodd ? "evenodd" : "nonzero"}
          d={path}
          fill="#fff"
          fillRule={evenodd ? "evenodd" : "nonzero"}
        />
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

function BackChevron() {
  return (
    <Svg fill="none" height={20} style={{ transform: [{ scaleX: -1 }] }} viewBox="0 0 20 20" width={20}>
      <Path
        clipRule="evenodd"
        d={CHEVRON_RIGHT_PATH}
        fill={figmaColors.grayNeutral["500"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PersonalizationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hapticEnabled, setHapticEnabled] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.backButton}>
          <BackChevron />
        </Pressable>
        <Text style={styles.title}>Personalization</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Rows */}
      <View style={styles.content}>
        {/* App Theme */}
        <Pressable
          android_ripple={{ color: figmaColors.grayNeutral["100"] }}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <RowIcon bg={figmaColors.blue["500"]} path={PALETTE_PATH} />
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
          <RowIcon bg={figmaColors.warning["500"]} evenodd={false} path={COIN_PATH} />
          <Text style={styles.label}>App Icon</Text>
          <ChevronRight />
        </Pressable>

        {/* Haptic Feedback */}
        <View style={styles.row}>
          <RowIcon bg={figmaColors.success["500"]} path={GRID_PATH} />
          <Text style={styles.label}>Haptic Feedback</Text>
          <Switch
            ios_backgroundColor={figmaColors.grayNeutral["200"]}
            onValueChange={setHapticEnabled}
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
    </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  title: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
  },
  rowPressed: {
    backgroundColor: figmaColors.grayNeutral["50"],
  },
  iconContainer: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  label: {
    color: figmaColors.grayNeutral["800"],
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.18,
    lineHeight: 24,
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
