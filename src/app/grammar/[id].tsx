// One grammar topic: explanation, how the form is built, examples, mistakes, drill.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { conjugate } from '../../grammar/conjugate';
import { DRILL_WORDS } from '../../grammar/drill';
import { FORM_LABEL } from '../../grammar/labels';
import { topicById } from '../../grammar/topics';
import { speakKorean } from '../../services/speech';
import { Body, Btn, Card, Chip, Empty, IconBtn, Row, Screen } from '../../ui/components';
import { useT } from '../../ui/i18n';
import { GrammarStatus, useGrammarReview } from '../../ui/grammarUi';
import { space, useTheme } from '../../ui/theme';

export default function GrammarTopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const topic = topicById(id);
  const review = useGrammarReview();
  if (!topic) return <Empty icon="alert-circle" title={tr('nothingFound')} />;

  // A few words in this form, built by the conjugator, as a quick table.
  const drill = topic.drill;
  const samples =
    drill?.kind === 'form'
      ? ['가다', '먹다', '하다', '듣다', '살다', '덥다']
          .map((w) => DRILL_WORDS.find((x) => x.word === w)!)
          .map((w) => ({ w, f: conjugate(w.word, w.kind)?.forms.find((f) => f.id === drill.form)?.text }))
          .filter((x) => x.f && x.f !== x.w.word)
      : [];

  return (
    <Screen footer={drill ? <Btn icon="edit-3" title={tr('grammarPractice')} onPress={() => router.push(`/grammar-drill?id=${topic.id}`)} /> : undefined}>
      <Stack.Screen options={{ title: topic.pattern }} />
      <Text style={[styles.pattern, { color: t.primary }]}>{topic.pattern}</Text>
      <Text style={[styles.title, { color: t.text }]}>{topic.title}</Text>
      <Body dim>{topic.summary}</Body>
      {drill && review ? <GrammarStatus card={review.cards.get(topic.id)} /> : null}
      {topic.body.map((p, i) => (
        <Text key={i} style={[styles.p, { color: t.text }]}>
          {p}
        </Text>
      ))}
      {topic.rules ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{tr('grammarRules')}</Text>
          {topic.rules.map((r, i) => (
            <Text key={i} style={[styles.rule, { color: t.text }]}>
              • {r}
            </Text>
          ))}
        </Card>
      ) : null}
      {samples.length ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{drill?.kind === 'form' ? FORM_LABEL[drill.form] : ''}</Text>
          {samples.map(({ w, f }) => (
            <Row key={w.word} style={styles.sample}>
              <Text style={[styles.sampleBase, { color: t.textDim }]}>{w.word}</Text>
              <Text style={[styles.sampleForm, { color: t.text }]}>→ {f}</Text>
            </Row>
          ))}
        </Card>
      ) : null}
      <Text style={[styles.h, { color: t.text }]}>{tr('examples')}</Text>
      {topic.examples.map((e, i) => (
        <Card key={i} style={styles.example}>
          <Row>
            <View style={styles.flex}>
              <Text style={[styles.ko, { color: t.text }]}>{e.ko}</Text>
              <Text style={[styles.ru, { color: t.textDim }]}>{e.ru}</Text>
            </View>
            <IconBtn name="volume-2" label={tr('listen')} color={t.primary} onPress={() => speakKorean(e.ko)} />
          </Row>
        </Card>
      ))}
      {topic.mistakes ? (
        <Card style={{ borderColor: t.warn }}>
          <Text style={[styles.h, { color: t.text }]}>{tr('grammarMistakes')}</Text>
          {topic.mistakes.map((m, i) => (
            <Text key={i} style={[styles.rule, { color: t.text }]}>
              • {m}
            </Text>
          ))}
        </Card>
      ) : null}
      {topic.related?.length ? (
        <>
          <Text style={[styles.h, { color: t.text }]}>{tr('grammarRelated')}</Text>
          <View style={styles.chips}>
            {topic.related.map((r) => {
              const x = topicById(r);
              return x ? <Chip key={r} label={x.pattern} onPress={() => router.push(`/grammar/${r}`)} /> : null;
            })}
          </View>
        </>
      ) : null}
      {drill?.kind === 'form' ? <Btn kind="ghost" small icon="grid" title={tr('grammarTryOwn')} onPress={() => router.push('/conjugate')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pattern: { fontSize: 22, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '700' },
  p: { fontSize: 16, lineHeight: 24 },
  h: { fontSize: 16, fontWeight: '700' },
  rule: { fontSize: 15, lineHeight: 22 },
  sample: { gap: space.md },
  sampleBase: { fontSize: 16, width: 80 },
  sampleForm: { fontSize: 17, fontWeight: '600' },
  example: { paddingVertical: space.md },
  ko: { fontSize: 18, fontWeight: '600' },
  ru: { fontSize: 14, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
