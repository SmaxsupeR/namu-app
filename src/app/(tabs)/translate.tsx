// "Translator" tab: the whole Korean–Russian dictionary, searched in either
// language or browsed by word type, level, topic and situation.
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDictionary } from '../../dict';
import { browse, countWords, queryKind, search, subjectCounts, type DictFilter, type DictWord } from '../../dict/lookup';
import { topicName, TOP_TOPICS } from '../../dict/topics';
import { Body, Btn, Chip, Field, Icon, IconBtn, Row, Title } from '../../ui/components';
import { FilterPanel, FullDictCard, TYPE_LABEL, LEVEL_LABEL, WordRow } from '../../ui/dictUi';
import { Conjugator, GrammarList } from '../../ui/grammarUi';
import { useT } from '../../ui/i18n';
import { radius, space, useTheme } from '../../ui/theme';

const PAGE = 40;

export default function Translate() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DictFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<DictWord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [error, setError] = useState(false);
  // The tab holds three references: the dictionary, the grammar guide and the conjugation table.
  const [section, setSection] = useState<'words' | 'grammar' | 'conjugate'>('words');
  const request = useRef(0);

  const active = Object.values(filter).filter((v) => v !== undefined).length;
  const q = query.trim();
  const mode: 'search' | 'browse' | 'start' = queryKind(q) !== 'none' ? 'search' : active > 0 ? 'browse' : 'start';

  useEffect(() => {
    getDictionary()
      .then((db) => subjectCounts(db))
      .then((rows) => setSubjects(rows.map((r) => r.subject)))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const id = ++request.current;
    if (mode === 'start') {
      setItems([]);
      setTotal(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const db = await getDictionary();
        const found = mode === 'search' ? await search(db, q, 60, filter) : await browse(db, filter, 0, PAGE);
        const n = mode === 'browse' ? await countWords(db, filter) : found.length;
        if (id !== request.current) return;
        setItems(found);
        setTotal(n);
        setError(false);
      } catch {
        if (id === request.current) setError(true);
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [q, filter, mode]);

  const more = async () => {
    if (mode !== 'browse' || loading || total === null || items.length >= total) return;
    const id = request.current;
    setLoading(true);
    try {
      const next = await browse(await getDictionary(), filter, items.length, PAGE);
      if (id === request.current) setItems((cur) => [...cur, ...next]);
    } finally {
      setLoading(false);
    }
  };

  const summary = [filter.type ? tr(TYPE_LABEL[filter.type]) : '', filter.level ? tr(LEVEL_LABEL[filter.level]) : '', filter.topic ? topicName(filter.topic) : ''].filter(Boolean).join(' · ');

  const header = (
    <View style={styles.header}>
      <Title>{tr('tabTranslate')}</Title>
      <Row style={styles.sections}>
        <Chip label={tr('sectionWords')} active={section === 'words'} onPress={() => setSection('words')} />
        <Chip label={tr('sectionGrammar')} active={section === 'grammar'} onPress={() => setSection('grammar')} />
        <Chip label={tr('sectionConjugate')} active={section === 'conjugate'} onPress={() => setSection('conjugate')} />
      </Row>
      {section === 'grammar' ? <GrammarList /> : null}
      {section === 'conjugate' ? <Conjugator /> : null}
      {section === 'words' ? (
      <>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={tr('translatePlaceholder')}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        maxLength={100}
        style={styles.input}
        accessibilityLabel={tr('translatePlaceholder')}
        right={
          query ? (
            <IconBtn name="close-circle" label={tr('clear')} color={t.textDim} onPress={() => setQuery('')} />
          ) : (
            <IconBtn name="content-paste" label={tr('paste')} color={t.textDim} onPress={async () => setQuery((await Clipboard.getStringAsync()).trim().slice(0, 100))} />
          )
        }
      />
      <View style={[styles.filterBar, { backgroundColor: active ? t.primarySoft : t.surface, borderColor: active ? t.primary : t.border }]}>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showFilters }}
          accessibilityLabel={active ? summary || tr('filtersN', { n: active }) : tr('filters')}
          style={styles.filterBtn}>
          <Icon name="filter-variant" color={active ? t.primary : t.text} />
          <Text style={[styles.filterText, { color: active ? t.primary : t.text }]} numberOfLines={1}>
            {active ? summary || tr('filtersN', { n: active }) : tr('filters')}
          </Text>
          {!active ? <Icon name={showFilters ? 'chevron-up' : 'chevron-down'} color={t.textDim} /> : null}
        </Pressable>
        {active ? <IconBtn name="close" label={tr('resetFilters')} color={t.primary} size={20} onPress={() => setFilter({})} /> : null}
      </View>
      {showFilters ? <FilterPanel filter={filter} onChange={setFilter} subjects={subjects} /> : null}
      {error ? <Body style={{ color: t.danger }}>{tr('dictUnavailable')}</Body> : null}
      {mode === 'browse' && total !== null ? <Body dim>{tr('wordsFound', { n: total })}</Body> : null}
      {mode !== 'start' && !loading && items.length === 0 ? (
        <>
          <Body dim>{active ? tr('nothingWithFilters') : tr('lookupNothing')}</Body>
          {active ? <Btn kind="soft" small icon="filter-remove-outline" title={tr('resetFilters')} onPress={() => setFilter({})} /> : null}
        </>
      ) : null}
      {mode === 'start' ? (
        <>
          <Body dim>{tr('translateHint')}</Body>
          <Text style={[styles.section, { color: t.textDim }]}>{tr('browseTopics')}</Text>
          <View style={styles.grid}>
            {TOP_TOPICS.map((x) => (
              <Pressable key={x} onPress={() => setFilter({ topic: x })} accessibilityRole="button" style={[styles.topic, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={{ color: t.text, fontWeight: '600' }}>{topicName(x)}</Text>
              </Pressable>
            ))}
          </View>
          <Btn kind="ghost" small icon="filter-variant" title={tr('browseByType')} onPress={() => setShowFilters(true)} />
          <FullDictCard />
        </>
      ) : null}
      </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <FlatList
        data={section === 'words' ? items : []}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item }) => <WordRow word={item} onPress={() => router.push(`/word/${item.id}`)} />}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        onEndReached={more}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: space.lg, gap: space.sm },
  header: { gap: space.sm, marginBottom: space.xs },
  input: { fontSize: 20 },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingRight: space.xs, borderRadius: radius.md, borderWidth: 1 },
  filterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
  filterText: { flex: 1, fontSize: 15, fontWeight: '600' },
  section: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  topic: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1 },
  sections: { flexWrap: 'wrap', gap: space.sm },
});
