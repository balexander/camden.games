// Tiny static server for trying the site locally without accounts: npm start, then open http://127.0.0.1:4318
import http from 'node:http';import {readFile} from 'node:fs/promises';
const root=new URL('./site/',import.meta.url),port=Number(process.env.DASH_PORT)||4318;
const types={html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webmanifest:'application/manifest+json',png:'image/png'};
http.createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/\/$/,'/index.html');
  if(req.method!=='GET'||!/^\/((index\.html|sw\.js|shared\/[\w-]+\.(js|css))|(fact-dash|brain-bricks)\/(index\.html|[\w-]+\.(js|svg)|manifest\.webmanifest|icons\/[\w-]+\.png))$/.test(path)){res.writeHead(404);return res.end('Not found');}
  try{const body=await readFile(new URL('.'+path,root));res.writeHead(200,{'Content-Type':types[path.split('.').pop()],'Cache-Control':'no-cache'});res.end(body);}
  catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`camden.games ready at http://127.0.0.1:${port}`));
