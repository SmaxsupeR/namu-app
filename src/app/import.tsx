import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { parseWordList } from '../core/importer';
import { getDictionary } from '../dict';
import { checkSpelling, spellKey, type SpellResult } from '../dict/spell';
import { getDb } from '../db';
import { duplicateKey, findDuplicates, importEntries } from '../db/repo';
import { pickTextFile } from '../services/files';
import { useApp } from '../state/store';
import { Body, Btn, Card, Chip, Field, Row, Screen, Section } from '../ui/components';
import { useT } from '../ui/i18n';
import { useTheme } from '../ui/theme';

const MAX_PREVIEW = 30;

export default function ImportScreen() {
  const { dictionaryId } = useLocalSearchParams<{ dictionaryId: string }>();
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const touch = useApp((s) => s.touch);
  const [text, setText] = useState('');
  const [skip, setSkip] = useState(true);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseWordList(text), [text]);
  const [spell, setSpell] = useState<Map<string, SpellResult>>(new Map());

  // Spelling against the dictionary, a moment after typing stops.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      getDictionary()
        .then((db) => checkSpelling(db, parsed.rows.map((r) => r.korean)))
        .then((m) => alive && setSpell(m))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [parsed]);
  const unknown = useMemo(() => [...spell.entries()].filter(([, r]) => !r.known), [spell]);
  const isUnknown = (korean: string) => spell.get(spellKey(korean))?.known === false;

  /** Replaces a misspelt word everywhere it stands as a whole word in the pasted text. */
  const fix = (word: string, right: string) => {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    setText((cur) => cur.replace(new RegExp(`(^|[^가-힣])([~∼-]?)${esc}(?![가-힣])`, 'gm'), `$1$2${right}`));
  };

  useEffect(() => {
    let alive = true;
    getDb()
      .then((db) => findDuplicates(db, dictionaryId, parsed.rows.map((r) => r.korean)))
      .then((found) => alive && setExisting(found))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [parsed, dictionaryId]);

  // Duplicates are words already in the dictionary, plus repeats inside the pasted list.
  const { fresh, duplicates } = useMemo(() => {
    const seen = new Set<string>();
    const fresh: typeof parsed.rows = [];
    let duplicates = 0;
    for (const row of parsed.rows) {
      const key = duplicateKey(row.korean);
      if (existing.has(key) || seen.has(key)) duplicates++;
      else fresh.push(row);
      seen.add(key);
    }
    return { fresh, duplicates };
  }, [parsed, existing]);

  const toImport = skip ? fresh : parsed.rows;

  const paste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip.trim() === '') Alert.alert(tr('paste'), tr('clipboardEmpty'));
    else setText(clip);
  };

  const pick = async () => {
    try {
      const file = await pickTextFile();
      if (file) setText(file.text);
    } catch {
      Alert.alert(tr('error'), tr('fileError'));
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const n = await importEntries(await getDb(), dictionaryId, toImport);
      touch();
      Alert.alert(tr('importTitle'), tr('imported', { n }));
      router.back();
    } catch (e) {
      Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reason = { too_few_columns: tr('errTooFew'), empty_field: tr('errEmpty'), no_hangul: tr('errNoHangul'), meaning_not_translation: tr('errMeaningNotTranslation'), mixed_korean: tr('errMixedKorean') };

  return (
    <Screen footer={<Btn title={tr('doImport', { n: toImport.length })} disabled={busy || toImport.length === 0} onPress={run} />}>
      <Stack.Screen options={{ title: tr('importTitle') }} />
      <Body dim>{tr('importHelp')}</Body>
      <Row>
        <Btn style={styles.flex} small kind="soft" icon="content-paste" title={tr('paste')} onPress={paste} />
        <Btn style={styles.flex} small kind="soft" icon="file-document-outline" title={tr('pickFile')} onPress={pick} />
      </Row>
      <Field value={text} onChangeText={setText} placeholder={tr('importPlaceholder')} multiline autoCorrect={false} autoCapitalize="none" style={styles.area} />
      {text.trim() !== '' ? (
        <>
          <Section>{tr('preview')}</Section>
          <Card>
            <Text style={[styles.strong, { color: t.text }]}>{tr('importReady', { n: toImport.length })}</Text>
            {duplicates > 0 ? (
              <>
                <Text style={{ color: t.warn }}>{tr('importDuplicates', { n: duplicates })}</Text>
                <Row style={styles.between}>
                  <Text style={{ color: t.text, flex: 1 }}>{tr('skipDuplicates')}</Text>
                  <Switch value={skip} onValueChange={setSkip} trackColor={{ true: t.primary }} accessibilityLabel={tr('skipDuplicates')} />
                </Row>
              </>
            ) : null}
            {unknown.length > 0 ? <Text style={{ color: t.warn }}>{tr('importUnknown', { n: unknown.length })}</Text> : null}
            {parsed.errors.length > 0 ? <Text style={{ color: t.danger }}>{tr('importErrors', { n: parsed.errors.length })}</Text> : null}
            {parsed.errors.slice(0, 10).map((e) => (
              <Text key={e.line} style={[styles.small, { color: t.textDim }]} numberOfLines={1}>
                {`${tr('line', { n: e.line })}: ${reason[e.reason]} — ${e.text}`}
              </Text>
            ))}
          </Card>
          {unknown.length > 0 ? (
            <Card>
              <Text style={[styles.strong, { color: t.text }]}>{tr('importSpellTitle')}</Text>
              <Body dim>{tr('importSpellHint')}</Body>
              {unknown.slice(0, 15).map(([w, r]) => (
                <View key={w} style={styles.spell}>
                  <Text style={[styles.korean, { color: t.warn }]}>{w}</Text>
                  {r.suggestions.length ? (
                    <Row style={styles.wrap}>
                      <Text style={{ color: t.textDim }}>{tr('importSpellMaybe')}</Text>
                      {r.suggestions.map((sug) => (
                        <Chip key={sug} label={`${sug} ✓`} onPress={() => fix(w, sug)} />
                      ))}
                    </Row>
                  ) : (
                    <Text style={{ color: t.textDim }}>{tr('importSpellNone')}</Text>
                  )}
                </View>
              ))}
            </Card>
          ) : null}
          {toImport.slice(0, MAX_PREVIEW).map((r, i) => (
            <View key={i} style={[styles.row, { borderBottomColor: t.border }]}>
              <Text style={[styles.korean, { color: isUnknown(r.korean) ? t.warn : t.text }]}>{isUnknown(r.korean) ? `${r.korean} ?` : r.korean}</Text>
              <Text style={[styles.meaning, { color: t.textDim }]}>{r.meanings.join('; ')}</Text>
            </View>
          ))}
          {toImport.length > MAX_PREVIEW ? <Body dim>{`… +${toImport.length - MAX_PREVIEW}`}</Body> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  area: { minHeight: 140, fontSize: 16 },
  strong: { fontSize: 16, fontWeight: '700' },
  small: { fontSize: 12 },
  between: { justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  korean: { fontSize: 17, fontWeight: '600', flex: 1 },
  meaning: { fontSize: 15, flex: 1.3 },
  spell: { gap: 4, paddingVertical: 4 },
  wrap: { flexWrap: 'wrap', gap: 6, alignItems: 'center' },
});
