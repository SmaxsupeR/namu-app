// My words: the learner's dictionaries as one list, the ready-made sets, and the archive.
// Editing and managing a dictionary happens on its own page (… menu).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { listDictionaries, type DictionarySummary } from '../../db/repo';
import { Btn, EmptyState, ErrorState, Fab, Icon, LoadingState, Screen, ScreenHeader, Section } from '../../ui/components';
import { useT } from '../../ui/i18n';
import { ListGroup, ListRow } from '../../ui/rows';
import { space, useTheme } from '../../ui/theme';
import { useLoad } from '../../ui/useLoad';

export default function MyWords() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const [showArchive, setShowArchive] = useState(false);
  const { data, error, reload } = useLoad(async (db) => {
    const now = Date.now();
    return { active: await listDictionaries(db, now), archived: await listDictionaries(db, now, true) };
  });

  const row = (d: DictionarySummary) => (
    <ListRow
      key={d.id}
      leading={<View style={[styles.swatch, { backgroundColor: d.color }]}>{d.is_favorite ? <Icon name="star" size={12} color="#FFFFFF" /> : null}</View>}
      title={d.name}
      subtitle={[tr('words', { n: d.entry_count }), d.is_paused ? tr('paused') : ''].filter(Boolean).join(' · ')}
      value={d.due_count > 0 && !d.is_paused ? tr('due', { n: d.due_count }) : undefined}
      onPress={() => router.push(`/dictionary/${d.id}`)}
    />
  );

  return (
    <View style={styles.flex}>
      <Screen top>
        <ScreenHeader title={tr('tabMyWords')} />
        {error && !data ? <ErrorState title={tr('wordsErrorTitle')} retryLabel={tr('retry')} onRetry={reload} /> : null}
        {!data && !error ? <LoadingState /> : null}
        {data && data.active.length === 0 ? (
          <EmptyState
            icon="book"
            title={tr('noDictionaries')}
            text={tr('noDictionariesText')}
            action={<Btn kind="soft" icon="shuffle" title={tr('sampleTitle')} onPress={() => router.push('/dict-sample')} />}
          />
        ) : null}
        {data && data.active.length > 0 ? <ListGroup>{data.active.map(row)}</ListGroup> : null}

        {data && data.active.length > 0 ? (
          <>
            <Section>{tr('readySets')}</Section>
            <ListGroup>
              <ListRow icon="shuffle" title={tr('sampleTitle')} subtitle={tr('readySetsHint')} onPress={() => router.push('/dict-sample')} />
            </ListGroup>
          </>
        ) : null}

        {data && data.archived.length > 0 ? (
          <>
            <Btn kind="ghost" small icon={showArchive ? 'chevron-up' : 'archive'} title={showArchive ? tr('hideArchive') : tr('showArchive', { n: data.archived.length })} onPress={() => setShowArchive((v) => !v)} />
            {showArchive ? <ListGroup>{data.archived.map(row)}</ListGroup> : null}
          </>
        ) : null}
        <View style={styles.spacer} />
      </Screen>
      <Fab icon="plus" label={tr('createDictionary')} onPress={() => router.push('/dictionary-edit')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  swatch: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  spacer: { height: 72 + space.lg },
});
