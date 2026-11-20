import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { romanize } from '../core/hangul';
import { getDb } from '../db';
import { createEntry, deleteEntry, duplicateKey, findDuplicates, getEntry, updateEntry, type EntryInput } from '../db/repo';
import { getDictionary } from '../dict';
import { DICT_ATTRIBUTION, POS_RU, queryKind, search, translationOf, type DictSense, type DictWord } from '../dict/lookup';
import { speakKorean } from '../services/speech';
import { useApp } from '../state/store';
import { Body, Btn, Card, Chip, Field, IconBtn, Row, Screen, type InputRef } from '../ui/components';
import { DictResultCard } from '../ui/DictResults';
import { useT } from '../ui/i18n';
import { useTheme } from '../ui/theme';

const EMPTY = {
  korean: '',
  translation: '',
  transcription: '',
  example: '',
  exampleTranslation: '',
  partOfSpeech: '',
  tags: '',
  notes: '',
};

export default function EntryScreen() {
  const { dictionaryId, id } = useLocalSearchParams<{
    dictionaryId: string;
    id?: string;
  }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const touch = useApp((s) => s.touch);
  const [form, setForm] = useState(EMPTY);
  const [more, setMore] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(!id);
  const original = useRef('');
  const koreanRef = useRef<InputRef>(null);
  const translationRef = useRef<InputRef>(null);
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  // New words start with a dictionary search; the form opens once a meaning is picked
  // (or the user chooses to type everything in).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictWord[]>([]);
  const [searching, setSearching] = useState(false);
  const [dictError, setDictError] = useState(false);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<{
    word: DictWord;
    senses: number[];
  } | null>(null);
  const [manual, setManual] = useState(!!id);
  const queryRef = useRef<InputRef>(null);
  const showForm = !!id || manual || picked !== null;

  useEffect(() => {
    if (showForm) return;
    const q = query.trim();
    if (queryKind(q) === 'none') {
      setResults([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await search(await getDictionary(), q, 20);
        const dupes = found.length
          ? await findDuplicates(
              await getDb(),
              dictionaryId,
              found.map((w) => w.word),
            )
          : new Set<string>();
        if (!alive) return;
        setResults(found);
        setHave(dupes);
        setDictError(false);
      } catch {
        if (alive) setDictError(true);
      } finally {
        if (alive) setSearching(false);
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, showForm, dictionaryId]);

  /** Fills the form from a dictionary meaning. */
  const pick = (word: DictWord, sense: DictSense) => {
    const korean = word.word.replace(/^-|-$/g, '');
    setPicked({ word, senses: [sense.id] });
    setForm({
      ...EMPTY,
      korean,
      translation: translationOf([sense]),
      partOfSpeech: POS_RU[word.pos] ?? '',
      example: sense.example ?? '',
      notes: word.origin && /[\u3400-\u9FFF]/.test(word.origin) ? tr('hanjaNote', { h: word.origin }) : '',
    });
    setMore(!!sense.example);
  };

  /** Adds or removes another meaning of the picked word. */
  const toggleSense = (sense: DictSense) => {
    if (!picked) return;
    const ids = picked.senses.includes(sense.id) ? picked.senses.filter((x) => x !== sense.id) : [...picked.senses, sense.id];
    if (ids.length === 0) return;
    const chosen = picked.word.senses.filter((x) => ids.includes(x.id));
    setPicked({ ...picked, senses: ids });
    set({ translation: translationOf(chosen) });
  };

  const typeManually = () => {
    const q = query.trim();
    const kind = queryKind(q);
    setForm({
      ...EMPTY,
      korean: kind === 'korean' ? q : '',
      translation: kind === 'russian' ? q : '',
    });
    setManual(true);
    setTimeout(() => (kind === 'korean' ? translationRef : koreanRef).current?.focus(), 50);
  };

  const backToSearch = () => {
    setPicked(null);
    setManual(false);
    setForm(EMPTY);
    setTimeout(() => queryRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (!id) return;
    getDb()
      .then((db) => getEntry(db, id))
      .then((e) => {
        if (!e) return;
        original.current = duplicateKey(e.korean);
        setForm({
          korean: e.korean,
          translation: e.meanings.join('; '),
          transcription: e.transcription ?? '',
          example: e.example ?? '',
          exampleTranslation: e.exampleTranslation ?? '',
          partOfSpeech: e.part_of_speech ?? '',
          tags: e.tags.join(', '),
          notes: e.notes ?? '',
        });
        setMore(!!(e.transcription || e.example || e.part_of_speech || e.tags.length || e.notes));
        setLoaded(true);
      });
  }, [id]);

  // Warn about a duplicate while typing; saving is still allowed.
  useEffect(() => {
    const key = duplicateKey(form.korean);
    if (key === '' || key === original.current) {
      setDuplicate(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      getDb()
        .then((db) => findDuplicates(db, dictionaryId, [form.korean]))
        .then((found) => alive && setDuplicate(found.has(key)))
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [form.korean, dictionaryId]);

  const valid = loaded && form.korean.trim() !== '' && form.translation.split(';').some((s) => s.trim() !== '');
  const fail = (e: unknown) => Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));

  const input = (): EntryInput => ({
    korean: form.korean,
    meanings: [form.translation],
    transcription: form.transcription,
    example: form.example,
    exampleTranslation: form.exampleTranslation,
    partOfSpeech: form.partOfSpeech,
    tags: form.tags.split(','),
    notes: form.notes,
  });

  const save = async (another: boolean) => {
    if (!valid) return;
    try {
      const db = await getDb();
      if (id) await updateEntry(db, id, input());
      else await createEntry(db, dictionaryId, input());
      touch();
      if (another) {
        setNotice(tr('saved', { word: form.korean.trim() }));
        setForm(EMPTY);
        setPicked(null);
        setManual(false);
        setQuery('');
        setResults([]);
        setTimeout(() => queryRef.current?.focus(), 50);
      } else router.back();
    } catch (e) {
      fail(e);
    }
  };

  const remove = () => {
    if (!id) return;
    Alert.alert(tr('deleteWordTitle'), tr('deleteWordText', { word: form.korean }), [
      { text: tr('cancel'), style: 'cancel' },
      {
        text: tr('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntry(await getDb(), id);
            touch();
            router.back();
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);
  };

  // The clipboard is read only when the user taps the button.
  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text === '') Alert.alert(tr('paste'), tr('clipboardEmpty'));
    else set({ korean: text.slice(0, 200) });
  };

  const speakText = async (text: string) => {
    if (text.trim() !== '' && !(await speakKorean(text))) Alert.alert(tr('noVoiceTitle'), tr('noVoiceText'));
  };
  const speak = () => speakText(form.korean);

  const auto = form.korean.trim() !== '' ? romanize(form.korean.trim()) : '';

  return (
    <Screen
      footer={
        showForm ? (
          <>
            {!id ? <Btn title={tr('saveAndNext')} icon="plus" disabled={!valid} onPress={() => save(true)} /> : null}
            <Btn kind={id ? 'primary' : 'soft'} title={tr('save')} disabled={!valid} onPress={() => save(false)} />
          </>
        ) : undefined
      }
    >
      <Stack.Screen
        options={{
          title: id ? tr('editWord') : tr('newWord'),
          headerRight: id ? () => <IconBtn name="trash-can-outline" label={tr('delete')} color={t.danger} onPress={remove} /> : undefined,
        }}
      />
      {notice ? (
        <Card style={{ backgroundColor: t.primarySoft, borderColor: t.primarySoft }}>
          <Text style={{ color: t.primary, fontWeight: '600' }} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        </Card>
      ) : null}
      {!showForm ? (
        <>
          <Field
            ref={queryRef}
            label={tr('lookupLabel')}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setNotice('');
            }}
            placeholder={tr('lookupPlaceholder')}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            maxLength={100}
            style={styles.korean}
            right={<IconBtn name="content-paste" label={tr('paste')} color={t.textDim} onPress={async () => setQuery((await Clipboard.getStringAsync()).trim().slice(0, 100))} />}
          />
          {query.trim() === '' ? <Body dim>{tr('lookupHint')}</Body> : null}
          {dictError ? <Body style={{ color: t.danger }}>{tr('dictUnavailable')}</Body> : null}
          {query.trim() !== '' && !searching && results.length === 0 && !dictError ? <Body dim>{tr('lookupNothing')}</Body> : null}
          {results.map((w) => (
            <DictResultCard key={w.id} word={w} have={have.has(duplicateKey(w.word))} onPick={pick} onSpeak={speakText} />
          ))}
          <Btn kind="ghost" small icon="pencil-outline" title={query.trim() ? tr('typeManuallyWith', { q: query.trim() }) : tr('typeManually')} onPress={typeManually} />
          <Text style={[styles.attribution, { color: t.textDim }]}>{tr('dictAttribution', { source: DICT_ATTRIBUTION })}</Text>
        </>
      ) : null}
      {showForm && !id ? <Btn kind="ghost" small icon="magnify" title={tr('backToSearch')} onPress={backToSearch} /> : null}
      {showForm && picked && picked.word.senses.length > 1 ? (
        <Card>
          <Text style={{ color: t.text, fontWeight: '600' }}>{tr('otherMeanings')}</Text>
          <View style={styles.chips}>
            {picked.word.senses.map((s) => (
              <Chip key={s.id} label={`${s.n}. ${s.ru.split(';')[0]}`} active={picked.senses.includes(s.id)} onPress={() => toggleSense(s)} />
            ))}
          </View>
        </Card>
      ) : null}
      {showForm ? (
        <>
          <Field
            ref={koreanRef}
            label={tr('korean')}
            value={form.korean}
            onChangeText={(korean) => set({ korean })}
            placeholder="나무"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => translationRef.current?.focus()}
            maxLength={200}
            style={styles.korean}
            hint={auto && auto !== form.korean.trim() ? tr('romanizationAuto', { r: auto }) : undefined}
            right={
              <Row style={styles.tight}>
                <IconBtn name="content-paste" label={tr('paste')} color={t.textDim} onPress={paste} />
                <IconBtn name="volume-high" label={tr('listen')} color={t.primary} onPress={speak} />
              </Row>
            }
          />
          {duplicate ? <Text style={{ color: t.warn, fontWeight: '600' }}>{tr('duplicateWarning')}</Text> : null}
          <Field
            ref={translationRef}
            label={tr('translation')}
            value={form.translation}
            onChangeText={(translation) => set({ translation })}
            hint={tr('translationHint')}
            returnKeyType="done"
            maxLength={300}
          />
          <Btn kind="ghost" small icon={more ? 'chevron-up' : 'chevron-down'} title={more ? tr('less') : tr('more')} onPress={() => setMore((v) => !v)} />
          {more ? (
            <>
              <Field
                label={tr('transcription')}
                value={form.transcription}
                onChangeText={(transcription) => set({ transcription })}
                placeholder={auto}
                hint={tr('transcriptionHint')}
                autoCapitalize="none"
                maxLength={200}
              />
              <Field label={tr('example')} value={form.example} onChangeText={(example) => set({ example })} autoCorrect={false} maxLength={400} />
              <Field label={tr('exampleTranslation')} value={form.exampleTranslation} onChangeText={(exampleTranslation) => set({ exampleTranslation })} maxLength={400} />
              <Field label={tr('partOfSpeech')} value={form.partOfSpeech} onChangeText={(partOfSpeech) => set({ partOfSpeech })} maxLength={60} />
              <Field label={tr('tags')} value={form.tags} onChangeText={(tags) => set({ tags })} hint={tr('tagsHint')} autoCapitalize="none" maxLength={200} />
              <Field label={tr('notes')} value={form.notes} onChangeText={(notes) => set({ notes })} multiline maxLength={2000} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  korean: { fontSize: 22 },
  tight: { gap: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attribution: { fontSize: 11, marginTop: 8 },
});
