// The reference (dictionary, grammar, conjugation) as a screen opened from Explore:
// /reference?section=words|grammar|conjugate[&focus=1]. The old /translate tab route stays.
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useT } from '../ui/i18n';
import { ReferenceScreen } from '../ui/ReferenceScreen';

export default function Reference() {
  const tr = useT();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const title = section === 'grammar' ? tr('sectionGrammar') : section === 'conjugate' ? tr('sectionConjugate') : tr('exploreDictionary');
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ReferenceScreen embedded />
    </>
  );
}
