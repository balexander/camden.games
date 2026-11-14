// Offline support. Bump CACHE whenever the app files change so phones pick up the new version.
const CACHE='factdash-16';
const SHELL=['./','index.html','../shared/srs.js','../shared/words.js','../shared/core.js','../shared/profiles.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Answer from the cache straight away and refresh it in the background, so the app opens instantly and offline.
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url),font=/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(r.method!=='GET'||u.pathname.startsWith('/api/')||(u.origin!==location.origin&&!font))return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(r),net=fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res;});
    if(hit){e.waitUntil(net.catch(()=>{}));return hit;}
    return net;
  }));
});
