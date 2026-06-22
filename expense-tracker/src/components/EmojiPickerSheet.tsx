import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { figmaColors } from "@/constants/colors";
import { fontFamily } from "@/constants/typography";
import {
  ALL_EMOJIS,
  EMOJI_CATEGORIES,
  type EmojiItem,
} from "@/src/data/emoji-data";
import { useEmojiStore } from "@/stores/emoji";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.80;
const HORIZONTAL_PADDING = 16;
const EMOJI_CELL_SIZE = 44;
const NUM_COLS = Math.floor((SCREEN_WIDTH - HORIZONTAL_PADDING * 2) / EMOJI_CELL_SIZE);
const DISMISS_THRESHOLD = 80;
const DISMISS_VELOCITY = 800;
const MIN_THUMB_HEIGHT = 40;

type EmojiPickerSheetProps = {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

function chunkIntoRows(emojis: EmojiItem[], cols: number): EmojiItem[][] {
  const rows: EmojiItem[][] = [];
  for (let i = 0; i < emojis.length; i += cols) {
    rows.push(emojis.slice(i, i + cols));
  }
  return rows;
}

function CloseIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M15 5L5 15M5 5l10 10"
        stroke={figmaColors.grayNeutral["900"]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM16 16l-3.5-3.5"
        stroke={figmaColors.grayNeutral["400"]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ClearIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d="M12 4L4 12M4 4l8 8"
        stroke={figmaColors.grayNeutral["500"]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type SectionData = {
  title: string;
  key: string;
  data: EmojiItem[][];
};

export function EmojiPickerSheet({ visible, onSelect, onClose }: EmojiPickerSheetProps) {
  const { recentEmojis, addRecentEmoji } = useEmojiStore();

  const [query, setQuery] = useState("");
  const [activeCategoryKey, setActiveCategoryKey] = useState("smileys");

  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isAtTopRef = useRef(true);

  // Scrollbar shared values
  const thumbHeight = useSharedValue(MIN_THUMB_HEIGHT);
  const thumbOffset = useSharedValue(0);
  const showScrollbar = useSharedValue(0);

  const sectionListRef = useRef<SectionList<EmojiItem[], SectionData>>(null);
  const categoryNavRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  const openAnimation = useCallback(() => {
    translateY.value = withSpring(0, { damping: 30, stiffness: 280, mass: 0.8 });
    Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [translateY, backdropOpacity]);

  const closeWithAnimation = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, { duration: 220 });
    setTimeout(() => {
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start(() => onClose());
    }, 60);
  }, [translateY, backdropOpacity, onClose]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setActiveCategoryKey("smileys");
      isAtTopRef.current = true;
      translateY.value = SHEET_HEIGHT;
      backdropOpacity.setValue(0);
      openAnimation();
    } else {
      backdropOpacity.setValue(0);
      translateY.value = SHEET_HEIGHT;
    }
  }, [visible, openAnimation, translateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isAtTopRef.current && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (
        isAtTopRef.current &&
        (event.translationY > DISMISS_THRESHOLD ||
          event.velocityY > DISMISS_VELOCITY)
      ) {
        runOnJS(closeWithAnimation)();
      } else {
        translateY.value = withSpring(0, { damping: 30, stiffness: 280, mass: 0.8 });
      }
    });

  const sections: SectionData[] = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const filtered = ALL_EMOJIS.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.keywords.some((k) => k.toLowerCase().includes(q)),
      );
      return [
        {
          title: "Search Results",
          key: "search",
          data: chunkIntoRows(filtered, NUM_COLS),
        },
      ];
    }

    const result: SectionData[] = [];
    if (recentEmojis.length > 0) {
      const recentItems = recentEmojis
        .map((e, idx) => ({
          id: `recent-${idx}`,
          emoji: e,
          name: e,
          keywords: ["recent"],
        }))
        .slice(0, 24);
      result.push({
        title: "Recently Used",
        key: "recent",
        data: chunkIntoRows(recentItems, NUM_COLS),
      });
    }

    for (const cat of EMOJI_CATEGORIES) {
      result.push({
        title: cat.title,
        key: cat.key,
        data: chunkIntoRows(cat.emojis, NUM_COLS),
      });
    }
    return result;
  }, [query, recentEmojis]);

  const handleSelectEmoji = useCallback(
    (item: EmojiItem) => {
      addRecentEmoji(item.emoji);
      onSelect(item.emoji);
      closeWithAnimation();
    },
    [addRecentEmoji, onSelect, closeWithAnimation],
  );

  const handleCategoryPress = useCallback(
    (key: string) => {
      setActiveCategoryKey(key);
      setQuery("");
      const sectionIndex = sections.findIndex((s) => s.key === key);
      if (sectionIndex >= 0) {
        sectionListRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          viewOffset: 0,
          animated: true,
        });
      }
    },
    [sections],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    height: thumbHeight.value,
    transform: [{ translateY: thumbOffset.value }],
    opacity: showScrollbar.value,
  }));

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionData }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.title.toUpperCase()}</Text>
      </View>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: EmojiItem[] }) => (
      <View style={styles.emojiRow}>
        {item.map((emojiItem) => (
          <Pressable
            key={emojiItem.id}
            accessibilityLabel={`Select ${emojiItem.name} emoji`}
            accessibilityRole="button"
            onPress={() => handleSelectEmoji(emojiItem)}
            style={({ pressed }) => [
              styles.emojiCell,
              pressed && styles.emojiCellPressed,
            ]}
          >
            <Text style={styles.emojiText}>{emojiItem.emoji}</Text>
          </Pressable>
        ))}
      </View>
    ),
    [handleSelectEmoji],
  );

  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      isAtTopRef.current = contentOffset.y <= 0;

      const viewportH = layoutMeasurement.height;
      const contentH = contentSize.height;

      if (contentH <= viewportH) {
        showScrollbar.value = 0;
        return;
      }

      showScrollbar.value = 1;
      const ratio = viewportH / contentH;
      const computedThumb = Math.max(viewportH * ratio, MIN_THUMB_HEIGHT);
      thumbHeight.value = computedThumb;

      const scrollRange = contentH - viewportH;
      const thumbRange = viewportH - computedThumb;
      thumbOffset.value = (contentOffset.y / scrollRange) * thumbRange;
    },
    [showScrollbar, thumbHeight, thumbOffset],
  );

  const isSearching = query.trim().length > 0;
  const searchResults = isSearching ? sections[0]?.data ?? [] : [];
  const hasNoResults = isSearching && searchResults.length === 0;

  return (
    <Modal
      animationType="none"
      transparent
      visible={visible}
      onRequestClose={closeWithAnimation}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Backdrop */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="auto"
        >
          <Pressable
            accessibilityLabel="Close emoji picker"
            accessibilityRole="button"
            onPress={closeWithAnimation}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Sheet container */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.sheetContainer}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={[styles.sheet, sheetAnimatedStyle]}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Emoji</Text>
                <Pressable
                  accessibilityLabel="Close emoji picker"
                  accessibilityRole="button"
                  onPress={closeWithAnimation}
                  style={styles.closeButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Search */}
              <View style={styles.searchContainer}>
                <View style={styles.searchIcon}>
                  <SearchIcon />
                </View>
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search emoji"
                  placeholderTextColor={figmaColors.grayNeutral["400"]}
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {query.length > 0 && (
                  <Pressable
                    accessibilityLabel="Clear search"
                    accessibilityRole="button"
                    onPress={() => setQuery("")}
                    style={styles.clearButton}
                  >
                    <ClearIcon />
                  </Pressable>
                )}
              </View>

              {/* Category nav */}
              {!isSearching && (
                <ScrollView
                  ref={categoryNavRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryNav}
                  contentContainerStyle={styles.categoryNavContent}
                >
                  {EMOJI_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat.key}
                      accessibilityLabel={`${cat.title} category`}
                      accessibilityRole="button"
                      onPress={() => handleCategoryPress(cat.key)}
                      style={[
                        styles.categoryNavItem,
                        activeCategoryKey === cat.key && styles.categoryNavItemActive,
                      ]}
                    >
                      <Text style={styles.categoryNavIcon}>{cat.icon}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* Divider below category nav */}
              {!isSearching && <View style={styles.divider} />}

              {/* Emoji list with custom scrollbar */}
              <View style={styles.listContainer}>
                {hasNoResults ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>No emoji found</Text>
                    <Text style={styles.emptyStateSubtitle}>Try another search</Text>
                  </View>
                ) : (
                  <SectionList<EmojiItem[], SectionData>
                    ref={sectionListRef}
                    sections={sections}
                    keyExtractor={(_item, index) => String(index)}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    showsVerticalScrollIndicator={false}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    onScrollBeginDrag={() => Keyboard.dismiss()}
                    stickySectionHeadersEnabled={false}
                    contentContainerStyle={styles.listContent}
                    onViewableItemsChanged={({ viewableItems }) => {
                      if (viewableItems.length > 0 && !isSearching) {
                        const firstSection = viewableItems[0]?.section as SectionData | undefined;
                        if (firstSection?.key && firstSection.key !== "recent") {
                          setActiveCategoryKey(firstSection.key);
                        }
                      }
                    }}
                  />
                )}

                {/* Custom scrollbar */}
                <View style={styles.scrollTrack} pointerEvents="none">
                  <Reanimated.View style={[styles.scrollThumb, thumbAnimatedStyle]} />
                </View>
              </View>
            </Reanimated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: figmaColors.base.overlay,
  },
  sheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: figmaColors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: SHEET_HEIGHT,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 20,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  divider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  searchContainer: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    flexDirection: "row",
    marginHorizontal: HORIZONTAL_PADDING,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearButton: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    marginLeft: 8,
    width: 24,
  },
  categoryNav: {
    maxHeight: 48,
  },
  categoryNavContent: {
    alignItems: "center",
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: 4,
  },
  categoryNavItem: {
    alignItems: "center",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 6,
    width: 40,
  },
  categoryNavItemActive: {
    backgroundColor: figmaColors.grayNeutral["100"],
  },
  categoryNavIcon: {
    fontSize: 22,
  },
  listContainer: {
    flex: 1,
    flexDirection: "row",
  },
  listContent: {
    paddingBottom: 16,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  sectionHeader: {
    paddingBottom: 6,
    paddingTop: 14,
  },
  sectionHeaderText: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  emojiRow: {
    flexDirection: "row",
  },
  emojiCell: {
    alignItems: "center",
    height: EMOJI_CELL_SIZE,
    justifyContent: "center",
    width: EMOJI_CELL_SIZE,
    borderRadius: 10,
  },
  emojiCellPressed: {
    opacity: 0.5,
    backgroundColor: figmaColors.grayNeutral["100"],
  },
  emojiText: {
    fontSize: 28,
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 40,
  },
  emptyStateTitle: {
    color: figmaColors.grayNeutral["500"],
    fontFamily: fontFamily.medium,
    fontSize: 16,
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    color: figmaColors.grayNeutral["400"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  scrollTrack: {
    position: "absolute",
    right: 2,
    top: 0,
    bottom: 0,
    width: 3,
  },
  scrollThumb: {
    backgroundColor: figmaColors.grayNeutral["300"],
    borderRadius: 2,
    width: 3,
  },
});
