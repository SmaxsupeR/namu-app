const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBenchmarkService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.POST_NOTIFICATIONS',
    ]) {
      if (!manifest['uses-permission'].some((p) => p.$?.['android:name'] === name)) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    const app = manifest.application[0];
    app.service = app.service || [];
    if (!app.service.some((s) => s.$?.['android:name'] === 'app.namu.onnxtts.TtsBenchmarkService')) {
      app.service.push({
        $: {
          'android:name': 'app.namu.onnxtts.TtsBenchmarkService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
        },
      });
    }
    return config;
  });
};
