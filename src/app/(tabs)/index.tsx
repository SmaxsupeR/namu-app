// Today: today's study in one tap, then what else is due and the recent dictionaries. Counts
// that belong to Progress (learning / mastered / total) are not repeated here.
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { getOverview, getPlanCounts, listDictionaries } from '../../db/repo';
import { directionList, useApp } from '../../state/store';
import { Bar, Btn, EmptyState, ErrorState, Icon, IconBtn, LoadingState, Screen, ScreenHeader, SectionHeader } from '../../ui/components';
import { useGrammarReview } from '../../ui/grammarUi';
import { useT, type StringKey } from '../../ui/i18n';
import { ListGroup, ListRow } from '../../ui/rows';
import { Text } from '../../ui/Text';
import { radius, space, type as typeScale, useTheme } from '../../ui/theme';
import { useLoad } from '../../ui/useLoad';
import { WebHints } from '../../ui/WebHints';

function greeting(hour: number): StringKey {
  if (hour < 5) return 'greetNight';
  if (hour < 12) return 'greetMorning';
  if (hour < 18) return 'greetDay';
  return 'greetEvening';
}

export default function Today() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const settings = useApp((s) => s.settings);
  const grammar = useGrammarReview();
  const { data, error, reload } = useLoad(async (db) => {
    const now = Date.now();
    const [overview, counts, dictionaries] = await Promise.all([
      getOverview(db, now),
      getPlanCounts(db, { dictionaryIds: [], directions: directionList(settings.directions), now, newPerDay: settings.newPerDay, maxReviews: settings.maxReviews }),
      listDictionaries(db, now),
    ]);
    return { overview, counts, dictionaries };
  }, [settings.newPerDay, settings.maxReviews, settings.directions]);

  const header = <ScreenHeader title={tr(greeting(new Date().getHours()))} actions={<IconBtn name="settings" label={tr('settings')} onPress={() => router.push('/settings')} />} />;

  if (error && !data) {
    return (
      <Screen top>
        {header}
        <ErrorState title={tr('todayErrorTitle')} text={tr('todayErrorText')} retryLabel={tr('retry')} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen top>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  const { overview, counts, dictionaries } = data;

  if (dictionaries.length === 0) {
    return (
      <Screen top>
        {header}
        <EmptyState
          icon="feather"
          title={tr('welcomeTitle')}
          text={tr('welcomeText')}
          action={
            <View style={styles.actions}>
              <Btn title={tr('createDictionary')} icon="plus" onPress={() => router.push('/dictionary-edit')} />
              <Btn kind="ghost" icon="shuffle" title={tr('sampleTitle')} onPress={() => router.push('/dict-sample')} />
            </View>
          }
        />
      </Screen>
    );
  }

  const todo = counts.due + counts.learning + counts.fresh;
  const plan = [counts.due > 0 && tr('planDue', { n: counts.due }), counts.learning > 0 && tr('planLearning', { n: counts.learning }), counts.fresh > 0 && tr('planFresh', { n: counts.fresh })].filter(Boolean).join(' · ');
  const grammarDue = grammar?.due.length ?? 0;
  const studied = overview.answersToday > 0;

  return (
    <Screen top>
      {header}
      <WebHints hasWords={overview.totalWords > 0} />

      {/* The one main thing on this screen. */}
      <View style={[styles.hero, { backgroundColor: t.primarySoft }]}>
        <Text style={[typeScale.caption, { color: t.primary }]}>{tr('todayTitle')}</Text>
        {todo > 0 ? (
          <>
            <Text variant="section">{plan}</Text>
            <Btn title={tr('startReview')} icon="play" onPress={() => router.push('/study')} />
          </>
        ) : (
          <>
            <Text variant="section">{tr('allDone')}</Text>
            <Text style={[typeScale.secondary, { color: t.textDim }]}>{studied ? tr('consolidateHint') : tr('allDoneHint')}</Text>
            {studied ? <Btn kind="ghost" icon="repeat" title={tr('consolidateToday')} onPress={() => router.push(`/study?kind=free&source=today&dirs=both&method=${settings.answerMethod}&limit=50`)} /> : null}
          </>
        )}
      </View>

      {studied || overview.streakDays > 0 ? (
        <View style={styles.progress} accessible accessibilityLabel={[tr('answers', { n: overview.answersToday }), overview.streakDays > 0 ? tr('streak', { n: overview.streakDays }) : ''].join('. ')}>
          <View style={styles.progressRow}>
            <Text style={[typeScale.secondary, styles.flex, { color: t.textDim }]}>
              {[tr('answers', { n: overview.answersToday }), overview.newToday > 0 ? tr('planFresh', { n: overview.newToday }) : ''].filter(Boolean).join(' · ')}
            </Text>
            {overview.streakDays > 0 ? (
              <View style={styles.streak}>
                <Icon name="zap" size={16} color={t.warn} />
                <Text style={[typeScale.caption, { color: t.warn }]}>{tr('streak', { n: overview.streakDays })}</Text>
              </View>
            ) : null}
          </View>
          <Bar value={todo === 0 ? 1 : overview.answersToday / (overview.answersToday + todo * 3)} />
        </View>
      ) : null}

      {grammarDue > 0 ? (
        <ListGroup>
          <ListRow icon="align-left" title={tr('grammarStartReview')} value={tr('exploreGrammarDue', { n: grammarDue })} onPress={() => router.push('/grammar-drill?review=1')} />
        </ListGroup>
      ) : null}

      <SectionHeader title={tr('recentDictionaries')} action={dictionaries.length > 3 ? tr('all') : undefined} onAction={() => router.push('/dictionaries')} />
      <ListGroup>
        {dictionaries.slice(0, 3).map((d) => (
          <ListRow
            key={d.id}
            leading={<View style={[styles.swatch, { backgroundColor: d.color }]} />}
            title={d.name}
            subtitle={tr('words', { n: d.entry_count })}
            value={d.due_count > 0 ? tr('due', { n: d.due_count }) : undefined}
            onPress={() => router.push(`/dictionary/${d.id}`)}
          />
        ))}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { gap: space.sm },
  hero: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  progress: { gap: space.sm, paddingHorizontal: space.xs },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
});
