// Full conjugation table for a word (opened from a word page or a grammar topic).
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { Screen } from '../ui/components';
import { Conjugator } from '../ui/grammarUi';
import { useT } from '../ui/i18n';

export default function ConjugateScreen() {
  const { word, kind } = useLocalSearchParams<{ word?: string; kind?: string }>();
  const tr = useT();
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('conjugateTitle') }} />
      <Conjugator initial={word ?? ''} initialKind={kind === 'adjective' ? 'adjective' : kind === 'verb' ? 'verb' : undefined} />
    </Screen>
  );
}
