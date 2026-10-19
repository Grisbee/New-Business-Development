// One-shot setup: schema + demo accounts + sample data + app/config.js.
// Usage: node scripts/setup.mjs            (full reset: schema, users, seed)
//        node scripts/setup.mjs users      (only create/update accounts from users.json)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {EVENTS,THREADS,TEAMS,UNI_ITEMS} from './seed-data.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_KEY,DATABASE_URL}=env;
export const EMAIL_DOMAIN='sidequest.test';
const DEFAULT_FOLLOWS=['anglers','surf','cinema'];
// the mockup's "me" becomes a regular seeded person
const ME_STANDIN='alex.m';

const usersFile=path.join(root,'users.json');
if(!fs.existsSync(usersFile)){
  const pw=()=>crypto.randomBytes(4).toString('hex');
  const users=Array.from({length:30},(_,i)=>({username:`guest${String(i+1).padStart(2,'0')}`,password:pw(),tag:'NTUST'}));
  fs.writeFileSync(usersFile,JSON.stringify(users,null,2));
  console.log('Created users.json with 30 guest accounts, edit it and re-run "node scripts/setup.mjs users" if you want other names');
}
const USERS=JSON.parse(fs.readFileSync(usersFile,'utf8'));

const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY,{auth:{persistSession:false}});
const db=new pg.Client({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false}});
await db.connect();

const onlyUsers=process.argv[2]==='users';
if(!onlyUsers){
  await db.query(fs.readFileSync(path.join(import.meta.dirname,'schema.sql'),'utf8'));
  console.log('schema ok');
}

// accounts
const existing=new Map();
for(let page=1;;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
  if(error)throw error;
  data.users.forEach(u=>existing.set(u.email,u.id));
  if(data.users.length<1000)break;
}
for(const u of USERS){
  const email=`${u.username.toLowerCase()}@${EMAIL_DOMAIN}`;
  let id=existing.get(email);
  if(id){
    const {error}=await admin.auth.admin.updateUserById(id,{password:u.password});
    if(error)throw error;
  }else{
    const {data,error}=await admin.auth.admin.createUser({email,password:u.password,email_confirm:true});
    if(error)throw error;
    id=data.user.id;
  }
  await db.query('insert into profiles(id,username,tag) values($1,$2,$3) on conflict(id) do update set username=excluded.username, tag=excluded.tag',[id,u.username,u.tag||'NTUST']);
  for(const t of DEFAULT_FOLLOWS)await db.query('insert into follows(thread_id,user_id) values($1,$2) on conflict do nothing',[t,id]);
}
console.log(`${USERS.length} accounts ok`);

if(!onlyUsers){
  // mockup "today" was 2026-09-28; shift every date so the demo always starts today
  const MOCK_TODAY=Date.UTC(2026,8,28);
  const now=new Date();
  const todayUTC=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const shift=iso=>{const [y,m,d]=iso.split('-').map(Number);const t=new Date(todayUTC+(Date.UTC(y,m-1,d)-MOCK_TODAY));return t.toISOString().slice(0,10);};

  // mockup labels like '13:40', 'Yesterday', 'Mon' become timestamps in the recent past, keeping order
  const DAYS_AGO={Yesterday:1,Sun:2,Sat:3,Fri:4,Thu:5,Wed:5,Tue:6,Mon:6,Today:0};
  const stamp=(label,i,n)=>{
    const ago=DAYS_AGO[label]??(/^\d+:\d+$/.test(label)?0:7);
    return new Date(Date.now()-ago*864e5-(n-i)*6*6e4);
  };
  const who=u=>u==='me'?ME_STANDIN:u;
  const addMsg=(channel,[u,txt,label,host],i,n,payloadOverride)=>{
    const obj=typeof txt==='object';
    return db.query('insert into messages(channel,username,body,payload,is_host,created_at,user_id) values($1,$2,$3,$4,$5,$6,null)',
      [channel,who(u),obj?null:txt,payloadOverride||(obj?txt:null),!!host,stamp(label,i,n)]);
  };

  for(const e of EVENTS){
    await db.query(`insert into events(id,kind,img,thread,tag,date,time,title,place,price,venue,host,host_tag,color,base_going,max,descr,tickets,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,null)`,
      [e.id,e.kind,e.img,e.thread||null,e.tag,shift(e.date),e.time,e.title,e.place,e.price||0,e.venue||null,e.host||null,e.hostTag||null,e.color||null,e.going,e.max||null,e.desc,JSON.stringify((e.tickets||[]).map(([name,note,price])=>({name,note,price})))]);
    for(const [i,m] of e.chat.entries())await addMsg(`event:${e.id}`,m,i,e.chat.length);
  }
  for(const t of THREADS)for(const [i,m] of t.msgs.entries())await addMsg(`thread:${t.id}`,m,i,t.msgs.length);
  for(const t of TEAMS){
    // files that were only listed in the Files tab are stored as hidden file messages
    const inChat=new Set(t.msgs.filter(m=>m[1].file).map(m=>m[1].file[0]));
    for(const [i,f] of t.files.entries())if(!inChat.has(f[0]))
      await addMsg(`team:${t.id}`,[f[3],{file:f.slice(0,3)},f[4]==='Today'?'09:00':f[4]],i,t.files.length,{file:f.slice(0,3),silent:true});
    for(const [i,m] of t.msgs.entries())await addMsg(`team:${t.id}`,m,i,t.msgs.length);
  }
  for(const x of UNI_ITEMS){
    await db.query('insert into uni_items(id,kind,team,course,title,date,time,place,user_id) values($1,$2,$3,$4,$5,$6,$7,$8,null)',
      [x.id,x.kind,x.team||null,x.course,x.title,shift(x.date),x.time,x.place||null]);
  }
  console.log('seed ok');
}

fs.writeFileSync(path.join(root,'app','config.js'),
  `// generated by scripts/setup.mjs, the anon key is public by design (access is enforced by RLS)\nconst SUPABASE_URL=${JSON.stringify(SUPABASE_URL)};\nconst SUPABASE_ANON_KEY=${JSON.stringify(SUPABASE_ANON_KEY)};\nconst EMAIL_DOMAIN=${JSON.stringify(EMAIL_DOMAIN)};\n`);
fs.writeFileSync(path.join(root,'accounts.txt'),USERS.map(u=>`${u.username}\t${u.password}`).join('\n')+'\n');
console.log('app/config.js + accounts.txt written');
await db.end();
