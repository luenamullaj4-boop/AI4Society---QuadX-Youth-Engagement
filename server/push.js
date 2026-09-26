// Web push through the PWA. Enabled when VAPID keys are configured
// (generate them once with: npx web-push generate-vapid-keys).
export async function createPush(db, { publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT || 'mailto:greenelb@example.org' } = {}) {
  if (!publicKey || !privateKey) return { enabled: false, publicKey: null, send: null };
  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  async function send(notifications) {
    await Promise.all(notifications.map(async (n) => {
      const subs = db.filter('pushSubscriptions', (s) => s.userId === n.userId);
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification(s.subscription, JSON.stringify({ title: n.title, body: n.body, link: n.link }));
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) db.remove('pushSubscriptions', (x) => x.id === s.id);
        }
      }));
    }));
  }
  return { enabled: true, publicKey, send };
}
