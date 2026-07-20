import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { figmaColors } from "@/constants/colors";
import { EmojiPickerSheet } from "@/components/EmojiPickerSheet";
import { COLOR_PALETTE, type Category } from "@/constants/categories";
import { fontFamily } from "@/constants/typography";
import { useCategoriesStore } from "@/stores/categories";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseCategory = Category;

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ITEM_HEIGHT = 56;

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        clipRule="evenodd"
        d="M6.2253 4.81108C5.83477 4.42056 5.20161 4.42056 4.81108 4.81108C4.42056 5.20161 4.42056 5.83477 4.81108 6.2253L10.5858 12L4.81114 17.7747C4.42062 18.1652 4.42062 18.7984 4.81114 19.1889C5.20167 19.5794 5.83483 19.5794 6.22535 19.1889L12 13.4142L17.7747 19.1889C18.1652 19.5794 18.7984 19.5794 19.1889 19.1889C19.5794 18.7984 19.5794 18.1652 19.1889 17.7747L13.4142 12L19.189 6.2253C19.5795 5.83477 19.5795 5.20161 19.189 4.81108C18.7985 4.42056 18.1653 4.42056 17.7748 4.81108L12 10.5858L6.2253 4.81108Z"
        fill={figmaColors.grayNeutral["950"]}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M12 5v14M5 12h14"
        stroke={figmaColors.grayNeutral["600"]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function MinusCircleIcon() {
  return (
    <Svg fill="none" height={22} viewBox="0 0 24 24" width={22}>
      <Circle cx={12} cy={12} fill="#ef4444" r={10} />
      <Path
        d="M8 12h8"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function DragHandleIcon() {
  const fill = figmaColors.grayNeutral["400"];
  return (
    <Svg fill="none" height={20} viewBox="0 0 20 20" width={20}>
      <Circle cx={7} cy={5} fill={fill} r={1.5} />
      <Circle cx={13} cy={5} fill={fill} r={1.5} />
      <Circle cx={7} cy={10} fill={fill} r={1.5} />
      <Circle cx={13} cy={10} fill={fill} r={1.5} />
      <Circle cx={7} cy={15} fill={fill} r={1.5} />
      <Circle cx={13} cy={15} fill={fill} r={1.5} />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M14.28 2a2 2 0 0 1 1.897 1.368L16.72 5H20a1 1 0 1 1 0 2l-.003.071-.867 12.143A3 3 0 0 1 16.138 22H7.862a3 3 0 0 1-2.992-2.786L4.003 7.07A1.01 1.01 0 0 1 4 7a1 1 0 0 1 0-2h3.28l.543-1.632A2 2 0 0 1 9.721 2zM9 10a1 1 0 0 0-.993.883L8 11v6a1 1 0 0 0 1.993.117L10 17v-6a1 1 0 0 0-1-1m6 0a1 1 0 0 0-1 1v6a1 1 0 1 0 2 0v-6a1 1 0 0 0-1-1m-.72-6H9.72l-.333 1h5.226z"
        fill="#EF4444"
      />
    </Svg>
  );
}

function CheckmarkIcon() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M5 13l4 4L19 7"
        stroke={figmaColors.base.white}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}

function NewCategoryEmptyIcon({ color = figmaColors.base.white }: { color?: string }) {
  return (
    <Svg fill="none" height={32} viewBox="0 0 32 32" width={32}>
      <Path
        clipRule="evenodd"
        d="M22.667 4C24.4351 4 26.1308 4.70238 27.381 5.95262C28.6313 7.20286 29.3337 8.89856 29.3337 10.6667V21.3333C29.3337 23.1014 28.6313 24.7971 27.381 26.0474C26.1308 27.2976 24.4351 28 22.667 28H4.00033C3.6467 28 3.30756 27.8595 3.05752 27.6095C2.80747 27.3594 2.66699 27.0203 2.66699 26.6667V10.6667C2.66699 8.89856 3.36937 7.20286 4.61961 5.95262C5.86986 4.70238 7.56555 4 9.33366 4H22.667ZM12.0003 13.3333C11.6737 13.3334 11.3585 13.4533 11.1145 13.6703C10.8704 13.8873 10.7145 14.1863 10.6763 14.5107L10.667 14.6667V17.3333C10.6674 17.6732 10.7975 18 11.0308 18.2472C11.2641 18.4943 11.5829 18.643 11.9222 18.6629C12.2614 18.6828 12.5955 18.5724 12.8561 18.3543C13.1167 18.1362 13.2842 17.8268 13.3243 17.4893L13.3337 17.3333V14.6667C13.3337 14.313 13.1932 13.9739 12.9431 13.7239C12.6931 13.4738 12.3539 13.3333 12.0003 13.3333ZM20.0003 13.3333C19.6467 13.3333 19.3076 13.4738 19.0575 13.7239C18.8075 13.9739 18.667 14.313 18.667 14.6667V17.3333C18.667 17.687 18.8075 18.0261 19.0575 18.2761C19.3076 18.5262 19.6467 18.6667 20.0003 18.6667C20.3539 18.6667 20.6931 18.5262 20.9431 18.2761C21.1932 18.0261 21.3337 17.687 21.3337 17.3333V14.6667C21.3337 14.313 21.1932 13.9739 20.9431 13.7239C20.6931 13.4738 20.3539 13.3333 20.0003 13.3333Z"
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}

// ─── EditRow ──────────────────────────────────────────────────────────────────

function EditRow({
  category,
  color,
  isDragging,
  onDelete,
  onDragEnd,
  onDragMove,
  onDragStart,
  onEdit,
  shift,
}: {
  category: ExpenseCategory;
  color: string;
  isDragging: boolean;
  onDelete: () => void;
  onDragEnd: (dy: number) => void;
  onDragMove: (dy: number) => void;
  onDragStart: () => void;
  onEdit?: () => void;
  shift: number;
}) {
  const shiftAnim = useRef(new Animated.Value(0)).current;
  const dragTranslate = useRef(new Animated.Value(0)).current;
  const translateY = useRef(Animated.add(shiftAnim, dragTranslate)).current;

  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    Animated.spring(shiftAnim, {
      bounciness: 0,
      speed: 20,
      toValue: shift,
      useNativeDriver: false,
    }).start();
  }, [shift, shiftAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragTranslate.setValue(0);
        onDragStartRef.current();
      },
      onPanResponderMove: (_, gs) => {
        dragTranslate.setValue(gs.dy);
        onDragMoveRef.current(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        dragTranslate.setValue(0);
        onDragEndRef.current(gs.dy);
      },
      onPanResponderTerminate: (_, gs) => {
        dragTranslate.setValue(0);
        onDragEndRef.current(gs?.dy ?? 0);
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.editRow,
        isDragging && styles.editRowDragging,
        {
          transform: [{ translateY }],
          zIndex: isDragging ? 10 : 0,
        },
      ]}
    >
      <Pressable
        accessibilityLabel={`Delete ${category.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDelete}
      >
        <MinusCircleIcon />
      </Pressable>
      <Pressable
        accessibilityLabel={`Edit ${category.name}`}
        accessibilityRole="button"
        onPress={onEdit}
        style={styles.editRowTextArea}
      >
        <Text numberOfLines={1} style={styles.editRowText}>
          {category.emoji} {category.name}
        </Text>
      </Pressable>
      <View style={styles.editRowRight}>
        <View style={[styles.colorChip, { backgroundColor: color }]} />
        <View {...panResponder.panHandlers}>
          <DragHandleIcon />
        </View>
      </View>
    </Animated.View>
  );
}

// ─── NewCategorySheet ─────────────────────────────────────────────────────────

function NewCategorySheet({
  initialColor,
  initialEmoji,
  initialName,
  onClose,
  onDelete,
  onSave,
  visible,
}: {
  initialColor?: string;
  initialEmoji?: string;
  initialName?: string;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (category: ExpenseCategory, color: string) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [emoji, setEmoji] = useState("");
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[6]);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  const initialEmojiRef = useRef(initialEmoji);
  const initialNameRef = useRef(initialName);
  const initialColorRef = useRef(initialColor);
  initialEmojiRef.current = initialEmoji;
  initialNameRef.current = initialName;
  initialColorRef.current = initialColor;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { duration: 220, toValue: 600, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }, [backdropOpacity, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      setEmoji(initialEmojiRef.current ?? "");
      setName(initialNameRef.current ?? "");
      setSelectedColor(initialColorRef.current ?? COLOR_PALETTE[6]);
      setIsColorPickerOpen(false);
      setIsEmojiPickerOpen(true);
      translateY.setValue(500);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: 300, toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
      ]).start();
    } else {
      backdropOpacity.setValue(0);
      translateY.setValue(500);
    }
  }, [backdropOpacity, translateY, visible]);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        toValue: isEmojiPickerOpen ? 0 : 1,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        toValue: isEmojiPickerOpen ? 0.96 : 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentScale, isEmojiPickerOpen]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave({ emoji: emoji || "📦", name: trimmedName }, selectedColor ?? "#6b7280");
    closeSheet();
  }, [closeSheet, emoji, name, onSave, selectedColor]);

  return (
    <Modal animationType="none" onRequestClose={closeSheet} transparent visible={visible}>
      <Animated.View
        pointerEvents={isEmojiPickerOpen ? "none" : "auto"}
        style={{ flex: 1, opacity: contentOpacity, transform: [{ scale: contentScale }] }}
      >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.categorySheetRoot}
      >
        <Animated.View style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={styles.categorySheetContainer}>
          <Animated.View
            style={[
              styles.newCategorySheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>Expense Category</Text>
              <View style={styles.categorySheetHeaderActions}>
                {onDelete && (
                  <Pressable
                    accessibilityLabel="Delete category"
                    accessibilityRole="button"
                    onPress={() => { onDelete(); closeSheet(); }}
                    style={[styles.categoryHeaderButton, styles.categoryHeaderButtonDanger]}
                  >
                    <TrashIcon />
                  </Pressable>
                )}
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={closeSheet}
                  style={styles.categoryHeaderButton}
                >
                  <CloseIcon />
                </Pressable>
              </View>
            </View>

            <View style={styles.categoryDivider} />

            {isColorPickerOpen ? (
              <View style={styles.colorPickerPanel}>
                {[0, 1, 2, 3].map((rowIdx) => (
                  <View key={rowIdx} style={styles.colorPickerRow}>
                    {COLOR_PALETTE.slice(rowIdx * 6, rowIdx * 6 + 6).map((color) => (
                      <Pressable
                        key={color}
                        accessibilityLabel={`Select color ${color}`}
                        accessibilityRole="button"
                        onPress={() => { setSelectedColor(color); setIsColorPickerOpen(false); }}
                        style={[styles.colorSwatch, { backgroundColor: color }]}
                      >
                        {selectedColor === color && <CheckmarkIcon />}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.newCategoryEmojiSection}>
                <Pressable
                  accessibilityLabel="Pick emoji"
                  accessibilityRole="button"
                  onPress={() => setIsEmojiPickerOpen(true)}
                  style={[styles.emojiPreviewBox, { backgroundColor: selectedColor }]}
                >
                  {emoji ? (
                    <Text style={styles.emojiPreviewText}>{emoji}</Text>
                  ) : (
                    <NewCategoryEmptyIcon />
                  )}
                </Pressable>
              </View>
            )}

            <View style={styles.newCategoryNameRow}>
              <Pressable
                accessibilityLabel="Change category color"
                accessibilityRole="button"
                onPress={() => setIsColorPickerOpen((v) => !v)}
                style={[styles.newCategoryColorChip, { backgroundColor: selectedColor }]}
              />
              <TextInput
                ref={nameInputRef}
                onChangeText={setName}
                placeholder="Category Name"
                placeholderTextColor={figmaColors.grayNeutral["400"]}
                returnKeyType="done"
                style={styles.newCategoryNameInput}
                value={name}
              />
              <Pressable
                accessibilityLabel="Save category"
                accessibilityRole="button"
                disabled={!name.trim()}
                onPress={handleSave}
                style={[
                  styles.newCategorySaveButton,
                  !name.trim() && styles.newCategorySaveButtonDisabled,
                ]}
              >
                <CheckmarkIcon />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      </Animated.View>
      <EmojiPickerSheet
        visible={isEmojiPickerOpen}
        onSelect={(e) => {
          setEmoji(e);
          setTimeout(() => nameInputRef.current?.focus(), 350);
        }}
        onClose={() => setIsEmojiPickerOpen(false)}
      />
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExpenseCategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    expenseCategories: storeCategories,
    categoryColors,
    addCategory,
    deleteCategory,
    updateCategory,
    reorderCategories,
  } = useCategoriesStore();

  const [localCategories, setLocalCategories] = useState<ExpenseCategory[]>(
    () => [...storeCategories],
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [snapTarget, setSnapTarget] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const snapTargetRef = useRef<number | null>(null);
  const localLengthRef = useRef(localCategories.length);
  localLengthRef.current = localCategories.length;

  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    category: ExpenseCategory;
    color: string;
  } | null>(null);

  useEffect(() => {
    setLocalCategories([...storeCategories]);
  }, [storeCategories]);

  // Sheet open animation
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

  const handleDelete = useCallback((name: string) => {
    deleteCategory("expense", name);
    setLocalCategories((prev) => prev.filter((c) => c.name !== name));
  }, [deleteCategory]);

  const handleAddCategory = useCallback((category: ExpenseCategory, color: string) => {
    addCategory("expense", category, color);
    setLocalCategories((prev) => [...prev, category]);
  }, [addCategory]);

  const handleUpdateCategory = useCallback((newCategory: ExpenseCategory, color: string) => {
    const oldName = editingCategory?.category.name;
    if (!oldName) return;
    updateCategory("expense", oldName, newCategory, color);
    setLocalCategories((prev) => prev.map((c) => (c.name === oldName ? newCategory : c)));
    setEditingCategory(null);
  }, [editingCategory, updateCategory]);

  const handleDeleteEditingCategory = useCallback(() => {
    if (!editingCategory) return;
    deleteCategory("expense", editingCategory.category.name);
    setLocalCategories((prev) =>
      prev.filter((c) => c.name !== editingCategory.category.name),
    );
    setEditingCategory(null);
  }, [deleteCategory, editingCategory]);

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
    snapTargetRef.current = index;
    setDragIndex(index);
    setSnapTarget(index);
  }, []);

  const handleDragMove = useCallback((dy: number) => {
    if (dragIndexRef.current === null) return;
    const to = Math.max(
      0,
      Math.min(
        localLengthRef.current - 1,
        dragIndexRef.current + Math.round(dy / CATEGORY_ITEM_HEIGHT),
      ),
    );
    if (to !== snapTargetRef.current) {
      snapTargetRef.current = to;
      setSnapTarget(to);
    }
  }, []);

  const handleDragEnd = useCallback((dy: number) => {
    const from = dragIndexRef.current;
    if (from === null) return;
    dragIndexRef.current = null;
    snapTargetRef.current = null;
    setDragIndex(null);
    setSnapTarget(null);
    setLocalCategories((prev) => {
      const to = Math.max(
        0,
        Math.min(prev.length - 1, from + Math.round(dy / CATEGORY_ITEM_HEIGHT)),
      );
      if (to === from) return prev;
      reorderCategories("expense", from, to);
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, [reorderCategories]);

  const isChildSheetOpen = isNewCategoryOpen || editingCategory !== null;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        toValue: isChildSheetOpen ? 0 : 1,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        toValue: isChildSheetOpen ? 0.96 : 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentScale, isChildSheetOpen]);

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents={isChildSheetOpen ? "none" : "auto"}
        style={[
          styles.root,
          { opacity: contentOpacity, transform: [{ scale: contentScale }] },
        ]}
      >
      {/* Backdrop */}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.categorySheetBackdrop, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.categorySheet,
          { paddingBottom: Math.max(insets.bottom, 16) },
          { transform: [{ translateY }] },
        ]}
      >
        {/* Header */}
        <View style={styles.categorySheetHeader}>
          <Text style={styles.categorySheetTitle}>Expense Categories</Text>
          <View style={styles.categorySheetHeaderActions}>
            <Pressable
              accessibilityLabel="Add new category"
              accessibilityRole="button"
              onPress={() => setIsNewCategoryOpen(true)}
              style={styles.categoryHeaderButton}
            >
              <PlusIcon />
            </Pressable>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={closeSheet}
              style={styles.categoryHeaderButton}
            >
              <CloseIcon />
            </Pressable>
          </View>
        </View>

        <View style={styles.categoryDivider} />

        {/* Edit list — always in edit mode */}
        <ScrollView
          contentContainerStyle={styles.categoryList}
          scrollEnabled={dragIndex === null}
          showsVerticalScrollIndicator={false}
        >
          {localCategories.map((category, index) => {
            const isDragging = index === dragIndex;
            let shift = 0;
            if (dragIndex !== null && snapTarget !== null) {
              if (dragIndex < snapTarget && index > dragIndex && index <= snapTarget) {
                shift = -CATEGORY_ITEM_HEIGHT;
              } else if (dragIndex > snapTarget && index < dragIndex && index >= snapTarget) {
                shift = CATEGORY_ITEM_HEIGHT;
              }
            }
            return (
              <EditRow
                category={category}
                color={categoryColors[category.name] ?? figmaColors.grayNeutral["400"]}
                isDragging={isDragging}
                key={category.name}
                onDelete={() => handleDelete(category.name)}
                onDragEnd={handleDragEnd}
                onDragMove={handleDragMove}
                onDragStart={() => handleDragStart(index)}
                onEdit={() => {
                  const color = categoryColors[category.name] ?? figmaColors.grayNeutral["400"];
                  setEditingCategory({ category, color });
                }}
                shift={shift}
              />
            );
          })}
        </ScrollView>
      </Animated.View>
      </Animated.View>

      {/* Add / Edit sheet */}
      <NewCategorySheet
        initialColor={editingCategory?.color}
        initialEmoji={editingCategory?.category.emoji}
        initialName={editingCategory?.category.name}
        onClose={() => {
          setIsNewCategoryOpen(false);
          setEditingCategory(null);
        }}
        onDelete={editingCategory ? handleDeleteEditingCategory : undefined}
        onSave={editingCategory ? handleUpdateCategory : handleAddCategory}
        visible={isChildSheetOpen}
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
  categorySheetRoot: {
    flex: 1,
  },
  categorySheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: figmaColors.base.overlay,
  },
  categorySheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  categorySheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  categorySheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  categorySheetTitle: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  categorySheetHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  categoryHeaderButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  categoryHeaderButtonDanger: {
    backgroundColor: "#FECACA",
  },
  categoryDivider: {
    backgroundColor: figmaColors.grayNeutral["200"],
    height: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  categoryList: {
    paddingBottom: 8,
  },
  editRow: {
    alignItems: "center",
    backgroundColor: figmaColors.base.white,
    borderBottomColor: figmaColors.grayNeutral["200"],
    borderBottomWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
  },
  editRowDragging: {
    borderRadius: 12,
    elevation: 12,
    shadowColor: figmaColors.base.black,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  editRowTextArea: {
    flex: 1,
  },
  editRowText: {
    color: figmaColors.grayNeutral["900"],
    fontFamily: fontFamily.medium,
    fontSize: 17,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  editRowRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  colorChip: {
    borderRadius: 8,
    height: 32,
    width: 32,
  },
  newCategorySheet: {
    backgroundColor: figmaColors.base.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  newCategoryEmojiSection: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emojiPreviewBox: {
    alignItems: "center",
    borderRadius: 20,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  emojiPreviewText: {
    fontSize: 44,
    lineHeight: 52,
  },
  newCategoryNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  newCategoryColorChip: {
    borderRadius: 12,
    height: 48,
    width: 48,
  },
  newCategoryNameInput: {
    backgroundColor: figmaColors.grayNeutral["100"],
    borderRadius: 12,
    color: figmaColors.grayNeutral["900"],
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    height: 48,
    paddingHorizontal: 14,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  newCategorySaveButton: {
    alignItems: "center",
    backgroundColor: figmaColors.grayNeutral["900"],
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  newCategorySaveButtonDisabled: {
    backgroundColor: figmaColors.grayNeutral["300"],
  },
  colorPickerPanel: {
    alignSelf: "flex-start",
    backgroundColor: figmaColors.base.white,
    borderRadius: 8,
    boxShadow:
      "0px 17px 38px 0px rgba(24,24,27,0.10), 0px 68px 68px 0px rgba(24,24,27,0.09), 0px 154px 92px 0px rgba(24,24,27,0.05), 0px 273px 109px 0px rgba(24,24,27,0.01), 0px 426px 119px 0px rgba(24,24,27,0.00)",
    gap: 6,
    padding: 8,
  },
  colorPickerRow: {
    flexDirection: "row",
    gap: 8,
  },
  colorSwatch: {
    alignItems: "center",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
