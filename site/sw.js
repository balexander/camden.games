// Fact Dash used to be the whole site and kept its offline copy at the top level. This clears that copy and steps aside.
// Each game now keeps its own offline copy inside its own folder.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const k of await caches.keys())if(/^factdash-([1-9]|1[01])$/.test(k))await caches.delete(k);
  await self.registration.unregister();
  for(const c of await self.clients.matchAll({type:'window'}))c.navigate(c.url).catch(()=>{});
})()));
