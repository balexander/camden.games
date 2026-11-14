// Builds the single-file copy of Fact Dash that is published as a Claude artifact: npm run artifact, then publish dist/fact-dash.html.
// The artifact host wraps the page in its own document, so this keeps only what sits between the page markers in
// site/fact-dash/index.html and inlines the two scripts. The app-shell tags (manifest, icons, service worker) are left out.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=f=>readFileSync(new URL('./site/fact-dash/'+f,import.meta.url),'utf8'),html=read('index.html');
const between=(a,b)=>{const m=html.match(new RegExp(`<!--${a}-->([\\s\\S]*?)<!--/${b}-->`));if(!m)throw Error(`Missing <!--${a}--> … <!--/${b}--> markers in site/fact-dash/index.html`);return m[1];};
let body=between('body','body');
for(const f of ['words.js','core.js']){const tag=`<script src="${f}"></script>`;if(!body.includes(tag))throw Error(`site/fact-dash/index.html no longer loads ${f} with ${tag}`);body=body.replace(tag,()=>`<script>\n${read(f)}</script>`);}
mkdirSync(new URL('./dist/',import.meta.url),{recursive:true});
writeFileSync(new URL('./dist/fact-dash.html',import.meta.url),between('page','head')+body);
console.log('Wrote dist/fact-dash.html');
