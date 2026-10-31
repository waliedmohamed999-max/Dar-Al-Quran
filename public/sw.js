// Shows reminders sent while the site is closed. Never plays sound.
self.addEventListener("push", (event) => {
  let data = { title: "دار القرآن الكريم", body: "", url: "/adhkar" };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, dir: "rtl", lang: "ar", tag: "adhkar", silent: true, data: { url: data.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/adhkar", self.location.origin);
  // Only same-origin destinations are opened.
  event.waitUntil(self.clients.openWindow(url.origin === self.location.origin ? url.href : "/adhkar"));
});
