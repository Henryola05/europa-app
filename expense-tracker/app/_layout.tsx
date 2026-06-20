import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { fontFamily } from "@/constants/typography";

const openRundeFonts = {
  [fontFamily.regular]: require("../assets/fonts/OpenRunde-Regular.otf"),
  [fontFamily.medium]: require("../assets/fonts/OpenRunde-Medium.otf"),
  [fontFamily.semiBold]: require("../assets/fonts/OpenRunde-Semibold.otf"),
  [fontFamily.bold]: require("../assets/fonts/OpenRunde-Bold.otf"),
} as const;

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts(openRundeFonts);

  const handleRootLayout = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView onLayout={handleRootLayout} style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
