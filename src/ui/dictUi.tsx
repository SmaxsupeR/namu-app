// Building blocks of the dictionary tab and the word page.
import { useEffect, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { WORD_TYPES, type WordType } from '../core/wordTypes';
import { POS_RU, type DictFilter, type DictWord } from '../dict/lookup';
import { subjectName, topicName, TOP_TOPICS, TOPIC_RU as TOPIC_SUBS } from '../dict/topics';
import { cancelFullDict, downloadFullDict, fullDictSupported, refreshDictPack, useDictPack } from '../state/dictPack';
import { Bar, Body, Btn, Card, Chip, Icon } from './components';
import { useT, type StringKey } from './i18n';
import { space, useTheme } from './theme';

export const TYPE_LABEL: Record<WordType, StringKey> = {
  noun: 'typeNoun',
  verb: 'typeVerb',
  adjective: 'typeAdjective',
  adverb: 'typeAdverb',
  determiner: 'typeDeterminer',
  interjection: 'typeInterjection',
  expression: 'typeExpression',
  grammar: 'typeGrammar',
  other: 'typeOther',
};
export const LEVEL_LABEL: Record<number, StringKey> = { 1: 'levelBeginner', 2: 'levelIntermediate', 3: 'levelAdvanced' };

const mb = (b: number) => Math.round(b / 1048576);

/** Offer to download the full dictionary (Android), or its progress. */
export function FullDictCard({ compact = false }: { compact?: boolean }) {
  const t = useTheme();
  const tr = useT();
  const { edition, offer, progress, busy, error } = useDictPack();
  useEffect(() => {
    refreshDictPack();
  }, []);
  if (!fullDictSupported || edition === 'full' || edition === null) return null;
  const ask = () =>
    Alert.alert(tr('fullDictTitle'), tr('fullDictConsent', { mb: offer ? mb(offer.size) : '≈25', disk: offer ? mb(offer.unpackedSize) : '≈70' }), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('voiceDownload'), onPress: () => downloadFullDict() },
    ]);
  return (
    <Card>
      <Text style={[styles.cardTitle, { color: t.text }]}>{tr('fullDictTitle')}</Text>
      {!compact ? <Body dim>{tr('fullDictText')}</Body> : null}
      {busy ? (
        <>
          <Body>{progress?.phase === 'unpack' ? tr('fullDictUnpacking') : tr('voiceProgress', { done: mb(progress?.done ?? 0), total: mb(progress?.total ?? offer?.size ?? 0) })}</Body>
          <Bar value={progress && progress.total ? progress.done / progress.total : 0} />
          <Btn kind="soft" small icon="close" title={tr('cancel')} onPress={cancelFullDict} />
        </>
      ) : (
        <Btn kind="soft" icon="download" title={offer ? tr('voiceDownloadSize', { mb: mb(offer.size) }) : tr('voiceDownload')} onPress={ask} />
      )}
      {error ? <Body style={{ color: t.danger }}>{error === 'cancelled' ? tr('voiceCancelled') : error === 'no_space' ? tr('voiceErrSpace') : error === 'corrupt' ? tr('voiceErrCorrupt') : tr('voiceErrNetwork')}</Body> : null}
    </Card>
  );
}

/** One line of a result list: word, type and level, first translations. */
export function WordRow({ word, onPress }: { word: DictWord; onPress: () => void }) {
  const t = useTheme();
  const tr = useT();
  const meta = [POS_RU[word.pos] ?? (word.unit !== 'word' ? tr('typeExpression') : ''), word.level ? tr(LEVEL_LABEL[word.level]) : ''].filter(Boolean).join(' · ');
  const senses = [...word.senses].sort((a, b) => Number(b.matched) - Number(a.matched) || a.n - b.n);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${word.word}: ${senses[0]?.ru ?? ''}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfaceAlt : t.surface, borderColor: t.border }]}>
      <View style={styles.flex}>
        <Text style={[styles.word, { color: t.text }]}>
          {word.word}
          {word.hom > 0 ? <Text style={[styles.hom, { color: t.textDim }]}> {word.hom}</Text> : null}
          {word.origin && /[㐀-鿿]/.test(word.origin) ? <Text style={[styles.hanja, { color: t.textDim }]}>  {word.origin}</Text> : null}
        </Text>
        <Text style={[styles.tr, { color: t.text }]} numberOfLines={2}>
          {senses
            .slice(0, 3)
            .map((s) => s.ru)
            .join(' · ')}
        </Text>
        {meta ? <Text style={[styles.meta, { color: t.textDim }]}>{meta}</Text> : null}
      </View>
      <Icon name="chevron-right" color={t.textDim} />
    </Pressable>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Filters of the dictionary tab: word type, level, topic (two levels) and learner situation. */
export function FilterPanel({ filter, onChange, subjects }: { filter: DictFilter; onChange: (f: DictFilter) => void; subjects: string[] }) {
  const tr = useT();
  const t = useTheme();
  const label = [styles.label, { color: t.textDim }];
  const top = filter.topic?.split(' > ')[0];
  const subtopics = top ? Object.keys(TOPIC_SUBS).filter((k) => k.startsWith(`${top} > `)) : [];
  const set = (patch: Partial<DictFilter>) => onChange({ ...filter, ...patch });
  return (
    <View style={styles.panel}>
      <Text style={label}>{tr('filterType')}</Text>
      <ChipRow>
        <Chip label={tr('all')} active={!filter.type} onPress={() => set({ type: undefined })} />
        {WORD_TYPES.filter((x) => x !== 'other').map((x) => (
          <Chip key={x} label={tr(TYPE_LABEL[x])} active={filter.type === x} onPress={() => set({ type: filter.type === x ? undefined : x })} />
        ))}
      </ChipRow>
      <Text style={label}>{tr('filterLevel')}</Text>
      <ChipRow>
        <Chip label={tr('all')} active={filter.level === undefined} onPress={() => set({ level: undefined })} />
        {[1, 2, 3].map((l) => (
          <Chip key={l} label={tr(LEVEL_LABEL[l])} active={filter.level === l} onPress={() => set({ level: filter.level === l ? undefined : l })} />
        ))}
      </ChipRow>
      <Text style={label}>{tr('filterTopic')}</Text>
      <ChipRow>
        <Chip label={tr('all')} active={!filter.topic} onPress={() => set({ topic: undefined })} />
        {TOP_TOPICS.map((x) => (
          <Chip key={x} label={topicName(x)} active={top === x} onPress={() => set({ topic: top === x ? undefined : x })} />
        ))}
      </ChipRow>
      {subtopics.length ? (
        <ChipRow>
          {subtopics.map((x) => (
            <Chip key={x} label={topicName(x)} active={filter.topic === x} onPress={() => set({ topic: filter.topic === x ? top : x })} />
          ))}
        </ChipRow>
      ) : null}
      {subjects.length ? (
        <>
          <Text style={label}>{tr('filterSituation')}</Text>
          <ChipRow>
            <Chip label={tr('all')} active={!filter.subject} onPress={() => set({ subject: undefined })} />
            {subjects.map((x) => (
              <Chip key={x} label={subjectName(x)} active={filter.subject === x} onPress={() => set({ subject: filter.subject === x ? undefined : x })} />
            ))}
          </ChipRow>
        </>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 16, borderWidth: 1 },
  word: { fontSize: 20, fontWeight: '700' },
  hom: { fontSize: 13, fontWeight: '400' },
  hanja: { fontSize: 14, fontWeight: '400' },
  tr: { fontSize: 15, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 2 },
  panel: { gap: space.xs },
  label: { fontSize: 12, fontWeight: '700', marginTop: space.xs, textTransform: 'uppercase' },
  chipRow: { gap: space.sm, paddingVertical: 2 },
});
