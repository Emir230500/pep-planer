self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(self.registration.showNotification(data.title || "Arbeitsplan", {
    body: data.body || "Ein neuer Dienstplan ist online.",
    data: { url: data.url || "/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
