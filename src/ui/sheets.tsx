// Panels over the screen: a bottom sheet for secondary choices and filters, and a dialog
// to confirm destructive actions (also on the web, where the system Alert shows nothing).
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Row } from './components';
import { Text } from './Text';
import { radius, space, type as typeScale, useTheme } from './theme';

/** True while the system asks to reduce motion (sheets then appear without sliding). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduced)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => sub?.remove();
  }, []);
  return reduced;
}

/** A sheet from the bottom edge. Closes on the scrim, Android back, or `onClose`. */
export function BottomSheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="×" />
        <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + space.md }]} accessibilityViewIsModal>
          <View style={[styles.handle, { backgroundColor: t.border }]} />
          {title ? (
            <Text variant="section" accessibilityRole="header" style={styles.sheetTitle}>
              {title}
            </Text>
          ) : null}
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Filters in one panel: change freely, then Apply; Reset clears them. */
export function FilterSheet({
  visible,
  onClose,
  title,
  children,
  applyLabel,
  resetLabel,
  onApply,
  onReset,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  applyLabel: string;
  resetLabel: string;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <Row>
          <Btn style={styles.flex} kind="ghost" title={resetLabel} onPress={onReset} />
          <Btn
            style={styles.flex}
            title={applyLabel}
            onPress={() => {
              onApply();
              onClose();
            }}
          />
        </Row>
      }>
      {children}
    </BottomSheet>
  );
}

/** Asks before something that cannot be undone. The confirm button names the action ("Delete"). */
export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.fill, styles.center, { backgroundColor: t.scrim }]}>
        <View style={[styles.dialog, { backgroundColor: t.surface }]} accessibilityViewIsModal accessibilityRole="alert">
          <Text variant="section">{title}</Text>
          {message ? <Text style={[typeScale.body, { color: t.textDim }]}>{message}</Text> : null}
          <Row style={styles.dialogActions}>
            <Btn small kind="ghost" title={cancelLabel} onPress={onCancel} />
            <Btn small kind={destructive ? 'danger' : 'primary'} title={confirmLabel} onPress={onConfirm} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  center: { justifyContent: 'center', alignItems: 'center', padding: space.xl },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '88%', paddingTop: space.sm },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space.sm },
  sheetTitle: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  sheetBody: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  sheetFooter: { paddingHorizontal: space.lg, paddingTop: space.sm },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  dialogActions: { justifyContent: 'flex-end', marginTop: space.sm },
});
