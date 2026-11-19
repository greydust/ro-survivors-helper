import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const folder=fileURLToPath(new URL('../doc/equipment/',import.meta.url));
const data=JSON.parse(fs.readFileSync(folder+'data.json','utf8'));
if(!data.records?.length||data.records.some(record=>!record.tiers?.length||record.tiers.some(row=>!Array.isArray(row.bonuses))))throw Error('Equipment snapshot is incomplete');
if(!data.jobs?.length||!data.allocations?.length||data.records.some(record=>!Array.isArray(record.jobs)||record.tiers.some(row=>!row.base||record.jobs.some(job=>!Number.isInteger(row.maxGS?.[job]?.gs)||!data.allocations[row.maxGS[job].allocation]))))throw Error('Native equipment GS snapshot is incomplete');
const html=fs.readFileSync(folder+'template.html','utf8')
 .replace('<!--EQUIPMENT_DATA-->',JSON.stringify(data).replaceAll('<','\\u003c'))
 .replace('<!--EQUIPMENT_SCRIPT-->',fs.readFileSync(folder+'page.js','utf8'));
fs.writeFileSync(folder+'index.html',html);
console.log(`Built equipment page with ${data.records.length} records and T${data.maxTier}`);
