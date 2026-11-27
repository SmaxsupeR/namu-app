// Lists: rows on one surface separated by hairlines, instead of a card per item.
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { Mastery } from '../core/scheduler';
import { Icon, IconBtn, type IconName } from './components';
import { Text } from './Text';
import { radius, size, space, type as typeScale, useTheme } from './theme';

/** A group of rows on one surface, with dividers between them. */
export function ListGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, { backgroundColor: t.surface, borderColor: t.divider }]}>
      {items.map((child, i) => (
        <Fragment key={child.key ?? i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: t.divider }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * One row: optional leading icon, title, optional subtitle, and a trailing value, custom
 * element or chevron. The whole row is the touch target (at least 56 dp).
 */
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  value,
  trailing,
  chevron,
  onPress,
  onLongPress,
  accessibilityHint,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  /** Short current value on the right ("12 words", "On"). */
  value?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  const label = [title, subtitle, value].filter(Boolean).join('. ');
  const body = (
    <>
      {icon ? (
        <View style={styles.leading}>
          <Icon name={icon} color={iconColor ?? t.primary} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={typeScale.bodyStrong} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typeScale.secondary, { color: t.textDim }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typeScale.secondary, styles.value, { color: t.textDim }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ?? !!onPress ? <Icon name="chevron-right" size={20} color={t.textDim} /> : null}
    </>
  );
  if (!onPress && !onLongPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: t.ripple }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surfaceAlt }, disabled && { opacity: 0.45 }]}>
      {body}
    </Pressable>
  );
}

const MASTERY_COLOR = (t: ReturnType<typeof useTheme>, m: Mastery) => (m === 'stable' ? t.success : m === 'learning' ? t.info : t.textDim);

/**
 * A word in a list: Hangul, translation, optional romanization, how well it is known
 * (dot + words, never color alone) and its own listen button.
 */
export function WordRow({
  korean,
  translation,
  romanization,
  mastery,
  masteryLabel,
  onPress,
  onListen,
  listenLabel,
}: {
  korean: string;
  translation: string;
  romanization?: string | null;
  mastery?: Mastery;
  masteryLabel?: string;
  onPress?: () => void;
  onListen?: () => void;
  listenLabel?: string;
}) {
  const t = useTheme();
  const label = [korean, translation, masteryLabel].filter(Boolean).join('. ');
  return (
    <View style={styles.wordRow}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={label} android_ripple={{ color: t.ripple }} style={({ pressed }) => [styles.wordMain, pressed && { backgroundColor: t.surfaceAlt }]}>
        <View style={styles.wordTop}>
          <Text variant="korean" numberOfLines={1} style={styles.shrink}>
            {korean}
          </Text>
          {romanization ? (
            <Text style={[typeScale.secondary, styles.shrink, { color: t.textDim }]} numberOfLines={1}>
              {romanization}
            </Text>
          ) : null}
        </View>
        <Text style={[typeScale.body, { color: t.textDim }]} numberOfLines={2}>
          {translation}
        </Text>
        {mastery && masteryLabel ? (
          <View style={styles.mastery}>
            <View style={[styles.masteryDot, { backgroundColor: MASTERY_COLOR(t, mastery) }]} />
            <Text style={[typeScale.caption, { color: t.textDim }]}>{masteryLabel}</Text>
          </View>
        ) : null}
      </Pressable>
      {onListen ? <IconBtn name="volume-2" label={listenLabel ?? korean} color={t.primary} onPress={onListen} /> : null}
    </View>
  );
}

/** A setting: label, current value and a chevron (opens a choice), or a switch. */
export function SettingsRow({
  label,
  value,
  hint,
  onPress,
  toggle,
  onToggle,
}: {
  label: string;
  value?: string;
  hint?: string;
  onPress?: () => void;
  /** When set, the row is a switch. */
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
}) {
  const t = useTheme();
  if (toggle !== undefined) {
    return (
      <Pressable
        onPress={() => onToggle?.(!toggle)}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked: toggle }}
        android_ripple={{ color: t.ripple }}
        style={styles.row}>
        <View style={styles.texts}>
          <Text style={typeScale.body}>{label}</Text>
          {hint ? <Text style={[typeScale.secondary, { color: t.textDim }]}>{hint}</Text> : null}
        </View>
        <Switch value={toggle} onValueChange={onToggle} trackColor={{ true: t.primary, false: t.border }} thumbColor={t.surface} importantForAccessibility="no" />
      </Pressable>
    );
  }
  return <ListRow title={label} subtitle={hint} value={value} onPress={onPress} />;
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.row, paddingHorizontal: space.lg, paddingVertical: space.sm },
  leading: { width: 28, alignItems: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  value: { maxWidth: '45%', textAlign: 'right' },
  wordRow: { flexDirection: 'row', alignItems: 'center', paddingRight: space.xs },
  wordMain: { flex: 1, minWidth: 0, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2, minHeight: size.row },
  wordTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  shrink: { flexShrink: 1 },
  mastery: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  masteryDot: { width: 8, height: 8, borderRadius: 4 },
});
