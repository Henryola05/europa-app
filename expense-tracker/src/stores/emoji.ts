import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const MAX_RECENT = 24;

type EmojiState = {
  recentEmojis: string[];
  addRecentEmoji: (emoji: string) => void;
};

export const useEmojiStore = create<EmojiState>()(
  persist(
    (set) => ({
      recentEmojis: [],

      addRecentEmoji: (emoji: string) => {
        set((state) => {
          const filtered = state.recentEmojis.filter((e) => e !== emoji);
          return { recentEmojis: [emoji, ...filtered].slice(0, MAX_RECENT) };
        });
      },
    }),
    {
      name: "europa:recent-emojis",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
