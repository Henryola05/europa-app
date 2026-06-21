import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";

const APP_VERSION = "1.17.0";

type SettingsItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  onPress?: () => void;
};

const SETTINGS_ITEMS: SettingsItem[] = [
  { label: "Personalization", icon: "color-palette-outline", bg: figmaColors.blue["500"] },
  { label: "Currency & Preferences", icon: "pie-chart-outline", bg: figmaColors.orange["500"] },
  { label: "Categories & Alerts", icon: "grid-outline", bg: figmaColors.success["500"] },
  { label: "Security", icon: "lock-closed-outline", bg: figmaColors.violet["500"] },
  { label: "Data Management", icon: "layers-outline", bg: figmaColors.teal["500"] },
  { label: "Help & Feedback", icon: "chatbubbles-outline", bg: figmaColors.pink["500"] },
  { label: "Rate & Share", icon: "share-social-outline", bg: figmaColors.yellow["400"] },
  { label: "Legal", icon: "document-text-outline", bg: figmaColors.orange["400"] },
];

type Tab = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const TABS: Tab[] = [
  { label: "Home", icon: "home-outline", activeIcon: "home", route: "/" },
  { label: "Budget", icon: "pie-chart-outline", activeIcon: "pie-chart", route: "/budgets" },
  { label: "Insights", icon: "bar-chart-outline", activeIcon: "bar-chart", route: "/insights" },
  { label: "Accounts", icon: "wallet-outline", activeIcon: "wallet", route: "/accounts" },
  { label: "Settings", icon: "settings-outline", activeIcon: "settings", route: "/settings" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        {/* Pro banner */}
        <View style={styles.proBanner}>
          <View style={styles.proGlobeRow}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={[styles.proGlobe, { opacity: 0.18 + (i % 3) * 0.06 }]} />
            ))}
          </View>
          <View style={styles.proGlobeRowBottom}>
            {[...Array(5)].map((_, i) => (
              <View key={i} style={[styles.proGlobeSmall, { opacity: 0.12 + (i % 3) * 0.06 }]} />
            ))}
          </View>
          <View style={styles.proStarIcon}>
            <Ionicons color="#fff" name="sparkles" size={22} />
          </View>
          <View style={styles.proTextRow}>
            <View>
              <Text style={styles.proTierLabel}>Free</Text>
              <Text style={styles.proTierSub}>Current Tier</Text>
            </View>
            <Pressable style={styles.upgradeButton}>
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </Pressable>
          </View>
        </View>

        {/* Menu items */}
        <View style={styles.menuCard}>
          {SETTINGS_ITEMS.map((item, index) => (
            <View key={item.label}>
              <Pressable
                android_ripple={{ color: figmaColors.grayNeutral["100"] }}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed && styles.menuRowPressed,
                ]}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                  <Ionicons color="#fff" name={item.icon} size={20} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons
                  color={figmaColors.grayNeutral["300"]}
                  name="chevron-forward"
                  size={18}
                />
              </Pressable>
              {index < SETTINGS_ITEMS.length - 1 && (
                <View style={styles.menuDivider} />
              )}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>Version {APP_VERSION}</Text>
          </View>
          <Text style={styles.footerText}>
            Made with {""}
            <Text style={styles.heartText}>❤️</Text>
            {" by "}
            <Text
              onPress={() => Linking.openURL("https://x.com/la__tide").catch(() => {})}
              style={styles.footerName}
            >
              Olatide
            </Text>
            {" from 🇳🇬"}
          </Text>
        </View>
      </ScrollView>

      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        {TABS.map((tab) => {
          const isActive = tab.label === "Settings";
          return (
            <Pressable
              key={tab.label}
              onPress={() => {
                if (!isActive) router.push(tab.route as never);
              }}
              style={styles.tabItem}
            >
              <Ionicons
                color={isActive ? figmaColors.blue["500"] : figmaColors.grayNeutral["400"]}
                name={isActive ? tab.activeIcon : tab.icon}
                size={26}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: figmaColors.bg,
    flex: 1,
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.3,
  },

  /* Pro banner */
  proBanner: {
    backgroundColor: figmaColors.blue["500"],
    borderRadius: 20,
    height: 140,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  proGlobeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: -12,
    justifyContent: "flex-end",
    position: "absolute",
    right: -8,
    top: -20,
  },
  proGlobe: {
    borderColor: "#fff",
    borderRadius: 44,
    borderWidth: 12,
    height: 88,
    width: 88,
  },
  proGlobeRowBottom: {
    alignItems: "center",
    flexDirection: "row",
    gap: -8,
    position: "absolute",
    right: 40,
    top: 52,
  },
  proGlobeSmall: {
    borderColor: "#fff",
    borderRadius: 36,
    borderWidth: 10,
    height: 72,
    width: 72,
  },
  proStarIcon: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 24,
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  proTextRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  proTierLabel: {
    color: "#fff",
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  proTierSub: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: "#fff",
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  upgradeButtonText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },

  /* Menu */
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },
  menuRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowPressed: {
    backgroundColor: figmaColors.grayNeutral["50"],
  },
  menuIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  menuLabel: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.1,
  },
  menuDivider: {
    backgroundColor: figmaColors.grayNeutral["100"],
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
  },

  /* Footer */
  footer: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  versionBadge: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  versionText: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  footerText: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: "center",
  },
  heartText: {
    fontSize: 14,
  },
  footerName: {
    color: figmaColors.grayNeutral["700"],
    fontFamily: fontFamily.bold,
  },

  /* Tab bar */
  tabBar: {
    alignItems: "center",
    backgroundColor: figmaColors.bg,
    borderTopColor: figmaColors.grayNeutral["100"],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingTop: 12,
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    height: 44,
    justifyContent: "center",
    minWidth: 0,
  },
  tabLabel: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
    textAlign: "center",
  },
  tabLabelActive: {
    color: figmaColors.blue["500"],
  },
});
