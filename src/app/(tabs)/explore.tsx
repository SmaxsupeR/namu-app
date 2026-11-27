// Explore: every way to practise and every reference in one place. Each row opens a screen
// that already has sensible defaults, so practice starts without configuring anything.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { InkCanvas } from '../../../modules/namu-tts/InkCanvas';
import { getDifficultWords } from '../../db/repo';
import { Icon, Screen, ScreenHeader, Section } from '../../ui/components';
import { useGrammarReview } from '../../ui/grammarUi';
import { useT } from '../../ui/i18n';
import { ListGroup, ListRow } from '../../ui/rows';
import { Text } from '../../ui/Text';
import { radius, size, space, type as typeScale, useTheme } from '../../ui/theme';
import { useLoad } from '../../ui/useLoad';

export default function Explore() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const { data } = useLoad(async (db) => ({ hard: (await getDifficultWords(db, { limit: 200, now: Date.now() })).length }), []);
  const grammar = useGrammarReview();

  return (
    <Screen top>
      <ScreenHeader title={tr('tabExplore')} />

      {/* Looks like a search box; opens the dictionary with the keyboard up (search in two taps). */}
      <Pressable
        onPress={() => router.push('/reference?section=words&focus=1')}
        accessibilityRole="search"
        accessibilityLabel={tr('exploreSearch')}
        style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Icon name="search" size={18} color={t.textDim} />
        <Text style={[typeScale.body, { color: t.textDim }]} numberOfLines={1}>
          {tr('exploreSearch')}
        </Text>
      </Pressable>

      <Section>{tr('explorePractice')}</Section>
      <ListGroup>
        <ListRow icon="play-circle" title={tr('freeTitle')} subtitle={tr('exploreFreeHint')} onPress={() => router.push('/free')} />
        <ListRow icon="layers" title={tr('exploreCards')} subtitle={tr('exploreCardsHint')} onPress={() => router.push('/free?method=self_grade')} />
        <ListRow icon="headphones" title={tr('modeListening')} subtitle={tr('exploreListeningHint')} onPress={() => router.push('/free?prompt=audio')} />
        <ListRow icon="edit-3" title={tr('promptDictation')} subtitle={tr('exploreDictationHint')} onPress={() => router.push('/free?prompt=dictation')} />
        <ListRow
          icon="target"
          title={tr('sourceHard')}
          value={data && data.hard > 0 ? String(data.hard) : undefined}
          subtitle={data && data.hard === 0 ? tr('hardNone') : tr('exploreHardHint')}
          onPress={() => router.push('/free?source=hard')}
        />
      </ListGroup>

      <Section>{tr('exploreReference')}</Section>
      <ListGroup>
        <ListRow icon="book-open" title={tr('exploreDictionary')} subtitle={tr('exploreDictionaryHint')} onPress={() => router.push('/reference?section=words')} />
        <ListRow
          icon="align-left"
          title={tr('sectionGrammar')}
          value={grammar && grammar.due.length > 0 ? tr('exploreGrammarDue', { n: grammar.due.length }) : undefined}
          subtitle={tr('exploreGrammarHint')}
          onPress={() => router.push('/reference?section=grammar')}
        />
        <ListRow icon="git-branch" title={tr('sectionConjugate')} subtitle={tr('exploreConjugateHint')} onPress={() => router.push('/reference?section=conjugate')} />
      </ListGroup>

      {InkCanvas ? (
        <>
          <Section>{tr('exploreExperimental')}</Section>
          <ListGroup>
            <ListRow icon="pen-tool" iconColor={t.textDim} title={tr('modeHandwriting')} subtitle={tr('exploreHandwritingHint')} onPress={() => router.push('/ink-lab')} />
          </ListGroup>
        </>
      ) : null}
      <View style={styles.bottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.touch + 4, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md },
  bottom: { height: space.lg },
});
