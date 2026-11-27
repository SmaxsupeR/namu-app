// Grammar drill: type the form, get it checked. One topic (?id=) or a mixed
// review of the topics that are due (?review=1). Each finished drill is a review
// of the topic's FSRS card; words answered wrong are asked first next time.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { REVIEW_TASKS_PER_TOPIC, REVIEW_TOPICS_PER_SESSION } from '../core/grammarReview';
import { getDb } from '../db';
import { dueGrammarTopics, getGrammarCards, recordGrammarDrill, type GrammarCard } from '../db/grammar';
import { checkDrill, makeDrill, type DrillTask } from '../grammar/drill';
import { topicById, TOPICS, type GrammarTopic } from '../grammar/topics';
import { speakKorean } from '../services/speech';
import { useApp } from '../state/store';
import { Bar, Body, Btn, Card, Empty, Field, IconBtn, Row, Screen, type InputRef } from '../ui/components';
import { useInterval, useT } from '../ui/i18n';
import { space, useTheme } from '../ui/theme';

type Task = DrillTask & { topic: GrammarTopic };

/** Topics that have a drill, by id. */
const DRILLABLE = TOPICS.filter((x) => x.drill).map((x) => x.id);

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Builds the tasks: one topic (10 tasks) or the due topics (a few tasks each, mixed). */
async function buildTasks(id: string | undefined, review: boolean): Promise<Task[]> {
  const db = await getDb();
  const cards = await getGrammarCards(db);
  const first = (topicId: string) => cards.get(topicId)?.missed ?? [];
  if (!review) {
    const topic = topicById(id ?? '');
    return topic ? makeDrill(topic, 10, Math.random, first(topic.id)).map((x) => ({ ...x, topic })) : [];
  }
  const due = (await dueGrammarTopics(db, Date.now(), DRILLABLE)).slice(0, REVIEW_TOPICS_PER_SESSION);
  const tasks: Task[] = [];
  for (const topicId of due) {
    const topic = topicById(topicId)!;
    tasks.push(...makeDrill(topic, REVIEW_TASKS_PER_TOPIC, Math.random, first(topicId)).map((x) => ({ ...x, topic })));
  }
  return shuffle(tasks);
}

interface Tally {
  correct: number;
  total: number;
  wrong: string[];
  right: string[];
}

export default function GrammarDrill() {
  const { id, review } = useLocalSearchParams<{ id?: string; review?: string }>();
  const isReview = review === '1';
  const t = useTheme();
  const tr = useT();
  const interval = useInterval();
  const router = useRouter();
  const retention = useApp((s) => s.settings.retention);
  const touch = useApp((s) => s.touch);
  const [round, setRound] = useState(0);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [i, setI] = useState(0);
  const [given, setGiven] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const [right, setRight] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [tally, setTally] = useState<Record<string, Tally>>({});
  const [scheduled, setScheduled] = useState<GrammarCard[] | null>(null);
  const saved = useRef(-1);
  const input = useRef<InputRef>(null);

  useEffect(() => {
    let alive = true;
    setTasks(null);
    buildTasks(id, isReview)
      .then((x) => alive && setTasks(x))
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, [id, isReview, round]);

  const done = !!tasks && tasks.length > 0 && i >= tasks.length;

  // A finished drill is a review of each topic in it; saved once per round.
  useEffect(() => {
    if (!done || saved.current === round) return;
    saved.current = round;
    (async () => {
      const db = await getDb();
      const now = Date.now();
      const out: GrammarCard[] = [];
      for (const [topicId, x] of Object.entries(tally)) out.push(await recordGrammarDrill(db, { topicId, ...x }, now, retention));
      setScheduled(out);
      touch();
    })().catch(() => setScheduled([]));
  }, [done, round, tally, retention, touch]);

  const title = isReview ? tr('grammarReviewTitle') : (topicById(id ?? '')?.pattern ?? '');
  const byTopic = useMemo(() => new Map(scheduled?.map((c) => [c.topicId, c]) ?? []), [scheduled]);

  if (!tasks) return <Screen><Stack.Screen options={{ title }} /></Screen>;
  if (tasks.length === 0) {
    return isReview ? (
      <Empty icon="check-all" title={tr('grammarNothingDue')} action={<Btn kind="soft" title={tr('finish')} onPress={() => router.back()} />} />
    ) : (
      <Empty icon="book-alert-outline" title={tr('nothingFound')} />
    );
  }
  const task = tasks[Math.min(i, tasks.length - 1)];
  const topic = task.topic;

  const check = () => {
    if (given.trim() === '' || result !== null) return;
    const ok = checkDrill(task, given);
    setResult(ok);
    if (ok) setRight((n) => n + 1);
    else setMissed((m) => [...m, `${task.base} → ${task.answer}`]);
    setTally((all) => {
      const x = all[topic.id] ?? { correct: 0, total: 0, wrong: [], right: [] };
      return { ...all, [topic.id]: { correct: x.correct + (ok ? 1 : 0), total: x.total + 1, wrong: ok ? x.wrong : [...x.wrong, task.base], right: ok ? [...x.right, task.base] : x.right } };
    });
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
    setTally({});
    setScheduled(null);
    setGiven('');
    setResult(null);
  };

  if (done) {
    const now = Date.now();
    return (
      <Screen footer={isReview ? <Btn icon="check" title={tr('finish')} onPress={() => router.back()} /> : <Btn icon="refresh" title={tr('grammarAgain')} onPress={again} />}>
        <Stack.Screen options={{ title }} />
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
        {scheduled && scheduled.length ? (
          <Card>
            <Text style={[styles.h, { color: t.text }]}>{tr('grammarNextReview')}</Text>
            {Object.keys(tally).map((topicId) => {
              const c = byTopic.get(topicId);
              const x = topicById(topicId);
              return c && x ? (
                <Row key={topicId} style={styles.between}>
                  <Text style={[styles.topicName, { color: t.text }]} numberOfLines={1}>
                    {x.pattern}
                  </Text>
                  <Text style={{ color: t.textDim }}>{tr('grammarIn', { t: interval(Math.max(0, c.due - now)) })}</Text>
                </Row>
              ) : null;
            })}
          </Card>
        ) : null}
        {!isReview ? <Btn kind="soft" icon="book-open-variant" title={tr('grammarBackToTopic')} onPress={() => router.back()} /> : null}
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
      <Stack.Screen options={{ title }} />
      <Bar value={i / tasks.length} />
      <Body dim>{tr('grammarTask', { n: i + 1, total: tasks.length })}</Body>
      <Card style={styles.task}>
        <Text style={[styles.base, { color: t.text }]}>{task.base}</Text>
        <Text style={[styles.ru, { color: t.textDim }]}>{task.ru}</Text>
        <Text style={[styles.target, { color: t.primary }]}>+ {task.target}</Text>
        {isReview ? <Text style={[styles.ru, { color: t.textDim }]}>{topic.title}</Text> : null}
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
  between: { justifyContent: 'space-between' },
  topicName: { fontSize: 16, flex: 1 },
});
