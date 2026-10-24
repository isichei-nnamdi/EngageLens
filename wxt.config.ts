import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'EngageLens: Chat Analytics for Google Meet',
    short_name: 'EngageLens',
    description:
      'See who engaged, what was asked and how the room felt. Instant chat analytics after every Google Meet call, 100% on-device.',
    permissions: ['storage'],
    host_permissions: ['https://meet.google.com/*'],
    action: { default_title: 'EngageLens' },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
