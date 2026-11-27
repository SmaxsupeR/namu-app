// "Set from the dictionary": a dictionary of random words from the bundled dictionary,
// with filters, optionally renewed every week.
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../ui/Text';
import type { WordType } from '../core/wordTypes';
import { getDb } from '../db';
import { createAutoDictionary } from '../db/autoDict';
import { getDictionary } from '../dict';
import { countSample, DEFAULT_SAMPLE, SAMPLE_COUNTS, SAMPLE_TYPES, type SampleConfig } from '../dict/sample';
import { topicName, TOP_TOPICS } from '../dict/topics';
import { useApp } from '../state/store';
import { Body, Btn, Card, Chip, Field, Row, Screen, Section } from '../ui/components';
import { LEVEL_LABEL, TYPE_LABEL } from '../ui/dictUi';
import { useT } from '../ui/i18n';
import { space, useTheme } from '../ui/theme';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function DictSample() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const touch = useApp((s) => s.touch);
  const [cfg, setCfg] = useState<SampleConfig>({ ...DEFAULT_SAMPLE });
  const [name, setName] = useState('');
  const [available, setAvailable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SampleConfig>) => setCfg((c) => ({ ...c, ...patch }));

  useEffect(() => {
    let alive = true;
    setAvailable(null);
    getDictionary()
      .then((d) => countSample(d, cfg))
      .then((n) => alive && setAvailable(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cfg]);

  const autoName = cfg.weekly ? tr('sampleNameWeekly') : cfg.topic ? topicName(cfg.topic) : tr('sampleNameRandom');

  const create = async () => {
    setBusy(true);
    try {
      const { id, added } = await createAutoDictionary(await getDb(), await getDictionary(), { name: name.trim() || autoName, config: cfg });
      touch();
      if (added < cfg.count) Alert.alert(tr('sampleTitle'), tr('sampleFewer', { n: added }));
      router.replace(`/dictionary/${id}`);
    } catch (e) {
      Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Btn icon="dice-multiple" title={busy ? tr('samplePicking') : tr('sampleCreate', { n: cfg.count })} disabled={busy || available === 0} onPress={create} />}>
      <Stack.Screen options={{ title: tr('sampleTitle') }} />
      <Body dim>{tr('sampleHint')}</Body>

      <Section>{tr('sampleCount')}</Section>
      <Row style={styles.chips}>
        {SAMPLE_COUNTS.map((n) => (
          <Chip key={n} label={String(n)} active={cfg.count === n} onPress={() => set({ count: n })} />
        ))}
      </Row>

      <Section>{tr('sampleLevel')}</Section>
      <Row style={styles.chips}>
        <Chip label={tr('all')} active={cfg.levels.length === 0} onPress={() => set({ levels: [] })} />
        {[1, 2, 3].map((l) => (
          <Chip key={l} label={tr(LEVEL_LABEL[l])} active={cfg.levels.includes(l)} onPress={() => set({ levels: toggle(cfg.levels, l) })} />
        ))}
      </Row>

      <Section>{tr('sampleTypes')}</Section>
      <Row style={styles.chips}>
        <Chip label={tr('sampleTypesMain')} active={cfg.types.length === 0} onPress={() => set({ types: [] })} />
        {SAMPLE_TYPES.map((ty: WordType) => (
          <Chip key={ty} label={tr(TYPE_LABEL[ty])} active={cfg.types.includes(ty)} onPress={() => set({ types: toggle(cfg.types, ty) })} />
        ))}
      </Row>

      <Section>{tr('sampleTopic')}</Section>
      <Row style={styles.chips}>
        <Chip label={tr('sampleTopicAny')} active={cfg.topic === null} onPress={() => set({ topic: null })} />
        {TOP_TOPICS.map((topic) => (
          <Chip key={topic} label={topicName(topic)} active={cfg.topic === topic} onPress={() => set({ topic: cfg.topic === topic ? null : topic })} />
        ))}
      </Row>

      <Card>
        <Row style={styles.between}>
          <Text style={[styles.label, { color: t.text }]}>{tr('sampleWeekly')}</Text>
          <Switch value={cfg.weekly} onValueChange={(weekly) => set({ weekly })} trackColor={{ true: t.primary }} accessibilityLabel={tr('sampleWeekly')} />
        </Row>
        <Body dim>{tr('sampleWeeklyHint')}</Body>
      </Card>

      <Field label={tr('name')} value={name} onChangeText={setName} placeholder={autoName} maxLength={80} />

      <View style={styles.available}>
        <Body dim>{available === null ? '…' : available < cfg.count ? tr('sampleAvailableFew', { n: available }) : tr('sampleAvailable', { n: available })}</Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexWrap: 'wrap', gap: space.sm },
  between: { justifyContent: 'space-between' },
  label: { fontSize: 16, flex: 1 },
  available: { paddingVertical: space.xs },
});
