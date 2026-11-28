// The main Korean word or phrase of an exercise. Size by length (koreanSize); a very long word
// is made smaller to fit the width on one line instead of breaking between syllables.
import {
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { koreanSize } from "./koreanSize";
import { Text } from "./Text";
import { keepWords, koreanFont, space } from "./theme";

/** The system font scale is honoured up to this factor so a 56 sp word stays on screen. */
const MAX_SCALE = 1.6;

/**
 * Width comes from the window, not from measuring: the word sits in centred, content-sized
 * containers, and measuring those would shrink it step by step. `inset` is any padding of the
 * container besides the screen's own 16 dp on each side (e.g. a card).
 */
export function KoreanHero({
  text,
  style,
  inset = 0,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  inset?: number;
}) {
  const win = useWindowDimensions();
  const width = win.width - 2 * space.lg - 2 * inset;
  const scale = Math.min(win.fontScale || 1, MAX_SCALE);
  const phrase = /\s/.test(text.trim());
  return (
    <Text
      style={[
        koreanSize(text, width, scale),
        { fontFamily: koreanFont },
        phrase ? keepWords : null,
        styles.center,
        style,
      ]}
      maxFontSizeMultiplier={MAX_SCALE}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
});
