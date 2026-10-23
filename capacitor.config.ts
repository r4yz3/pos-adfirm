import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.adfirm.micropos', appName: 'POS - For Micro Business', webDir: 'dist',
  backgroundColor: '#FAFCFF',
  android: { backgroundColor: '#FAFCFF' },
  plugins: { CapacitorHttp: { enabled: true } },
};
export default config;
