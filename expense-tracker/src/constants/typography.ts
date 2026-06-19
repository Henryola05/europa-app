import type { TextStyle } from "react-native";

export const fontFamily = {
  regular: "OpenRunde-Regular",
  medium: "OpenRunde-Medium",
  bold: "OpenRunde-Bold",
} as const;

export const typography = {
  titleH1: {
    fontFamily: fontFamily.medium,
    fontSize: 56,
    letterSpacing: -0.56,
  },
  titleH2: {
    fontFamily: fontFamily.medium,
    fontSize: 48,
    letterSpacing: -0.48,
  },
  titleH3: {
    fontFamily: fontFamily.medium,
    fontSize: 40,
    letterSpacing: -0.4,
  },
  titleH4: {
    fontFamily: fontFamily.medium,
    fontSize: 32,
    letterSpacing: -0.16,
  },
  titleH5: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    letterSpacing: 0,
  },
  titleH6: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    letterSpacing: 0,
  },

  labelXLarge: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    letterSpacing: -0.36,
  },
  labelLarge: {
    fontFamily: fontFamily.medium,
    fontSize: 18,
    letterSpacing: -0.27,
  },
  labelMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.18,
  },
  labelSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: -0.08,
  },
  labelXSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0,
  },

  paragraphXLarge: {
    fontFamily: fontFamily.regular,
    fontSize: 24,
    letterSpacing: -0.36,
  },
  paragraphLarge: {
    fontFamily: fontFamily.regular,
    fontSize: 18,
    letterSpacing: -0.27,
  },
  paragraphMedium: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: -0.18,
  },
  paragraphSmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    letterSpacing: -0.08,
  },
  paragraphXSmall: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    letterSpacing: 0,
  },

  subheadingMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: 0.96,
    textTransform: "uppercase",
  },
  subheadingSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0.84,
    textTransform: "uppercase",
  },
  subheadingXSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0.48,
    textTransform: "uppercase",
  },
  subheading2XSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.22,
    textTransform: "uppercase",
  },
} as const satisfies Record<string, TextStyle>;

export type FontFamily = keyof typeof fontFamily;
export type TypographyToken = keyof typeof typography;
