import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const folder=fileURLToPath(new URL('../doc/cards/',import.meta.url));
const data=JSON.parse(fs.readFileSync(folder+'data.json','utf8'));
if(!data.records?.length||data.records.some(card=>card.versions.length!==data.lapConfig.max||card.versions.some(v=>!v.bonuses?.length||data.jobs.some(job=>!Number.isInteger(v.scores[job.id])))))throw Error('Card snapshot is incomplete');
const html=fs.readFileSync(folder+'template.html','utf8')
 .replace('<!--CARD_DATA-->',JSON.stringify(data).replaceAll('<','\\u003c'))
 .replace('<!--CARD_SCRIPT-->',fs.readFileSync(folder+'page.js','utf8'));
fs.writeFileSync(folder+'index.html',html);
console.log(`Built card page with ${data.records.length} cards and ${data.lapConfig.max} versions`);
