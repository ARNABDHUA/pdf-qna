// sw.js — Expense AI Service Worker
// Provides offline shell + caches static assets

const CACHE_NAME = 'expense-ai-v1';

// Assets to pre-cache on install (adjust paths to match your build output)
const PRECACHE_ASSETS = [
  '/',
  '/expenses',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

// ── Install: pre-cache shell assets ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first for API calls, Cache-first for assets ────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network for AI API calls (Anthropic, OpenAI, Groq, Gemini)
  const isApiCall = [
    'api.anthropic.com',
    'api.openai.com',
    'api.groq.com',
    'generativelanguage.googleapis.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ].some(domain => url.hostname.includes(domain));

  if (isApiCall) {
    // Network only — never cache API responses
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    event.request.method === 'GET' &&
    (url.pathname.match(/\.(js|css|png|svg|ico|woff2?|ttf)$/) || url.pathname === '/')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cache a copy for next time
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML navigation (so app always gets latest)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html')
      )
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});


// ADD these two handlers to your existing sw.js

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();          // { title, body, groupId, url }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      tag:     `group-${data.groupId}`,
      renotify: true,
      data:    { url: data.url || '/expenses' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/expenses') && 'focus' in client)
          return client.focus();
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});