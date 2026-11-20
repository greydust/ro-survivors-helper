import fs from 'node:fs';
const folder=new URL('../doc/jobs/',import.meta.url);
const data=JSON.parse(fs.readFileSync(new URL('data.json',folder),'utf8'));
if(!data.jobs?.length||!data.skills?.length)throw Error('Job snapshot unavailable');
const html=fs.readFileSync(new URL('template.html',folder),'utf8')
  .replace('<!--JOB_DATA-->',JSON.stringify(data).replaceAll('<','\\u003c'))
  .replace('<!--JOB_SCRIPT-->',fs.readFileSync(new URL('page.js',folder),'utf8'));
fs.writeFileSync(new URL('index.html',folder),html);
console.log(`Built job page with ${data.jobs.length} jobs and ${data.skills.length} skills`);
