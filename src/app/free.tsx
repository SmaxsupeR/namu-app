// Free practice: how words are presented, what to practise, how many — then Start. Direction,
// answer method, attempts and "count as a review" sit under Advanced with a one-line summary.
// The last choice is remembered; links from Explore (listening, flashcards, hard words) still
// set their own mode.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getDb } from '../db';
import { getDifficultWords, listDictionaries, listEntries, loadPreferences, savePreference, type Entry } from '../db/repo';
import { DEFAULT_FREE, FREE_COUNTS, FREE_PREF_KEY, parseFreeChoice, type FreeDirs, type FreeMethod } from '../state/freePractice';
import { useApp } from '../state/store';
import { Body, Btn, Chip, Icon, IconBtn, Row, Screen, Section, SegmentedControl } from '../ui/components';
import { useT } from '../ui/i18n';
import { ListGroup, ListRow, SettingsRow } from '../ui/rows';
import { Text } from '../ui/Text';
import { radius, size, space, type as typeScale, useTheme } from '../ui/theme';
import { useLoad } from '../ui/useLoad';

type Source = 'dicts' | 'entries' | 'hard' | 'today';
type Prompt = 'text' | 'audio' | 'dictation';

export default function FreePractice() {
  const params = useLocalSearchParams<{ source?: string; prompt?: string; method?: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const attempts = useApp((s) => s.settings.practiceAttempts);
  const patchSettings = useApp((s) => s.patchSettings);
  const linkMethod: FreeMethod | null = params.method === 'self_grade' || params.method === 'choice' || params.method === 'keyboard' ? params.method : null;
  const [source, setSource] = useState<Source>(params.source === 'hard' ? 'hard' : params.source === 'today' ? 'today' : 'dicts');
  const [dicts, setDicts] = useState<string[]>(DEFAULT_FREE.dicts);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickFrom, setPickFrom] = useState<string | null>(null);
  const [dirs, setDirs] = useState<FreeDirs>(DEFAULT_FREE.dirs);
  const [method, setMethod] = useState<FreeMethod>(linkMethod ?? DEFAULT_FREE.method);
  const [limit, setLimit] = useState(DEFAULT_FREE.limit);
  const [countAsReview, setCountAsReview] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(params.prompt === 'audio' || params.prompt === 'dictation' ? params.prompt : 'text');
  const [advanced, setAdvanced] = useState(false);
  const listening = prompt !== 'text';

  // The last valid choice; a method given by the link wins.
  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await getDb();
      const prefs = await loadPreferences(db);
      const ids = (await listDictionaries(db, Date.now())).map((d) => d.id);
      const last = parseFreeChoice(prefs[FREE_PREF_KEY], ids);
      if (!alive) return;
      setDicts(last.dicts);
      setDirs(last.dirs);
      setLimit(last.limit);
      if (!linkMethod) setMethod(last.method);
    })().catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data } = useLoad(async (db) => {
    const now = Date.now();
    const dictionaries = await listDictionaries(db, now);
    const hard = await getDifficultWords(db, { dictionaryIds: dicts, limit: 200, now });
    const from = pickFrom ?? dictionaries[0]?.id ?? null;
    const words: Entry[] = from ? await listEntries(db, { dictionaryId: from }) : [];
    return { dictionaries, hard, words, from };
  }, [dicts.join(','), pickFrom]);

  const setAttempts = (n: number) => {
    const v = Math.max(1, Math.min(10, n));
    patchSettings({ practiceAttempts: v });
    getDb()
      .then((db) => savePreference(db, 'practiceAttempts', JSON.stringify(v)))
      .catch(() => {});
  };

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const available = source === 'entries' ? picked.length : source === 'hard' ? (data?.hard.length ?? 0) : 1;
  const countable = !listening && method !== 'choice';
  const start = () => {
    getDb()
      .then((db) => savePreference(db, FREE_PREF_KEY, JSON.stringify({ dicts, dirs, method, limit })))
      .catch(() => {});
    const q = new URLSearchParams({
      kind: 'free',
      source,
      dicts: dicts.join(','),
      ids: picked.join(','),
      dirs,
      method,
      limit: String(source === 'entries' ? picked.length : limit),
      fails: String(attempts),
      count: countAsReview && countable ? '1' : '0',
      prompt,
    });
    router.push(`/study?${q.toString()}`);
  };

  const dirLabel = { both: tr('dirBoth'), ko_ru: tr('dirKoRu'), ru_ko: tr('dirRuKo') }[dirs];
  const methodLabel = { keyboard: tr('methodKeyboard'), self_grade: tr('methodSelf'), choice: tr('methodChoice') }[method];
  const summary = [listening ? null : dirLabel, methodLabel, tr('attemptsN', { n: attempts }), countAsReview && countable ? tr('countsAsReviewShort') : null].filter(Boolean).join(' · ');

  return (
    <Screen footer={<Btn title={tr('start')} icon="play" disabled={available === 0} onPress={start} />}>
      <Stack.Screen options={{ title: tr('freeTitle') }} />

      <Section>{tr('promptTitle')}</Section>
      <SegmentedControl
        value={prompt}
        onChange={setPrompt}
        options={[
          { value: 'text', label: tr('promptText') },
          { value: 'audio', label: tr('promptAudio') },
          { value: 'dictation', label: tr('promptDictation') },
        ]}
      />
      <Body dim>{tr(prompt === 'audio' ? 'promptAudioHint' : prompt === 'dictation' ? 'promptDictationHint' : 'freeHint')}</Body>

      <Section>{tr('freeSource')}</Section>
      <View style={styles.chips}>
        <Chip label={tr('sourceDicts')} active={source === 'dicts'} onPress={() => setSource('dicts')} />
        <Chip label={tr('sourceWords')} active={source === 'entries'} onPress={() => setSource('entries')} />
        <Chip label={tr('sourceToday')} active={source === 'today'} onPress={() => setSource('today')} />
        <Chip label={tr('sourceHard')} active={source === 'hard'} onPress={() => setSource('hard')} />
      </View>

      {source !== 'entries' ? (
        <View style={styles.chips}>
          <Chip label={tr('allDictionaries')} active={dicts.length === 0} onPress={() => setDicts([])} />
          {data?.dictionaries.map((d) => (
            <Chip key={d.id} label={d.name} active={dicts.includes(d.id)} onPress={() => setDicts((cur) => toggle(cur, d.id))} />
          ))}
        </View>
      ) : null}

      {source === 'hard' ? (
        <>
          <Body dim>{data && data.hard.length === 0 ? tr('hardNone') : data ? tr('hardCount', { n: data.hard.length }) : ''}</Body>
          {data && data.hard.length > 0 ? (
            <ListGroup>
              {data.hard.slice(0, 5).map((w) => (
                <ListRow key={w.id} title={w.korean} value={w.meaning ?? ''} chevron={false} />
              ))}
              <ListRow icon="headphones" title={tr('hardListenAll')} onPress={() => router.push(`/listen?source=hard&dicts=${dicts.join(',')}`)} />
            </ListGroup>
          ) : null}
        </>
      ) : null}

      {source === 'entries' ? (
        <>
          <View style={styles.chips}>
            {data?.dictionaries.map((d) => (
              <Chip key={d.id} label={d.name} active={data.from === d.id} onPress={() => setPickFrom(d.id)} />
            ))}
          </View>
          <Body dim>{tr('pickedCount', { n: picked.length })}</Body>
          <View style={[styles.pickList, { backgroundColor: t.surface, borderColor: t.divider }]}>
            {data?.words.map((w, i) => {
              const on = picked.includes(w.id);
              return (
                <Pressable
                  key={w.id}
                  onPress={() => setPicked((cur) => toggle(cur, w.id))}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${w.korean}: ${w.meanings.join('; ')}`}
                  accessibilityState={{ checked: on }}
                  style={[styles.wordRow, i > 0 && { borderTopColor: t.divider, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Icon name={on ? 'check-square' : 'square'} color={on ? t.primary : t.textDim} />
                  <Text variant="korean">{w.korean}</Text>
                  <Text style={[typeScale.secondary, styles.flex, { color: t.textDim }]} numberOfLines={1}>
                    {w.meanings.join('; ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Section>{tr('freeCount')}</Section>
          <View style={styles.chips}>
            {FREE_COUNTS.map((n) => (
              <Chip key={n} label={String(n)} active={limit === n} onPress={() => setLimit(n)} />
            ))}
          </View>
        </>
      )}

      {/* Advanced: collapsed, with what is chosen visible in one line. */}
      <Pressable onPress={() => setAdvanced((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: advanced }} accessibilityLabel={`${tr('advanced')}. ${summary}`} style={styles.advanced}>
        <View style={styles.flex}>
          <Text style={typeScale.bodyStrong}>{tr('advanced')}</Text>
          <Text style={[typeScale.secondary, { color: t.textDim }]}>{summary}</Text>
        </View>
        <Icon name={advanced ? 'chevron-up' : 'chevron-down'} color={t.textDim} />
      </Pressable>

      {advanced ? (
        <>
          {!listening ? (
            <>
              <Section>{tr('freeDirection')}</Section>
              <SegmentedControl
                value={dirs}
                onChange={setDirs}
                options={[
                  { value: 'both', label: tr('dirBothShort') },
                  { value: 'ko_ru', label: tr('dirKoRu') },
                  { value: 'ru_ko', label: tr('dirRuKo') },
                ]}
              />
            </>
          ) : (
            <Body dim>{tr('listeningNoSchedule')}</Body>
          )}
          <Section>{tr('answerMethod')}</Section>
          <SegmentedControl
            value={method}
            onChange={setMethod}
            options={[
              { value: 'keyboard', label: tr('methodKeyboard') },
              { value: 'self_grade', label: tr('methodSelf') },
              { value: 'choice', label: tr('methodChoiceShort') },
            ]}
          />
          <Body dim>{tr(method === 'keyboard' ? 'methodKeyboardHint' : method === 'self_grade' ? 'methodSelfHint' : 'methodChoiceHint')}</Body>
          <ListGroup>
            <ListRow
              title={tr('freeAttempts')}
              subtitle={tr('freeAttemptsHint')}
              chevron={false}
              trailing={
                <Row style={styles.stepper}>
                  <IconBtn name="minus" label={`${tr('freeAttempts')} −`} color={t.primary} disabled={attempts <= 1} onPress={() => setAttempts(attempts - 1)} />
                  <Text style={[typeScale.bodyStrong, styles.value]}>{attempts}</Text>
                  <IconBtn name="plus" label={`${tr('freeAttempts')} +`} color={t.primary} disabled={attempts >= 10} onPress={() => setAttempts(attempts + 1)} />
                </Row>
              }
            />
            {countable ? <SettingsRow label={tr('countAsReview')} hint={tr('countAsReviewHint')} toggle={countAsReview} onToggle={setCountAsReview} /> : null}
          </ListGroup>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pickList: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.row, paddingHorizontal: space.lg },
  advanced: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.row, marginTop: space.sm },
  stepper: { gap: 0 },
  value: { minWidth: 24, textAlign: 'center' },
});
