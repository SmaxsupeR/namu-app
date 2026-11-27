// The frame of every exercise: close and progress on top, the question in the middle, the
// answer action pinned at the bottom above the keyboard and the safe area. No tab bar here:
// study routes live outside the tabs.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bar, IconBtn } from './components';
import { Text } from './Text';
import { space, type as typeScale, useTheme } from './theme';

export function StudyShell({
  progress,
  onClose,
  closeLabel,
  title,
  badge,
  children,
  footer,
}: {
  /** 0..1 */
  progress: number;
  onClose: () => void;
  closeLabel: string;
  /** What to do, e.g. "Type the translation". */
  title?: string;
  /** Short context, e.g. "Review" or "Free practice". */
  badge?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <IconBtn name="x" label={closeLabel} onPress={onClose} />
        <View style={styles.flex}>
          <Bar value={progress} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {title || badge ? (
          <View style={styles.titleRow}>
            {title ? (
              <Text variant="section" accessibilityRole="header" style={styles.center}>
                {title}
              </Text>
            ) : null}
            {badge ? <Text style={[typeScale.caption, { color: t.textDim }]}>{badge}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingRight: space.lg },
  body: { flexGrow: 1, justifyContent: 'center', padding: space.lg, gap: space.lg },
  titleRow: { alignItems: 'center', gap: space.xs },
  center: { textAlign: 'center' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
});
