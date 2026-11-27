// Shared building blocks. Colors, type and sizes come from theme.ts only; icons are Feather
// (one outline family, the design Lucide grew from). Every control is at least 48 dp.
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ComponentRef, ReactNode, Ref } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { fonts, radius, size, space, type as typeScale, useTheme } from './theme';

export type InputRef = ComponentRef<typeof TextInput>;
export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size: s = size.icon, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Feather name={name} size={s} color={color ?? t.text} />;
}

/** A screen: background, side insets, scrolling, keyboard avoidance and an optional pinned footer (the main action). */
export function Screen({ children, scroll = true, footer, top = false }: { children: ReactNode; scroll?: boolean; footer?: ReactNode; top?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const padTop = top ? insets.top + space.lg : space.lg;
  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: t.bg }]} behavior="padding">
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingTop: padTop, paddingBottom: footer ? space.lg : insets.bottom + space.xl }]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.content, { paddingTop: padTop }]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, backgroundColor: t.bg, borderTopColor: t.divider }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

/** Title row of a tab screen: the title and up to two icon actions on the right. */
export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.screenHeader}>
      <View style={styles.flexShrink}>
        <Text variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[typeScale.secondary, { color: t.textDim }]}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.row}>{actions}</View> : null}
    </View>
  );
}

/** A surface for content that belongs together. Use sparingly: lists are rows on one surface, not a card each. */
export function Card({ children, style, onPress, onLongPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; onLongPress?: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  const base = [styles.card, { backgroundColor: t.surface, borderColor: t.divider }, style];
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} android_ripple={{ color: t.ripple }} style={base} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  );
}

/** primary: the one main action; soft: a quieter filled action; ghost: text action; danger: destructive text action. */
type BtnKind = 'primary' | 'soft' | 'ghost' | 'danger';

export function Btn({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  small,
  style,
  hint,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  hint?: string;
}) {
  const t = useTheme();
  const bg = { primary: t.primary, soft: t.primarySoft, ghost: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: t.onPrimary, soft: t.primary, ghost: t.primary, danger: t.danger }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: t.ripple }}
      style={[styles.btn, small && styles.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, style]}>
      {icon ? <Feather name={icon} size={small ? size.iconSmall : 20} color={fg} /> : null}
      <View style={styles.center}>
        <Text style={[typeScale.button, small && styles.btnTextSmall, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        {hint ? <Text style={[styles.btnHint, { color: fg }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** The same button under the name the design system uses. */
export const Button = Btn;

export function IconBtn({ name, onPress, label, color, size: s = 22, disabled }: { name: IconName; onPress: () => void; label: string; color?: string; size?: number; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: t.ripple, borderless: true, radius: 24 }}
      style={[styles.iconBtn, disabled && { opacity: 0.4 }]}>
      <Feather name={name} size={s} color={color ?? t.text} />
    </Pressable>
  );
}

export const IconButton = IconBtn;

export function Field({ label, hint, right, style, ref, ...input }: TextInputProps & { label?: string; hint?: string; right?: ReactNode; ref?: Ref<InputRef> }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      {label ? <Text style={[typeScale.caption, { color: t.textDim }]}>{label}</Text> : null}
      <View style={[styles.inputRow, { backgroundColor: t.surface, borderColor: t.border }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={t.textDim}
          accessibilityLabel={input.accessibilityLabel ?? label ?? input.placeholder}
          {...input}
          style={[styles.input, { color: t.text }, input.multiline && styles.inputMultiline, style]}
        />
        {right}
      </View>
      {hint ? <Text style={[typeScale.secondary, { color: t.textDim }]}>{hint}</Text> : null}
    </View>
  );
}

/** Search box: icon, short placeholder, clear button, optional filter button that opens a FilterSheet. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  onFilter,
  filtersActive,
  autoFocus,
  ref,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  /** Shows a filter button; `filtersActive` marks it when filters are set. */
  onFilter?: () => void;
  filtersActive?: boolean;
  autoFocus?: boolean;
  ref?: Ref<InputRef>;
}) {
  const t = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Feather name="search" size={size.iconSmall} color={t.textDim} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textDim}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[styles.searchInput, { color: t.text }]}
      />
      {value !== '' ? <IconBtn name="x" label="×" color={t.textDim} size={18} onPress={() => onChangeText('')} /> : null}
      {onFilter ? (
        <View>
          <IconBtn name="sliders" label="Filters" color={filtersActive ? t.primary : t.textDim} size={20} onPress={onFilter} />
          {filtersActive ? <View style={[styles.dot, { backgroundColor: t.primary }]} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.chip, { backgroundColor: active ? t.primarySoft : 'transparent', borderColor: active ? t.primary : t.border }]}>
      {icon ? <Feather name={icon} size={16} color={active ? t.primary : t.textDim} /> : null}
      <Text style={[styles.chipText, { color: active ? t.primary : t.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One choice out of 2–4 options, e.g. "Words · Grammar · Conjugation". */
export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && [styles.segmentOn, { backgroundColor: t.surface, borderColor: t.border }]]}>
            <Text style={[typeScale.caption, { color: on ? t.text : t.textDim, fontWeight: on ? '600' : '500' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text variant="title" accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Small caption above a group of rows or controls. */
export function Section({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[typeScale.caption, styles.section, { color: t.textDim }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** A section heading (20 sp) with an optional text action on the right ("All"). */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text variant="section" accessibilityRole="header" style={styles.flexShrink}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={action} hitSlop={12} style={styles.sectionAction}>
          <Text style={[typeScale.secondary, { color: t.primary, fontWeight: '600' }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Body({ children, dim, style }: { children: ReactNode; dim?: boolean; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[typeScale.secondary, { color: dim ? t.textDim : t.text }, style]}>{children}</Text>;
}

/** Nothing here yet: what this place is for and the next step. */
export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={36} color={t.primary} />
      <Text variant="section" style={styles.centerText}>
        {title}
      </Text>
      {text ? <Text style={[typeScale.body, styles.centerText, { color: t.textDim }]}>{text}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export const EmptyState = Empty;

export function LoadingState({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.empty} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={t.primary} />
      {label ? <Text style={[typeScale.secondary, { color: t.textDim }]}>{label}</Text> : null}
    </View>
  );
}

/** Something failed: what happened in plain words, and a retry when trying again can help. */
export function ErrorState({ title, text, retryLabel, onRetry }: { title: string; text?: string; retryLabel?: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite">
      <Feather name="alert-circle" size={32} color={t.danger} />
      <Text variant="section" style={styles.centerText}>
        {title}
      </Text>
      {text ? <Text style={[typeScale.body, styles.centerText, { color: t.textDim }]}>{text}</Text> : null}
      {retryLabel && onRetry ? <Btn kind="soft" icon="rotate-ccw" title={retryLabel} onPress={onRetry} /> : null}
    </View>
  );
}

export function Bar({ value, color, label }: { value: number; color?: string; label?: string }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.bar, { backgroundColor: t.surfaceAlt }]} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color ?? t.primary }]} />
    </View>
  );
}

export const ProgressBar = Bar;

export function Fab({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: t.ripple }}
      style={[styles.fab, { backgroundColor: t.primary, bottom: insets.bottom + space.lg }]}>
      <Feather name={icon} size={20} color={t.onPrimary} />
      <Text style={[typeScale.button, { color: t.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { alignItems: 'center', flexShrink: 1 },
  centerText: { textAlign: 'center' },
  content: { paddingHorizontal: space.lg, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: size.touch },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm, overflow: 'hidden' },
  btn: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, overflow: 'hidden' },
  btnSmall: { minHeight: size.touch, paddingHorizontal: space.md },
  btnTextSmall: { fontSize: 15 },
  btnHint: { fontSize: 12, opacity: 0.8 },
  iconBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  field: { gap: space.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1 },
  input: { flex: 1, minWidth: 0, fontSize: 17, fontFamily: fonts.regular, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: size.touch + 4 },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  search: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, paddingLeft: space.md, minHeight: size.touch + 4 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: fonts.regular, paddingHorizontal: space.sm, paddingVertical: space.sm },
  dot: { position: 'absolute', top: 12, right: 12, width: 7, height: 7, borderRadius: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, maxWidth: 260 },
  chipText: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md - 3, paddingHorizontal: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  segmentOn: {},
  section: { marginTop: space.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.lg },
  sectionAction: { minHeight: size.touch, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyAction: { alignSelf: 'stretch', marginTop: space.sm },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  fab: { position: 'absolute', right: space.lg, minHeight: 52, borderRadius: radius.lg, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, elevation: 3, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
