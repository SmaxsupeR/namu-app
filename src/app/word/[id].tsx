// A word of the bundled dictionary: meanings, examples, forms, related words,
// and adding it to one of the user's dictionaries.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDb } from '../../db';
import { createEntry, duplicateKey, findDuplicates, listDictionaries, type DictionarySummary } from '../../db/repo';
import { dictionaryEdition, getDictionary, type Edition } from '../../dict';
import { findWordId, getWordDetail, POS_RU, translationOf, type DictExample, type DictWordDetail } from '../../dict/lookup';
import { subjectName, topicName } from '../../dict/topics';
import { prepareSpeech, speakKorean } from '../../services/speech';
import { useApp } from '../../state/store';
import { Body, Btn, Card, Chip, Icon, IconBtn, Row, Screen } from '../../ui/components';
import { FullDictCard, LEVEL_LABEL } from '../../ui/dictUi';
import { useT, type StringKey } from '../../ui/i18n';
import { radius, space, useTheme } from '../../ui/theme';

const RELATION_LABEL: Record<string, StringKey> = {
  synonym: 'relSynonym',
  antonym: 'relAntonym',
  derived: 'relDerived',
  see: 'relSee',
  short: 'relShort',
  full: 'relFull',
  honorific: 'relHonorific',
  humble: 'relHumble',
  small: 'relVariant',
  big: 'relVariant',
  soft: 'relVariant',
  strong: 'relVariant',
};
const SHOWN_EXAMPLES = 3;

export default function WordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const touch = useApp((s) => s.touch);
  const [word, setWord] = useState<DictWordDetail | null>(null);
  const [edition, setEdition] = useState<Edition>('compact');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [chosen, setChosen] = useState<number[]>([]);
  const [dicts, setDicts] = useState<DictionarySummary[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [have, setHave] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const db = await getDictionary();
      const w = await getWordDetail(db, Number(id));
      setWord(w);
      setEdition(await dictionaryEdition());
      if (w) setChosen(w.senses.length ? [w.senses[0].id] : []);
    })().catch(() => setWord(null));
  }, [id]);

  const speak = async (text: string) => {
    if (!(await speakKorean(text))) Alert.alert(tr('noVoiceTitle'), tr('noVoiceText'));
  };

  const openRelated = async (w: string, hom: number) => {
    const found = await findWordId(await getDictionary(), w, hom);
    if (found) router.push(`/word/${found}`);
    else Alert.alert(w, tr('relatedMissing'));
  };

  const startAdd = async () => {
    const db = await getDb();
    const list = await listDictionaries(db, Date.now());
    setDicts(list);
    setTarget(list[0]?.id ?? null);
    if (word) {
      const dup = new Set<string>();
      for (const d of list) if ((await findDuplicates(db, d.id, [headword(word)])).size) dup.add(d.id);
      setHave(dup);
    }
  };

  const add = async () => {
    if (!word || !target || chosen.length === 0) return;
    const senses = word.senses.filter((s) => chosen.includes(s.id));
    const example = senses.map((s) => word.examples.get(s.id)?.find((e) => e.kind === 1)?.lines[0] ?? s.example).find(Boolean) ?? '';
    try {
      await createEntry(await getDb(), target, {
        korean: headword(word),
        meanings: [translationOf(senses)],
        partOfSpeech: POS_RU[word.pos] ?? '',
        example,
        notes: word.origin && /[㐀-鿿]/.test(word.origin) ? tr('hanjaNote', { h: word.origin }) : '',
        tags: [],
      });
      touch();
      prepareSpeech([headword(word)], 2);
      setAdded(dicts?.find((d) => d.id === target)?.name ?? '');
      setDicts(null);
    } catch (e) {
      Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
    }
  };

  if (!word) return <Screen>{null}</Screen>;

  const meta = [POS_RU[word.pos] ?? '', word.level ? tr(LEVEL_LABEL[word.level]) : ''].filter(Boolean).join(' · ');
  const wordRelations = word.relations.filter((r) => r.senseId === null);

  const example = (e: DictExample, i: number) => (
    <View key={i} style={[styles.example, { borderLeftColor: e.kind === 2 ? t.info : t.primarySoft }]}>
      <View style={styles.flex}>
        {e.lines.map((line, j) => (
          <Text key={j} style={[styles.exampleText, { color: t.text }]}>
            {e.kind === 2 ? <Text style={{ color: t.textDim }}>{j % 2 === 0 ? 'A: ' : 'B: '}</Text> : null}
            {line}
          </Text>
        ))}
      </View>
      <IconBtn name="volume-medium" label={tr('listen')} color={t.textDim} size={20} onPress={() => speak(e.lines.join(' '))} />
    </View>
  );

  return (
    <Screen
      footer={
        added ? (
          <Btn kind="soft" icon="check" title={tr('addedTo', { name: added })} onPress={() => setAdded(null)} />
        ) : dicts ? (
          <Btn icon="plus" title={tr('addToDictionary')} disabled={!target || chosen.length === 0} onPress={add} />
        ) : (
          <Btn icon="plus" title={tr('addToMine')} onPress={startAdd} />
        )
      }>
      <Stack.Screen options={{ title: word.word }} />
      <Row style={styles.top}>
        <View style={styles.flex}>
          <Text style={[styles.word, { color: t.text }]}>
            {word.word}
            {word.hom > 0 ? <Text style={[styles.hom, { color: t.textDim }]}> {word.hom}</Text> : null}
          </Text>
          {word.pron ? <Text style={[styles.dim, { color: t.textDim }]}>[{word.pron}]</Text> : null}
          {word.origin ? <Text style={[styles.hanja, { color: t.text }]}>{word.origin}</Text> : null}
          {meta ? <Text style={[styles.dim, { color: t.textDim }]}>{meta}</Text> : null}
        </View>
        <IconBtn name="volume-high" label={tr('listen')} color={t.primary} size={30} onPress={() => speak(headword(word))} />
      </Row>
      {word.topic || word.subject ? (
        <View style={styles.chips}>
          {word.topic ? <Tag icon="shape-outline" text={topicName(word.topic)} /> : null}
          {word.subject ? <Tag icon="chat-outline" text={subjectName(word.subject)} /> : null}
        </View>
      ) : null}
      {word.note ? <Body dim>{word.note}</Body> : null}

      {dicts ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{tr('chooseMeanings')}</Text>
          <View style={styles.chips}>
            {word.senses.map((s) => (
              <Chip key={s.id} label={`${s.n}. ${s.ru.split(';')[0]}`} active={chosen.includes(s.id)} onPress={() => setChosen((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id]))} />
            ))}
          </View>
          <Text style={[styles.h, { color: t.text }]}>{tr('chooseDictionary')}</Text>
          {dicts.length === 0 ? <Body dim>{tr('noDictionaries')}</Body> : null}
          <View style={styles.chips}>
            {dicts.map((d) => (
              <Chip key={d.id} label={have.has(d.id) ? `${d.name} ✓` : d.name} active={target === d.id} onPress={() => setTarget(d.id)} />
            ))}
          </View>
          {target && have.has(target) ? <Body style={{ color: t.warn }}>{tr('duplicateWarning')}</Body> : null}
          <Btn kind="ghost" small title={tr('cancel')} onPress={() => setDicts(null)} />
        </Card>
      ) : null}

      {word.senses.map((s) => {
        const examples = word.examples.get(s.id) ?? (s.example ? [{ kind: 1 as const, lines: [s.example] }] : []);
        const shown = open.has(s.id) ? examples : examples.slice(0, SHOWN_EXAMPLES);
        const rel = word.relations.filter((r) => r.senseId === s.id);
        return (
          <Card key={s.id} style={styles.sense}>
            <Row style={styles.senseHead}>
              <View style={[styles.num, { backgroundColor: t.primarySoft }]}>
                <Text style={{ color: t.primary, fontWeight: '700' }}>{s.n}</Text>
              </View>
              <Text style={[styles.ru, { color: t.text }]}>{s.ru}</Text>
            </Row>
            {s.ruDef ? <Text style={[styles.def, { color: t.text }]}>{s.ruDef}</Text> : null}
            {s.koDef ? <Text style={[styles.def, { color: t.textDim }]}>{s.koDef}</Text> : null}
            {word.patterns.get(s.id) ? <Text style={[styles.pattern, { color: t.info }]}>{word.patterns.get(s.id)}</Text> : null}
            {shown.map(example)}
            {examples.length > SHOWN_EXAMPLES ? (
              <Btn
                kind="ghost"
                small
                icon={open.has(s.id) ? 'chevron-up' : 'chevron-down'}
                title={open.has(s.id) ? tr('less') : tr('moreExamples', { n: examples.length - SHOWN_EXAMPLES })}
                onPress={() => setOpen((o) => new Set(o.has(s.id) ? [...o].filter((x) => x !== s.id) : [...o, s.id]))}
              />
            ) : null}
            {rel.length ? <Relations list={rel} onOpen={openRelated} /> : null}
          </Card>
        );
      })}

      {word.forms.length ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{tr('forms')}</Text>
          <View style={styles.chips}>
            {word.forms.map((f, i) => (
              <Pressable key={i} onPress={() => speak(f.form)} accessibilityRole="button" style={[styles.form, { borderColor: t.border }]}>
                <Text style={{ color: t.text, fontSize: 16 }}>{f.form}</Text>
                {f.pron ? <Text style={{ color: t.textDim, fontSize: 12 }}>[{f.pron}]</Text> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
      {wordRelations.length ? (
        <Card>
          <Relations list={wordRelations} onOpen={openRelated} />
        </Card>
      ) : null}
      {edition === 'compact' ? <FullDictCard compact /> : null}
      <Text style={[styles.attribution, { color: t.textDim }]}>{tr('dictAttribution', { source: '한국어기초사전 (krdict.korean.go.kr), CC BY-SA 2.0 KR' })}</Text>
    </Screen>
  );
}

/** The word as it is learned: affixes keep no hyphen. */
function headword(w: { word: string }) {
  return w.word.replace(/^-|-$/g, '');
}

function Tag({ icon, text }: { icon: 'shape-outline' | 'chat-outline'; text: string }) {
  const t = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: t.surfaceAlt }]}>
      <Icon name={icon} size={16} color={t.textDim} />
      <Text style={{ color: t.text, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

function Relations({ list, onOpen }: { list: { kind: string; word: string; hom: number }[]; onOpen: (w: string, hom: number) => void }) {
  const t = useTheme();
  const tr = useT();
  const groups = new Map<StringKey, { word: string; hom: number }[]>();
  for (const r of list) {
    const key = RELATION_LABEL[r.kind] ?? 'relSee';
    const g = groups.get(key) ?? [];
    if (!g.some((x) => x.word === r.word)) g.push(r);
    groups.set(key, g);
  }
  return (
    <View style={styles.relations}>
      {[...groups].map(([key, words]) => (
        <View key={key} style={styles.relRow}>
          <Text style={[styles.relLabel, { color: t.textDim }]}>{tr(key)}</Text>
          <View style={styles.chips}>
            {words.map((w) => (
              <Chip key={w.word} label={w.word} onPress={() => onOpen(w.word, w.hom)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { alignItems: 'flex-start' },
  word: { fontSize: 36, fontWeight: '700' },
  hom: { fontSize: 16, fontWeight: '400' },
  hanja: { fontSize: 20, marginTop: 2 },
  dim: { fontSize: 14, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm },
  h: { fontSize: 15, fontWeight: '700' },
  sense: { gap: space.sm },
  senseHead: { alignItems: 'flex-start' },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ru: { flex: 1, fontSize: 18, fontWeight: '700' },
  def: { fontSize: 14 },
  pattern: { fontSize: 14, fontWeight: '600' },
  example: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, paddingLeft: space.sm },
  exampleText: { fontSize: 15, lineHeight: 22 },
  form: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4, alignItems: 'center' },
  relations: { gap: space.sm },
  relRow: { gap: 4 },
  relLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  attribution: { fontSize: 11 },
});
