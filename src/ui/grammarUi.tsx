// Grammar reference list and the conjugation table.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { getDictionary } from '../dict';
import { conjugate, type Conjugation, type FormId, type WordKind } from '../grammar/conjugate';
import { FORM_LABEL, FORM_TOPIC, IRREGULAR_LABEL } from '../grammar/labels';
import { kindOf } from '../grammar/lookupKind';
import { GROUPS, TOPICS, type GrammarTopic } from '../grammar/topics';
import { dueGrammarTopics, getGrammarCards, type GrammarCard } from '../db/grammar';
import { speakKorean } from '../services/speech';
import { Body, Btn, Card, Chip, Field, Icon, IconBtn, Row } from './components';
import { useInterval, useT } from './i18n';
import { useLoad } from './useLoad';
import { radius, space, useTheme } from './theme';

const DRILLABLE = TOPICS.filter((x) => x.drill).map((x) => x.id);

/** Grammar review state: cards by topic and the topics due now. */
export function useGrammarReview(): { cards: Map<string, GrammarCard>; due: string[] } | undefined {
  return useLoad(async (db) => ({ cards: await getGrammarCards(db), due: await dueGrammarTopics(db, Date.now(), DRILLABLE) })).data;
}

/** Status line of one topic: not practised yet, due, or when it comes back. */
export function GrammarStatus({ card }: { card: GrammarCard | undefined }) {
  const t = useTheme();
  const tr = useT();
  const interval = useInterval();
  const now = Date.now();
  if (!card) return <Body dim>{tr('grammarStatusNew')}</Body>;
  if (card.due <= now) return <Body style={{ color: t.warn }}>{tr('grammarStatusDue')}</Body>;
  return <Body dim>{tr('grammarStatusNext', { t: interval(card.due - now) })}</Body>;
}

/** "Grammar to review: N" with a button; nothing when nothing is due. */
export function GrammarDueCard() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const g = useGrammarReview();
  if (!g || g.due.length === 0) return null;
  return (
    <Card>
      <Text style={[styles.dueLabel, { color: t.textDim }]}>{tr('grammarDueTitle')}</Text>
      <Text style={[styles.dueCount, { color: t.text }]}>{tr('grammarDueCount', { n: g.due.length })}</Text>
      <Btn small icon="school-outline" title={tr('grammarStartReview')} onPress={() => router.push('/grammar-drill?review=1')} />
    </Card>
  );
}

export function GrammarList() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const review = useGrammarReview();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<1 | 2 | null>(null);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      TOPICS.filter((x) => (level === null || x.level === level) && (q === '' || `${x.title} ${x.pattern} ${x.summary}`.toLowerCase().includes(q))),
    [q, level],
  );
  return (
    <View style={styles.gap}>
      <GrammarDueCard />
      <Field value={query} onChangeText={setQuery} placeholder={tr('grammarSearch')} autoCorrect={false} autoCapitalize="none" accessibilityLabel={tr('grammarSearch')} />
      <Row style={styles.wrap}>
        <Chip label={tr('all')} active={level === null} onPress={() => setLevel(null)} />
        <Chip label={tr('levelBeginner')} active={level === 1} onPress={() => setLevel(1)} />
        <Chip label={tr('levelIntermediate')} active={level === 2} onPress={() => setLevel(2)} />
      </Row>
      {shown.length === 0 ? <Body dim>{tr('nothingFound')}</Body> : null}
      {GROUPS.map((g) => {
        const items = shown.filter((x) => x.group === g.id);
        if (items.length === 0) return null;
        return (
          <View key={g.id} style={styles.gap}>
            <Text style={[styles.section, { color: t.textDim }]}>{g.title}</Text>
            {items.map((x) => (
              <TopicRow key={x.id} topic={x} due={!!review?.due.includes(x.id)} onPress={() => router.push(`/grammar/${x.id}`)} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function TopicRow({ topic, due, onPress }: { topic: GrammarTopic; due: boolean; onPress: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={topic.title}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfaceAlt : t.surface, borderColor: t.border }]}>
      <View style={styles.flex}>
        <Text style={[styles.pattern, { color: t.primary }]}>{topic.pattern}</Text>
        <Text style={[styles.title, { color: t.text }]}>{topic.title}</Text>
        <Text style={[styles.summary, { color: t.textDim }]} numberOfLines={2}>
          {topic.summary}
        </Text>
      </View>
      {topic.drill ? <Icon name={due ? 'clock-alert-outline' : 'pencil-box-outline'} color={due ? t.warn : t.primary} /> : null}
      {topic.level === 2 ? <Text style={[styles.badge, { color: t.textDim, borderColor: t.border }]}>{tr('levelIntermediate')}</Text> : null}
      <Icon name="chevron-right" color={t.textDim} />
    </Pressable>
  );
}

/** All forms of one word, each with a listen button and a link to the topic that explains it. */
export function ConjugationTable({ c, only }: { c: Conjugation; only?: FormId[] }) {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const forms = only ? c.forms.filter((f) => only.includes(f.id)) : c.forms;
  return (
    <View style={styles.gap}>
      <Body dim>{IRREGULAR_LABEL[c.irregular]}</Body>
      {forms.map((f) => (
        <Row key={f.id} style={[styles.formRow, { borderBottomColor: t.border }]}>
          <Pressable style={styles.flex} disabled={!FORM_TOPIC[f.id]} onPress={() => router.push(`/grammar/${FORM_TOPIC[f.id]}`)} accessibilityRole={FORM_TOPIC[f.id] ? 'link' : undefined}>
            <Text style={[styles.formLabel, { color: t.textDim }]}>{FORM_LABEL[f.id]}</Text>
            <Text style={[styles.formText, { color: t.text }]}>{f.text}</Text>
            {f.note ? <Text style={[styles.formLabel, { color: t.info }]}>{tr('honorificNote', { form: f.note })}</Text> : null}
          </Pressable>
          <IconBtn name="volume-medium" label={tr('listen')} color={t.primary} size={22} onPress={() => speakKorean(f.text)} />
        </Row>
      ))}
    </View>
  );
}

/** Type a verb or adjective, see every form. Verb or adjective is taken from the dictionary when it knows the word. */
export function Conjugator({ initial = '', initialKind }: { initial?: string; initialKind?: WordKind }) {
  const t = useTheme();
  const tr = useT();
  const [word, setWord] = useState(initial);
  const [kind, setKind] = useState<WordKind>(initialKind ?? 'verb');
  const [auto, setAuto] = useState(!initialKind);
  const [nounHada, setNounHada] = useState(false);
  const w = word.trim();

  useEffect(() => {
    if (!/^[가-힣]+다$/.test(w)) return;
    let alive = true;
    getDictionary()
      .then((db) => kindOf(db, w))
      .then((r) => {
        if (!alive) return;
        if (auto && r.kind) setKind(r.kind);
        setNounHada(r.nounHada);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [w, auto]);

  const c = w ? conjugate(w, kind, { nounHada }) : null;
  return (
    <View style={styles.gap}>
      <Field
        value={word}
        onChangeText={(v) => {
          setWord(v);
          setAuto(true);
        }}
        placeholder="가다, 먹다, 덥다…"
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
        accessibilityLabel={tr('conjugateInput')}
      />
      <Row style={styles.wrap}>
        <Chip label={tr('typeVerbOne')} active={kind === 'verb'} onPress={() => (setKind('verb'), setAuto(false))} />
        <Chip label={tr('typeAdjectiveOne')} active={kind === 'adjective'} onPress={() => (setKind('adjective'), setAuto(false))} />
      </Row>
      {w === '' ? <Body dim>{tr('conjugateHint')}</Body> : null}
      {w !== '' && !c ? <Body dim>{tr('conjugateNeedDa')}</Body> : null}
      {c ? (
        <Card>
          <ConjugationTable c={c} />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dueLabel: { fontSize: 13, fontWeight: '600' },
  dueCount: { fontSize: 18, fontWeight: '700', marginBottom: space.sm },
  gap: { gap: space.sm },
  wrap: { flexWrap: 'wrap', gap: space.sm },
  section: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  pattern: { fontSize: 15, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  summary: { fontSize: 13, marginTop: 2 },
  badge: { fontSize: 11, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  formRow: { alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  formLabel: { fontSize: 12 },
  formText: { fontSize: 18, fontWeight: '600', marginTop: 1 },
  input: { fontSize: 20 },
});
