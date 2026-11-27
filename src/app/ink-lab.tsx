// Handwriting lab (H1): write a Korean word with a finger, see what the model reads and
// whether the answer would be accepted. Attempts are kept on the phone so the acceptance
// threshold can be tuned on the learner's own handwriting; they are sent only by the user.
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { InkCanvas, type InkCanvasRef } from '../../modules/namu-tts/InkCanvas';
import { NamuTts, type InkResult } from '../../modules/namu-tts';
import { getDictionary } from '../dict';
import { DEFAULT_INK_THRESHOLD, inkAccepts, inkLabStats, INK_THRESHOLDS } from '../services/ink';
import { shareTextFile } from '../services/files';
import { addInkAttempt, cancelInk, clearInkAttempts, downloadInk, refreshInk, removeInk, useInk } from '../state/ink';
import { Bar, Body, Btn, Card, Chip, Row, Screen, Section } from '../ui/components';
import { useT } from '../ui/i18n';
import { radius, space, useTheme } from '../ui/theme';

const mb = (b: number) => (b / 1048576).toFixed(1);

interface Target {
  word: string;
  ru: string;
}

async function randomWord(): Promise<Target> {
  const db = await getDictionary();
  const row = await db.getFirstAsync<{ word: string; ru: string | null }>(
    `SELECT w.word, (SELECT ru FROM senses s WHERE s.word_id = w.id ORDER BY n LIMIT 1) AS ru
       FROM words w
      WHERE w.level = 1 AND w.unit = 'word' AND length(w.word) BETWEEN 1 AND 4 AND w.word NOT GLOB '*[^가-힣]*'
      ORDER BY random() LIMIT 1`,
    [],
  );
  return row ? { word: row.word, ru: row.ru ?? '' } : { word: '학교', ru: 'школа' };
}

export default function InkLab() {
  const t = useTheme();
  const tr = useT();
  const { installed, offer, progress, busy, error, attempts } = useInk();
  const canvas = useRef<InkCanvasRef>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [showWord, setShowWord] = useState(true);
  const [intended, setIntended] = useState<'right' | 'wrong'>('right');
  const [threshold, setThreshold] = useState(DEFAULT_INK_THRESHOLD);
  const [strokes, setStrokes] = useState(0);
  const [result, setResult] = useState<InkResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    refreshInk();
    randomWord().then(setTarget).catch(() => setTarget({ word: '학교', ru: 'школа' }));
  }, []);

  const next = useCallback(async () => {
    setResult(null);
    await canvas.current?.clear();
    setTarget(await randomWord());
  }, []);

  const askDownload = () =>
    Alert.alert(tr('inkModelTitle'), tr('inkModelConsent', { mb: offer ? mb(offer.size) : '≈15' }), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('voiceDownload'), onPress: () => downloadInk() },
    ]);

  const check = async () => {
    if (!NamuTts || !installed || !target || !canvas.current || checking) return;
    setChecking(true);
    try {
      const s = await canvas.current.strokes();
      if (s.length === 0) return;
      await NamuTts.inkLoad(installed.dir);
      const r = await NamuTts.inkRecognize(s, target.word, true);
      setResult(r);
      await addInkAttempt({ at: Date.now(), expected: target.word, intended, text: r.text, score: r.score, ms: r.ms, strokes: s });
    } catch (e) {
      Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const share = () => shareTextFile(`namu-ink-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'namu-ink-lab', version: 1, attempts }), 'application/json');
  const askClear = () =>
    Alert.alert(tr('inkClearTitle'), tr('inkClearText', { n: attempts.length }), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('delete'), style: 'destructive', onPress: () => clearInkAttempts() },
    ]);

  const stats = inkLabStats(attempts, threshold);
  const accepted = result && target ? inkAccepts(target.word, result, threshold) : null;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('inkLabTitle') }} />
      <Body dim>{tr('inkLabHint')}</Body>

      {!InkCanvas ? <Body style={{ color: t.warn }}>{tr('inkAndroidOnly')}</Body> : null}

      {InkCanvas && !installed ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{tr('inkModelTitle')}</Text>
          {busy ? (
            <>
              <Body>{tr('voiceProgress', { done: mb(progress?.done ?? 0), total: mb(progress?.total ?? offer?.size ?? 0) })}</Body>
              <Bar value={progress && progress.total ? progress.done / progress.total : 0} />
              <Btn kind="soft" small icon="close" title={tr('cancel')} onPress={cancelInk} />
            </>
          ) : (
            <>
              <Body dim>{tr('inkModelHint')}</Body>
              <Btn icon="download" title={offer ? tr('inkDownloadSize', { mb: mb(offer.size) }) : tr('voiceDownload')} onPress={askDownload} />
            </>
          )}
          {error ? <Body style={{ color: t.danger }}>{error === 'cancelled' ? tr('voiceCancelled') : error === 'no_space' ? tr('voiceErrSpace') : error === 'corrupt' ? tr('voiceErrCorrupt') : tr('voiceErrNetwork')}</Body> : null}
        </Card>
      ) : null}

      {InkCanvas && installed && target ? (
        <>
          <Card style={styles.target}>
            <Text style={[styles.ru, { color: t.textDim }]}>{target.ru}</Text>
            {showWord ? <Text style={[styles.word, { color: t.text }]}>{target.word}</Text> : <Text style={[styles.word, { color: t.textDim }]}>?</Text>}
            <Row style={styles.chips}>
              <Chip label={tr('inkShowWord')} active={showWord} onPress={() => setShowWord((v) => !v)} />
              <Chip label={tr('inkOtherWord')} icon="refresh" onPress={next} />
            </Row>
          </Card>

          <Row style={styles.chips}>
            <Chip label={tr('inkIntendRight')} active={intended === 'right'} onPress={() => setIntended('right')} />
            <Chip label={tr('inkIntendWrong')} active={intended === 'wrong'} onPress={() => setIntended('wrong')} />
          </Row>
          {intended === 'wrong' ? <Body dim>{tr('inkIntendWrongHint')}</Body> : null}

          <View style={[styles.canvasBox, { borderColor: t.border, backgroundColor: t.surface }]}>
            <InkCanvas ref={canvas} style={styles.canvas} inkColor={t.text} onStrokesChanged={(e) => setStrokes(e.nativeEvent.count)} />
          </View>
          <Row style={styles.buttons}>
            <Btn style={styles.flex} kind="soft" small icon="undo" title={tr('inkUndo')} disabled={strokes === 0} onPress={() => canvas.current?.undo()} />
            <Btn style={styles.flex} kind="soft" small icon="eraser" title={tr('inkClear')} disabled={strokes === 0} onPress={() => { setResult(null); canvas.current?.clear(); }} />
          </Row>
          {result ? (
            <Card style={{ borderColor: accepted ? t.primary : t.danger }}>
              <Text style={[styles.h, { color: accepted ? t.primary : t.danger }]}>{accepted ? tr('inkAccepted') : tr('inkRejected')}</Text>
              <Body>{tr('inkRead', { text: result.text || '—' })}</Body>
              <Body dim>{tr('inkScore', { score: result.score === null ? '—' : result.score.toFixed(2), th: threshold, ms: Math.round(result.ms) })}</Body>
              {result.image ? (
                <>
                  <Body dim>{tr('inkModelSees')}</Body>
                  <Image source={{ uri: `data:image/png;base64,${result.image}` }} style={[styles.seen, { aspectRatio: 3 }]} resizeMode="contain" />
                </>
              ) : null}
              <Btn icon="arrow-right" title={tr('next')} onPress={next} />
            </Card>
          ) : (
            <Btn icon="check" title={checking ? tr('inkChecking') : tr('check')} disabled={strokes === 0 || checking} onPress={check} />
          )}

          <Section>{tr('inkThreshold')}</Section>
          <Row style={styles.chips}>
            {INK_THRESHOLDS.map((v) => (
              <Chip key={v} label={v.toFixed(2)} active={threshold === v} onPress={() => setThreshold(v)} />
            ))}
          </Row>
          <Body dim>{tr('inkThresholdHint')}</Body>

          <Section>{tr('inkStats')}</Section>
          <Card>
            <Body>{tr('inkStatRight', { a: stats.rightAccepted, n: stats.right, p: pct(stats.rightAccepted, stats.right) })}</Body>
            <Body>{tr('inkStatWrong', { a: stats.wrongAccepted, n: stats.wrong, p: pct(stats.wrongAccepted, stats.wrong) })}</Body>
            <Body dim>{tr('inkStatExact', { a: stats.exact, n: stats.right, ms: stats.msMedian === null ? '—' : Math.round(stats.msMedian) })}</Body>
            <Row style={styles.buttons}>
              <Btn style={styles.flex} kind="soft" small icon="share-variant" title={tr('inkShare')} disabled={attempts.length === 0} onPress={share} />
              <Btn style={styles.flex} kind="ghost" small icon="delete-outline" title={tr('inkClearAll')} disabled={attempts.length === 0} onPress={askClear} />
            </Row>
            <Body dim>{tr('inkShareHint')}</Body>
          </Card>

          <Btn kind="danger" small icon="delete-outline" title={tr('inkRemoveModel')} onPress={() => removeInk()} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  h: { fontSize: 16, fontWeight: '700' },
  target: { alignItems: 'center', gap: space.xs },
  ru: { fontSize: 16 },
  word: { fontSize: 36, fontWeight: '700' },
  chips: { flexWrap: 'wrap', gap: space.sm },
  canvasBox: { height: 220, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  canvas: { flex: 1 },
  buttons: { gap: space.sm },
  seen: { width: '100%', height: 56, backgroundColor: '#fff', borderRadius: radius.sm },
});
