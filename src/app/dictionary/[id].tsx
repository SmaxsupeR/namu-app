// One dictionary: Study as the main action, a search box with all filters in one panel,
// compact word rows, Add as the floating button, and everything else in the … menu.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { serializeWordList } from '../../core/importer';
import type { Mastery } from '../../core/scheduler';
import { countByType, filterWords, groupByType, typeOfDictWord, typeOfPos, type TypeKey, type WordType } from '../../core/wordTypes';
import { getDb } from '../../db';
import { getAutoDictionary, refreshAutoDictionary } from '../../db/autoDict';
import { exportRows, getDictionary, listEntries, type Entry } from '../../db/repo';
import { getDictionary as openKrdict } from '../../dict';
import { posOfWords } from '../../dict/lookup';
import { WEEK_MS } from '../../dict/sample';
import { shareTextFile } from '../../services/files';
import { speakKorean } from '../../services/speech';
import { useApp } from '../../state/store';
import { Btn, Chip, EmptyState, Fab, IconBtn, Row, SearchField, Section } from '../../ui/components';
import { TYPE_LABEL } from '../../ui/dictUi';
import { useInterval, useT } from '../../ui/i18n';
import { SettingsRow, WordRow } from '../../ui/rows';
import { ActionSheet, FilterSheet, useConfirm } from '../../ui/sheets';
import { Text } from '../../ui/Text';
import { radius, space, type as typeScale, useTheme } from '../../ui/theme';
import { useLoad } from '../../ui/useLoad';

type Row = { key: string; header?: TypeKey; n?: number; entry?: Entry; first?: boolean; last?: boolean };

export default function DictionaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const interval = useInterval();
  const touch = useApp((s) => s.touch);
  const showRomanization = useApp((s) => s.settings.showRomanization);
  const { dialog, confirm } = useConfirm();
  const [search, setSearch] = useState('');
  const { data, reload } = useLoad(async (db) => ({ dictionary: await getDictionary(db, id), entries: await listEntries(db, { dictionaryId: id, search }), auto: await getAutoDictionary(db, id) }), [id, search]);
  const [typeFilter, setTypeFilter] = useState<TypeKey | undefined>();
  const [masteryFilter, setMasteryFilter] = useState<Mastery | undefined>();
  const [grouped, setGrouped] = useState(true);
  const [menu, setMenu] = useState(false);
  const [filters, setFilters] = useState(false);
  // Filter choices are a draft until Apply.
  const [draft, setDraft] = useState<{ type?: TypeKey; mastery?: Mastery; grouped: boolean }>({ grouped: true });
  const [notice, setNotice] = useState('');
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
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const renew = async () => {
    const ok = await confirm({ title: tr('sampleRenewTitle'), message: tr('sampleRenewText'), confirmLabel: tr('sampleRenew'), cancelLabel: tr('cancel') });
    if (!ok) return;
    try {
      const r = await refreshAutoDictionary(await getDb(), await openKrdict(), id);
      touch();
      reload();
      if (r) setNotice(tr('sampleRenewed', { a: r.added, r: r.removed }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const masteryLabel: Record<Mastery, string> = { new: tr('masteryNew'), learning: tr('masteryLearning'), stable: tr('masteryStable') };
  const typeLabel = (k: TypeKey) => tr(k === 'unknown' ? 'typeUnknown' : TYPE_LABEL[k as WordType]);

  const all = data?.entries ?? [];
  const entries = filterWords(all, typeOf, { type: typeFilter, mastery: masteryFilter });
  const types = countByType(all, typeOf);
  // With every type shown, the list is split into sections by type; rows of a section share one surface.
  const rows = useMemo<Row[]>(() => {
    const groups = grouped && !typeFilter && types.length >= 2 ? groupByType(entries, typeOf) : [{ type: null as TypeKey | null, items: entries }];
    return groups.flatMap((g) => [
      ...(g.type ? [{ key: `h:${g.type}`, header: g.type, n: g.items.length }] : []),
      ...g.items.map((e, i) => ({ key: e.id, entry: e, first: i === 0, last: i === g.items.length - 1 })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map((e) => e.id).join(), grouped, typeFilter, known, types.length]);

  const empty = data && all.length === 0;
  const filtered = !!typeFilter || !!masteryFilter;
  const openFilters = () => {
    setDraft({ type: typeFilter, mastery: masteryFilter, grouped });
    setFilters(true);
  };

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <Stack.Screen
        options={{
          title: data?.dictionary?.name ?? '',
          headerRight: () => <IconBtn name="more-vertical" label={tr('moreActions')} onPress={() => setMenu(true)} />,
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item: r }) =>
          r.header ? (
            <Text style={[typeScale.caption, styles.groupTitle, { color: t.textDim }]} accessibilityRole="header">{`${typeLabel(r.header)} · ${r.n}`}</Text>
          ) : r.entry ? (
            <View
              style={[
                { backgroundColor: t.surface, borderColor: t.divider },
                styles.rowBox,
                r.first && styles.rowFirst,
                r.last && styles.rowLast,
                !r.first && { borderTopColor: t.divider, borderTopWidth: StyleSheet.hairlineWidth },
              ]}>
              <WordRow
                korean={r.entry.korean}
                romanization={showRomanization ? r.entry.transcription || r.entry.romanization : null}
                translation={r.entry.meanings.join('; ')}
                mastery={r.entry.mastery}
                masteryLabel={masteryLabel[r.entry.mastery]}
                onPress={() => router.push(`/entry?dictionaryId=${id}&id=${r.entry!.id}`)}
                onListen={() => speak(r.entry!.korean)}
                listenLabel={`${tr('listen')}: ${r.entry.korean}`}
              />
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {data?.auto ? (
              <Text style={[typeScale.secondary, { color: t.textDim }]}>
                {data.auto.config.weekly ? tr('sampleWeeklyNext', { t: interval(Math.max(0, data.auto.refreshedAt + WEEK_MS - Date.now())) }) : tr('sampleOnce')}
              </Text>
            ) : null}
            {notice ? (
              <Text style={[typeScale.secondary, { color: t.primary }]} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {!empty ? <Btn title={tr('study')} icon="play" onPress={() => router.push(`/study?mode=cards&dicts=${id}`)} /> : null}
            {!empty || search !== '' ? <SearchField value={search} onChangeText={setSearch} placeholder={tr('search')} onFilter={all.length > 0 ? openFilters : undefined} filtersActive={filtered} /> : null}
            {filtered ? (
              <Row style={styles.wrap}>
                {typeFilter ? <Chip label={typeLabel(typeFilter)} icon="x" active onPress={() => setTypeFilter(undefined)} /> : null}
                {masteryFilter ? <Chip label={masteryLabel[masteryFilter]} icon="x" active onPress={() => setMasteryFilter(undefined)} /> : null}
              </Row>
            ) : null}
            {!empty ? <Text style={[typeScale.secondary, { color: t.textDim }]}>{filtered || search ? tr('wordsShownOf', { n: entries.length, total: all.length }) : tr('words', { n: all.length })}</Text> : null}
            {all.length > 0 && entries.length === 0 ? <EmptyState icon="search" title={tr('nothingFound')} /> : null}
          </View>
        }
        ListEmptyComponent={
          empty ? (
            search !== '' ? (
              <EmptyState icon="search" title={tr('nothingFound')} />
            ) : (
              <EmptyState
                icon="file-plus"
                title={tr('noWords')}
                text={tr('noWordsText')}
                action={
                  <View style={styles.actions}>
                    <Btn icon="plus" title={tr('addWord')} onPress={() => router.push(`/entry?dictionaryId=${id}`)} />
                    <Btn kind="ghost" icon="download" title={tr('import')} onPress={() => router.push(`/import?dictionaryId=${id}`)} />
                  </View>
                }
              />
            )
          ) : undefined
        }
        ListFooterComponent={<View style={styles.footerSpace} />}
      />
      {!empty ? <Fab icon="plus" label={tr('addWord')} onPress={() => router.push(`/entry?dictionaryId=${id}`)} /> : null}

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={data?.dictionary?.name}
        actions={[
          { icon: 'edit-2', label: tr('editDictionary'), onPress: () => router.push(`/dictionary-edit?id=${id}`) },
          { icon: 'download', label: tr('import'), onPress: () => router.push(`/import?dictionaryId=${id}`) },
          { icon: 'upload', label: tr('exportCsv'), onPress: () => doExport(','), hidden: all.length === 0 },
          { icon: 'upload', label: tr('exportTsv'), onPress: () => doExport('\t'), hidden: all.length === 0 },
          { icon: 'shuffle', label: tr('sampleRenew'), onPress: renew, hidden: !data?.auto },
        ]}
      />
      <FilterSheet
        visible={filters}
        onClose={() => setFilters(false)}
        title={tr('filtersTitle')}
        applyLabel={tr('apply')}
        resetLabel={tr('resetFilters')}
        onReset={() => setDraft({ grouped: true })}
        onApply={() => {
          setTypeFilter(draft.type);
          setMasteryFilter(draft.mastery);
          setGrouped(draft.grouped);
        }}>
        {types.length > 1 ? (
          <>
            <Section>{tr('wordTypes')}</Section>
            <Row style={styles.wrap}>
              {types.map((x) => (
                <Chip key={x.type} label={`${typeLabel(x.type)} ${x.n}`} active={draft.type === x.type} onPress={() => setDraft((d) => ({ ...d, type: d.type === x.type ? undefined : x.type }))} />
              ))}
            </Row>
          </>
        ) : null}
        <Section>{tr('masteryTitle')}</Section>
        <Row style={styles.wrap}>
          {(['new', 'learning', 'stable'] as Mastery[]).map((m) => (
            <Chip key={m} label={masteryLabel[m]} active={draft.mastery === m} onPress={() => setDraft((d) => ({ ...d, mastery: d.mastery === m ? undefined : m }))} />
          ))}
        </Row>
        {types.length > 1 ? <SettingsRow label={tr('groupByType')} toggle={draft.grouped} onToggle={(v) => setDraft((d) => ({ ...d, grouped: v }))} /> : null}
      </FilterSheet>
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingTop: space.md },
  header: { gap: space.md, marginBottom: space.md },
  wrap: { flexWrap: 'wrap' },
  actions: { gap: space.sm },
  groupTitle: { marginTop: space.lg, marginBottom: space.sm, marginLeft: space.xs },
  rowBox: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  rowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: StyleSheet.hairlineWidth },
  rowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  footerSpace: { height: 96 },
});
