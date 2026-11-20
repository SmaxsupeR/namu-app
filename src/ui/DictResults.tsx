// Dictionary search results on the "new word" screen: tap a meaning to fill the form.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { POS_RU, type DictSense, type DictWord } from '../dict/lookup';
import { Card, Icon, IconBtn, Row } from './components';
import { useT, type StringKey } from './i18n';
import { radius, space, useTheme } from './theme';

const LEVEL: Record<number, StringKey> = {
  1: 'levelBeginner',
  2: 'levelIntermediate',
  3: 'levelAdvanced',
};

export function DictResultCard({
  word,
  have,
  onPick,
  onSpeak,
}: {
  word: DictWord;
  /** The word is already in the user's dictionary. */
  have: boolean;
  onPick: (word: DictWord, sense: DictSense) => void;
  onSpeak: (text: string) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const meta = [POS_RU[word.pos] ?? '', word.level ? tr(LEVEL[word.level]) : '', word.origin ?? ''].filter(Boolean).join(' · ');
  // A Russian search shows the matching meanings first.
  const senses = [...word.senses].sort((a, b) => Number(b.matched) - Number(a.matched) || a.n - b.n);
  return (
    <Card style={styles.card}>
      <Row style={styles.head}>
        <View style={styles.flex}>
          <Text style={[styles.word, { color: t.text }]}>
            {word.word}
            {word.hom > 0 ? <Text style={[styles.hom, { color: t.textDim }]}> {word.hom}</Text> : null}
          </Text>
          {meta ? <Text style={[styles.meta, { color: t.textDim }]}>{meta}</Text> : null}
        </View>
        {have ? (
          <View style={[styles.badge, { backgroundColor: t.primarySoft }]}>
            <Text style={{ color: t.primary, fontSize: 12, fontWeight: '600' }}>{tr('alreadyAdded')}</Text>
          </View>
        ) : null}
        <IconBtn name="volume-high" label={tr('listen')} color={t.primary} onPress={() => onSpeak(word.word.replace(/^-|-$/g, ''))} />
      </Row>
      {senses.slice(0, 6).map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onPick(word, s)}
          accessibilityRole="button"
          accessibilityLabel={`${word.word}: ${s.ru}`}
          accessibilityHint={tr('pickMeaningHint')}
          style={({ pressed }) => [
            styles.sense,
            {
              borderColor: s.matched ? t.primary : t.border,
              backgroundColor: pressed ? t.primarySoft : t.surface,
            },
          ]}
        >
          <View style={styles.flex}>
            <Text style={[styles.ru, { color: t.text }]}>{s.ru}</Text>
            {s.ruDef ? (
              <Text style={[styles.def, { color: t.textDim }]} numberOfLines={2}>
                {s.ruDef}
              </Text>
            ) : null}
          </View>
          <Icon name="plus-circle-outline" color={t.primary} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: space.sm },
  head: { alignItems: 'flex-start' },
  word: { fontSize: 24, fontWeight: '700' },
  hom: { fontSize: 14, fontWeight: '400' },
  meta: { fontSize: 13, marginTop: 2 },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    marginTop: 6,
  },
  sense: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
  },
  ru: { fontSize: 16, fontWeight: '600' },
  def: { fontSize: 13, marginTop: 2 },
});
