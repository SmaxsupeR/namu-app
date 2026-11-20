// Grammar reference list and the conjugation table.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getDictionary } from '../dict';
import { conjugate, type Conjugation, type FormId, type WordKind } from '../grammar/conjugate';
import { FORM_LABEL, FORM_TOPIC, IRREGULAR_LABEL } from '../grammar/labels';
import { kindOf } from '../grammar/lookupKind';
import { GROUPS, TOPICS, type GrammarTopic } from '../grammar/topics';
import { speakKorean } from '../services/speech';
import { Body, Card, Chip, Field, Icon, IconBtn, Row } from './components';
import { useT } from './i18n';
import { radius, space, useTheme } from './theme';

export function GrammarList() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
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
              <TopicRow key={x.id} topic={x} onPress={() => router.push(`/grammar/${x.id}`)} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function TopicRow({ topic, onPress }: { topic: GrammarTopic; onPress: () => void }) {
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
      {topic.drill ? <Icon name="pencil-box-outline" color={t.primary} /> : null}
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
