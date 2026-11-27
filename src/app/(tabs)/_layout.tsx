import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../ui/components';
import { useT } from '../../ui/i18n';
import { fonts, useTheme } from '../../ui/theme';

export default function TabsLayout() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const icon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => <Icon name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textDim,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.divider, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
        tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.medium },
        sceneStyle: { backgroundColor: t.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: tr('tabToday'), tabBarIcon: icon('sun'), tabBarAccessibilityLabel: tr('tabToday') }} />
      <Tabs.Screen name="dictionaries" options={{ title: tr('tabMyWords'), tabBarIcon: icon('book'), tabBarAccessibilityLabel: tr('tabMyWords') }} />
      <Tabs.Screen name="explore" options={{ title: tr('tabExplore'), tabBarIcon: icon('compass'), tabBarAccessibilityLabel: tr('tabExplore') }} />
      <Tabs.Screen name="progress" options={{ title: tr('tabProgress'), tabBarIcon: icon('bar-chart-2'), tabBarAccessibilityLabel: tr('tabProgress') }} />
      {/* Former tabs, kept as routes for links and deep links: their content now lives in Explore and Settings. */}
      <Tabs.Screen name="translate" options={{ href: null }} />
      <Tabs.Screen name="practice" options={{ href: null }} />
    </Tabs>
  );
}
