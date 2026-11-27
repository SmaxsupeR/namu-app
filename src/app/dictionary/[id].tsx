import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { serializeWordList } from '../../core/importer';
import type { Mastery } from '../../core/scheduler';
import { countByType, filterWords, groupByType, typeOfDictWord, typeOfPos, type TypeKey, type WordType } from '../../core/wordTypes';
import { getDb } from '../../db';
import { exportRows, getDictionary, listEntries, type Entry } from '../../db/repo';
import { getAutoDictionary, refreshAutoDictionary } from '../../db/autoDict';
import { WEEK_MS } from '../../dict/sample';
import { getDictionary as openKrdict } from '../../dict';
import { posOfWords } from '../../dict/lookup';
import { shareTextFile } from '../../services/files';
import { speakKorean } from '../../services/speech';
import { useApp } from '../../state/store';
import { Body, Btn, Card, Chip, Empty, Field, IconBtn, Row } from '../../ui/components';
import { TYPE_LABEL } from '../../ui/dictUi';
import { useInterval, useT } from '../../ui/i18n';
import { space, useTheme } from '../../ui/theme';
import { useLoad } from '../../ui/useLoad';

export default function DictionaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showRomanization = useApp((s) => s.settings.showRomanization);
  const [search, setSearch] = useState('');
  const { data, reload } = useLoad(async (db) => ({ dictionary: await getDictionary(db, id), entries: await listEntries(db, { dictionaryId: id, search }), auto: await getAutoDictionary(db, id) }), [id, search]);
  const interval = useInterval();
  const touch = useApp((s) => s.touch);
  const askRenew = () =>
    Alert.alert(tr('sampleRenewTitle'), tr('sampleRenewText'), [
      { text: tr('cancel'), style: 'cancel' },
      {
        text: tr('sampleRenew'),
        onPress: async () => {
          try {
            const r = await refreshAutoDictionary(await getDb(), await openKrdict(), id);
            touch();
            reload();
            if (r) Alert.alert(tr('sampleRenewTitle'), tr('sampleRenewed', { a: r.added, r: r.removed }));
          } catch (e) {
            Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  const [typeFilter, setTypeFilter] = useState<TypeKey | undefined>();
  const [masteryFilter, setMasteryFilter] = useState<Mastery | undefined>();
  const [grouped, setGrouped] = useState(true);
  // Words added without a part of speech get it from the bundled dictionary, when it knows the word.
  const [known, setKnown] = useState<Map<string, WordType>>(new Map());

  useEffect(() => {
    const missing = (data?.entries ?? []).filter((e) => typeOfPos(e.part_of_speech, e.korean) === null).map((e) => e.korean);
    if (missing.length === 0) return;
    let alive = true;
    openKrdict()
      .then((db) => posOfWords(db, missing))
      .then((m) => alive && setKnown(new Map([...m].map(([w, p]) => [w, typeOfDictWord(p.pos, p.unit)]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [data?.entries]);

  const typeOf = (e: Entry) => typeOfPos(e.part_of_speech, e.korean) ?? known.get(e.korean) ?? null;

  const speak = async (text: string) => {
    if (!(await speakKorean(text))) Alert.alert(tr('noVoiceTitle'), tr('noVoiceText'));
  };

  const doExport = async (delimiter: ',' | '\t') => {
    try {
      const rows = await exportRows(await getDb(), id);
      const base = (data?.dictionary?.name ?? 'namu').replace(/[\\/:*?"<>|\s.]+/g, '_').slice(0, 40) || 'namu';
      const csv = delimiter === ',';
      await shareTextFile(`${base}.${csv ? 'csv' : 'tsv'}`, '﻿' + serializeWordList(rows, delimiter), csv ? 'text/csv' : 'text/tab-separated-values');
    } catch (e) {
      Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
    }
  };

  const askExport = () =>
    Alert.alert(tr('exportTitle'), tr('exportText'), [
      { text: tr('cancel'), style: 'cancel' },
      { text: 'TSV', onPress: () => doExport('\t') },
      { text: 'CSV', onPress: () => doExport(',') },
    ]);

  const masteryColor = { new: t.textDim, learning: t.info, stable: t.primary };
  const masteryLabel = { new: tr('masteryNew'), learning: tr('masteryLearning'), stable: tr('masteryStable') };

  const renderItem = ({ item }: { item: Entry }) => (
    <Card style={styles.item} onPress={() => router.push(`/entry?dictionaryId=${id}&id=${item.id}`)}>
      <Row>
        <View style={styles.flex}>
          <Text style={[styles.korean, { color: t.text }]}>{item.korean}</Text>
          {showRomanization && (item.transcription || item.romanization) ? <Text style={[styles.roman, { color: t.textDim }]}>{item.transcription || item.romanization}</Text> : null}
          <Text style={[styles.meaning, { color: t.text }]}>{item.meanings.join('; ')}</Text>
          <Row style={styles.masteryRow}>
            <View style={[styles.dot, { backgroundColor: masteryColor[item.mastery] }]} />
            <Text style={[styles.mastery, { color: masteryColor[item.mastery] }]}>{masteryLabel[item.mastery]}</Text>
          </Row>
        </View>
        <IconBtn name="volume-high" label={tr('listen')} color={t.primary} onPress={() => speak(item.korean)} />
      </Row>
    </Card>
  );

  const all = data?.entries ?? [];
  const entries = filterWords(all, typeOf, { type: typeFilter, mastery: masteryFilter });
  const types = countByType(all, typeOf);
  // With every type shown, the list is split into sections by type.
  const rows = useMemo(() => {
    if (!grouped || typeFilter || types.length < 2) return entries.map((e) => ({ key: e.id, entry: e }));
    return groupByType(entries, typeOf).flatMap((g) => [{ key: `h:${g.type}`, header: g.type, n: g.items.length }, ...g.items.map((e) => ({ key: e.id, entry: e }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map((e) => e.id).join(), grouped, typeFilter, known, types.length]);
  const empty = data && all.length === 0;
  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <Stack.Screen
        options={{
          title: data?.dictionary?.name ?? '',
          headerRight: () => <IconBtn name="pencil-outline" label={tr('editDictionary')} onPress={() => router.push(`/dictionary-edit?id=${id}`)} />,
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item: r }) =>
          'header' in r && r.header ? (
            <Text style={[styles.section, { color: t.textDim }]}>{`${tr(r.header === 'unknown' ? 'typeUnknown' : TYPE_LABEL[r.header as WordType])} · ${r.n}`}</Text>
          ) : 'entry' in r && r.entry ? (
            renderItem({ item: r.entry })
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xl }]}
        ListHeaderComponent={
          <View style={styles.header}>
            {data?.auto ? (
              <Card>
                <Body dim>
                  {data.auto.config.weekly
                    ? tr('sampleWeeklyNext', { t: interval(Math.max(0, data.auto.refreshedAt + WEEK_MS - Date.now())) })
                    : tr('sampleOnce')}
                </Body>
                <Btn kind="soft" small icon="dice-multiple" title={tr('sampleRenew')} onPress={askRenew} />
              </Card>
            ) : null}
            <Row>
              <Btn style={styles.flex} title={tr('study')} icon="play" disabled={!data || (all.length === 0 && search === '')} onPress={() => router.push(`/study?mode=cards&dicts=${id}`)} />
              <Btn style={styles.flex} kind="soft" title={tr('add')} icon="plus" onPress={() => router.push(`/entry?dictionaryId=${id}`)} />
            </Row>
            <Row>
              <Btn style={styles.flex} small kind="ghost" title={tr('import')} icon="tray-arrow-down" onPress={() => router.push(`/import?dictionaryId=${id}`)} />
              <Btn style={styles.flex} small kind="ghost" title={tr('export')} icon="tray-arrow-up" disabled={entries.length === 0} onPress={askExport} />
            </Row>
            {!empty || search !== '' ? <Field value={search} onChangeText={setSearch} placeholder={tr('search')} autoCorrect={false} returnKeyType="search" /> : null}
            {types.length > 1 || typeFilter ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                <Chip label={tr('allN', { n: all.length })} active={!typeFilter} onPress={() => setTypeFilter(undefined)} />
                {types.map((x) => (
                  <Chip
                    key={x.type}
                    label={`${tr(x.type === 'unknown' ? 'typeUnknown' : TYPE_LABEL[x.type])} ${x.n}`}
                    active={typeFilter === x.type}
                    onPress={() => setTypeFilter(typeFilter === x.type ? undefined : x.type)}
                  />
                ))}
              </ScrollView>
            ) : null}
            {all.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                {(['new', 'learning', 'stable'] as Mastery[]).map((m) => (
                  <Chip key={m} label={masteryLabel[m]} active={masteryFilter === m} onPress={() => setMasteryFilter(masteryFilter === m ? undefined : m)} />
                ))}
                {types.length > 1 && !typeFilter ? <Chip icon="format-list-group" label={tr('groupByType')} active={grouped} onPress={() => setGrouped((g) => !g)} /> : null}
              </ScrollView>
            ) : null}
            {all.length > 0 && entries.length === 0 ? <Empty icon="filter-off-outline" title={tr('nothingFound')} /> : null}
          </View>
        }
        ListEmptyComponent={empty ? search !== '' ? <Empty icon="magnify" title={tr('nothingFound')} /> : <Empty icon="text-box-plus-outline" title={tr('noWords')} text={tr('noWordsText')} /> : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  header: { gap: space.sm, marginBottom: space.xs },
  item: { paddingVertical: space.md },
  korean: { fontSize: 22, fontWeight: '600' },
  roman: { fontSize: 13 },
  meaning: { fontSize: 15, marginTop: 2 },
  masteryRow: { gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mastery: { fontSize: 12, fontWeight: '600' },
  chips: { gap: space.sm, paddingVertical: 2 },
  section: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: space.sm },
});
