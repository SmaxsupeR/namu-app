// Drill for one grammar topic: type the form, get it checked.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { checkDrill, makeDrill } from '../grammar/drill';
import { topicById } from '../grammar/topics';
import { speakKorean } from '../services/speech';
import { Bar, Body, Btn, Card, Empty, Field, IconBtn, Row, Screen, type InputRef } from '../ui/components';
import { useT } from '../ui/i18n';
import { space, useTheme } from '../ui/theme';

export default function GrammarDrill() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const topic = topicById(id);
  const [round, setRound] = useState(0);
  const tasks = useMemo(() => (topic ? makeDrill(topic, 10) : []), [topic, round]);
  const [i, setI] = useState(0);
  const [given, setGiven] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const [right, setRight] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const input = useRef<InputRef>(null);

  if (!topic || tasks.length === 0) return <Empty icon="book-alert-outline" title={tr('nothingFound')} />;
  const done = i >= tasks.length;
  const task = tasks[Math.min(i, tasks.length - 1)];

  const check = () => {
    if (given.trim() === '' || result !== null) return;
    const ok = checkDrill(task, given);
    setResult(ok);
    if (ok) setRight((n) => n + 1);
    else setMissed((m) => [...m, `${task.base} → ${task.answer}`]);
    speakKorean(task.answer);
  };
  const next = () => {
    setI((n) => n + 1);
    setGiven('');
    setResult(null);
    setTimeout(() => input.current?.focus(), 50);
  };
  const again = () => {
    setRound((r) => r + 1);
    setI(0);
    setRight(0);
    setMissed([]);
    setGiven('');
    setResult(null);
  };

  if (done) {
    return (
      <Screen footer={<Btn icon="refresh" title={tr('grammarAgain')} onPress={again} />}>
        <Stack.Screen options={{ title: topic.pattern }} />
        <Text style={[styles.big, { color: t.text }]}>{tr('grammarScore', { n: right, total: tasks.length })}</Text>
        <Bar value={right / tasks.length} />
        {missed.length ? (
          <Card>
            <Text style={[styles.h, { color: t.text }]}>{tr('grammarReview')}</Text>
            {missed.map((m) => (
              <Text key={m} style={[styles.missed, { color: t.text }]}>
                {m}
              </Text>
            ))}
          </Card>
        ) : null}
        <Btn kind="soft" icon="book-open-variant" title={tr('grammarBackToTopic')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        result === null ? (
          <Btn title={tr('check')} icon="check" disabled={given.trim() === ''} onPress={check} />
        ) : (
          <Btn title={i + 1 < tasks.length ? tr('next') : tr('grammarFinish')} icon="arrow-right" onPress={next} />
        )
      }>
      <Stack.Screen options={{ title: topic.pattern }} />
      <Bar value={i / tasks.length} />
      <Body dim>{tr('grammarTask', { n: i + 1, total: tasks.length })}</Body>
      <Card style={styles.task}>
        <Text style={[styles.base, { color: t.text }]}>{task.base}</Text>
        <Text style={[styles.ru, { color: t.textDim }]}>{task.ru}</Text>
        <Text style={[styles.target, { color: t.primary }]}>+ {task.target}</Text>
      </Card>
      <Field
        ref={input}
        value={given}
        onChangeText={setGiven}
        editable={result === null}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        placeholder={tr('grammarAnswer')}
        onSubmitEditing={result === null ? check : next}
        submitBehavior="submit"
        style={styles.input}
        accessibilityLabel={tr('grammarAnswer')}
      />
      {result !== null ? (
        <Card style={{ borderColor: result ? t.primary : t.danger }}>
          <Row>
            <View style={styles.flex}>
              <Text style={[styles.h, { color: result ? t.primary : t.danger }]}>{result ? tr('correct') : tr('grammarWrong')}</Text>
              <Text style={[styles.answer, { color: t.text }]}>{task.answer}</Text>
            </View>
            <IconBtn name="volume-high" label={tr('listen')} color={t.primary} onPress={() => speakKorean(task.answer)} />
          </Row>
          {!result && topic.rules ? <Body dim>{topic.rules.join(' · ')}</Body> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  task: { alignItems: 'center', paddingVertical: space.lg, gap: 4 },
  base: { fontSize: 32, fontWeight: '700' },
  ru: { fontSize: 15 },
  target: { fontSize: 20, fontWeight: '700', marginTop: space.sm },
  input: { fontSize: 24, textAlign: 'center' },
  h: { fontSize: 16, fontWeight: '700' },
  answer: { fontSize: 22, fontWeight: '600', marginTop: 2 },
  big: { fontSize: 28, fontWeight: '700' },
  missed: { fontSize: 17 },
});
