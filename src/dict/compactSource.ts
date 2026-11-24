// Where the bundled compact dictionary comes from (Android: a file inside the APK).
export async function compactAssetId(): Promise<number | string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../assets/dict/krdict.db');
}
