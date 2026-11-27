// Listen to the hard words one after another: each word is spoken and shown with its
// meaning, then a pause to repeat it. Nothing is saved: this is listening, not a test.
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { listenGapMs } from '../core/listening';
import { getDifficultWords } from '../db/repo';
import { speakKorean, stopSpeech } from '../services/speech';
import { useApp } from '../state/store';
import { Bar, Body, Btn, Card, Empty, IconBtn, Row, Screen } from '../ui/components';
import { useT } from '../ui/i18n';
import { space, useTheme } from '../ui/theme';
import { useLoad } from '../ui/useLoad';

export default function Listen() {
  const params = useLocalSearchParams<{ dicts?: string }>();
  const dicts = (params.dicts ?? '').split(',').filter(Boolean);
  const t = useTheme();
  const tr = useT();
  const rate = useApp((s) => s.settings.speechRate);
  const { data } = useLoad((db) => getDifficultWords(db, { dictionaryIds: dicts, limit: 100, now: Date.now() }), [params.dicts]);
  const words = data ?? [];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // While playing: speak the current word, then move on after its gap.
  useEffect(() => {
    clear();
    if (!playing || words.length === 0) return;
    const w = words[i];
    speakKorean(w.korean);
    timer.current = setTimeout(() => {
      if (i + 1 < words.length) setI(i + 1);
      else setPlaying(false);
    }, listenGapMs(w.korean, rate));
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i, words.length, rate]);

  useEffect(
    () => () => {
      clear();
      void stopSpeech();
    },
    [],
  );

  if (data && words.length === 0) return <Empty icon="emoticon-happy-outline" title={tr('hardNone')} />;
  const w = words[Math.min(i, Math.max(0, words.length - 1))];
  const go = (n: number) => {
    setI(Math.max(0, Math.min(words.length - 1, n)));
    if (!playing && words[n]) speakKorean(words[n].korean);
  };
  const toggle = () => {
    if (playing) {
      setPlaying(false);
      void stopSpeech();
    } else {
      if (i >= words.length - 1 && words.length > 1) setI(0);
      setPlaying(true);
    }
  };

  return (
    <Screen footer={<Btn icon={playing ? 'pause' : 'play'} title={playing ? tr('listenPause') : tr('listenPlay')} disabled={!w} onPress={toggle} />}>
      <Stack.Screen options={{ title: tr('hardListenAll') }} />
      <Body dim>{tr('hardListenHint')}</Body>
      {w ? (
        <>
          <Bar value={words.length ? (i + 1) / words.length : 0} />
          <Body dim>{tr('listenPosition', { n: i + 1, total: words.length })}</Body>
          <Card style={styles.card}>
            <Text style={[styles.korean, { color: t.text }]}>{w.korean}</Text>
            <Text style={[styles.meaning, { color: t.textDim }]}>{w.meaning ?? ''}</Text>
          </Card>
          <Row style={styles.controls}>
            <IconBtn name="skip-previous" label={tr('listenPrev')} color={t.primary} size={32} onPress={() => go(i - 1)} />
            <IconBtn name="replay" label={tr('listenAgain')} color={t.primary} size={32} onPress={() => speakKorean(w.korean)} />
            <IconBtn name="skip-next" label={tr('listenNext')} color={t.primary} size={32} onPress={() => go(i + 1)} />
          </Row>
        </>
      ) : null}
      <View />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: space.xl, gap: space.sm },
  korean: { fontSize: 40, fontWeight: '700' },
  meaning: { fontSize: 18, textAlign: 'center' },
  controls: { justifyContent: 'center', gap: space.xl },
});
