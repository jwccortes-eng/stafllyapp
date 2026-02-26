import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.staflyapps.app',
  appName: 'STAFLY',
  webDir: 'dist',
  server: {
    url: 'https://8690ef82-5725-4a49-9eac-0cba38acb01f.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
