/* SideQuest Taipei: the mockup UI, backed by Supabase (auth, data, realtime, file storage) */
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(isoStr,n)=>{const d=parse(isoStr);d.setDate(d.getDate()+n);return iso(d);};
let TODAY=iso(new Date());
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const fmtShort=s=>{const t=parse(s);return `${t.getDate()} ${MON[t.getMonth()]} (${DOW[t.getDay()]})`;};
// Monday-based week
const weekStart=s=>{const d=parse(s);return addDays(s,-((d.getDay()+6)%7));};

/* ---------- static catalogue (communities, teams, fake crowd) ---------- */
const PEOPLE=[['marco.it','Exchange · NTU'],['jess_au','Expat · Da’an'],['yuki_ex','Exchange · NTUST'],['daniel.h','NTU · local'],['nina.b','Expat · Zhongshan'],['felix_k','Exchange · NTU'],['hana.j','NTUST · local'],['sam.uk','Expat · Xinyi'],['leo.fr','Exchange · NCCU'],['amy_run','NTU · local'],['wen.c','NTU · local']];
const THREADS=[
  {id:'anglers',name:'Taipei Anglers',icon:'fish',color:'#8FC1E3',tag:'Outdoors',base:1284,online:37},
  {id:'surf',name:'Surf North Coast',icon:'wave',color:'#7FD1C1',tag:'Sports',base:2310,online:64},
  {id:'cinema',name:'Taipei Cinephiles',icon:'film',color:'#E8A0BF',tag:'Culture',base:980,online:21},
  {id:'runners',name:'Riverside Runners',icon:'run',color:'#F0C987',tag:'Sports',base:1542,online:18},
  {id:'boulder',name:'Bouldering Taipei',icon:'mountain',color:'#C9B6F2',tag:'Sports',base:870,online:12},
  {id:'nightmarket',name:'Night Market Hunters',icon:'bowl',color:'#F2A488',tag:'Food',base:3120,online:88},
  {id:'film',name:'Film Photography TPE',icon:'camera',color:'#B8D8A8',tag:'Culture',base:640,online:9},
  {id:'mandarin',name:'Mandarin Survival Club',icon:'lang',color:'#9CCBB1',tag:'Language',base:4205,online:103},
  {id:'jazz',name:'Live Music Taipei',icon:'music',color:'#E8A0BF',tag:'Music',base:1860,online:41},
  {id:'guitar',name:'Guitar & Jam Buddies',icon:'music',color:'#F0C987',tag:'Music',base:520,online:8},
  {id:'afterdark',name:'Taipei After Dark',icon:'moon',color:'#C9B6F2',tag:'Nightlife',base:2740,online:95},
  {id:'gamers',name:'Taipei Gamers',icon:'game',color:'#8FC1E3',tag:'Gaming',base:1390,online:57},
  {id:'tech',name:'Tech & Startups TPE',icon:'code',color:'#7FD1C1',tag:'Tech',base:980,online:22},
  {id:'yoga',name:'Yoga & Wellness',icon:'leaf',color:'#B8D8A8',tag:'Wellness',base:760,online:11},
  {id:'sketch',name:'Urban Sketchers Taipei',icon:'palette',color:'#F2A488',tag:'Art',base:430,online:6},
  {id:'dogs',name:'Taipei Dog Owners',icon:'paw',color:'#F0C987',tag:'Pets',base:1120,online:19},
  {id:'trips',name:'Weekend Trips Taiwan',icon:'plane',color:'#7FD1C1',tag:'Travel',base:3380,online:72}
];
THREADS.forEach(t=>Object.assign(t,{msgs:[],members:t.base,followed:false,unread:0,time:''}));
const COURSES={ME3021:'Machine Design II',BA2104:'Marketing Strategy',MGT5012:'New Business Development',CHN102:'Mandarin 102'};
const TEAMS=[
  {id:'nbd',name:'SideQuest team',course:'MGT5012',icon:'bulb',color:'#F0C987',members:['mei_t','daniel.h','yuki_ex']},
  {id:'md2',name:'Machine Design II — Group 4',course:'ME3021',icon:'gear',color:'#8FC1E3',members:['felix_k','hana.j','wen.c']},
  {id:'mkt',name:'Marketing case study',course:'BA2104',icon:'chart',color:'#E8A0BF',members:['sofia.r','leo.fr','amy_run']},
  {id:'chn',name:'Mandarin 102 study group',course:'CHN102',icon:'lang',color:'#9CCBB1',members:['chenyu','sam.uk','nina.b']}
];
TEAMS.forEach(t=>Object.assign(t,{msgs:[],files:[],unread:0,time:''}));
let EVENTS=[],UNI_ITEMS=[];
let ME=null;

const TABS=[
  {id:'public',label:'Public',icon:'ticket'},
  {id:'community',label:'Community',icon:'users'},
  {id:'threads',label:'Threads',icon:'chat'},
  {id:'calendar',label:'Calendar',icon:'calendar'},
  {id:'mine',label:'My events',icon:'star'}
];
const TAGS={
  public:['Clubs','Live Music','Festivals','Bars','Food'],
  community:['Sports','Trips','Outdoors','Culture','Language','Games'],
  threads:['Outdoors','Sports','Music','Nightlife','Food','Travel','Culture','Art','Language','Gaming','Tech','Wellness','Pets']
};
const mins=t=>{const m=/(\d+):(\d+)\s*(AM|PM)/.exec(t);return m?(+m[1]%12+(m[3]==='PM'?12:0))*60+ +m[2]:0;};
const byDate=(a,b)=>a.date.localeCompare(b.date)||mins(a.time)-mins(b.time);

const state={
  tab:'public',
  tag:{public:null,community:null,threads:null},
  panel:{public:null,community:null,threads:null},
  q:{public:'',community:'',threads:''},
  going:new Set(),
  threadSeg:'mine',
  mineFilter:'all',
  calDay:TODAY,
  calMonth:TODAY.slice(0,7),
  detail:null,
  ticket:{tier:0,qty:1},
  bought:{},
  range:{public:null,community:null},
  chatTab:'chat',
  uni:false,
  uniDay:TODAY,
  uniMonth:TODAY.slice(0,7),
  teamTab:'chat',
  sheet:null,
  creating:false,
  chat:null
};

const view=document.getElementById('view');
const nav=document.getElementById('nav');
const fab=document.getElementById('fab');
const chat=document.getElementById('chat');
const detail=document.getElementById('detail');
const toastEl=document.getElementById('toast');

let toastTimer;
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1900);}
function fail(error){console.error(error);toast(error.message||'Something went wrong, try again');}

const ev=id=>EVENTS.find(e=>e.id===id);
const goingCount=e=>e.going;
const isFull=e=>e.kind==='community'&&!state.going.has(e.id)&&e.max&&e.going>=e.max;
const priceLabel=p=>p===0?'Free':`NT$${p.toLocaleString('en-US')}`;

/* ---------- time labels + unread ---------- */
const hhmm=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
function timeLabel(ts){
  const d=new Date(ts),day=iso(d),diff=Math.round((parse(TODAY)-parse(day))/864e5);
  if(diff<=0)return hhmm(d);
  if(diff===1)return 'Yesterday';
  if(diff<7)return DOW[d.getDay()];
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
function dayLabel(ts){
  const d=new Date(ts),diff=Math.round((parse(TODAY)-parse(iso(d)))/864e5);
  return diff<=0?'TODAY':diff===1?'YESTERDAY':`${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`.toUpperCase();
}
// last-read timestamps per chat live in this browser only; channels never opened count from first login
const SEEN_KEY=()=>`sq_seen_${ME.id}`;
let seen={};
function loadSeen(){
  try{seen=JSON.parse(localStorage.getItem(SEEN_KEY())||'{}');}catch(e){seen={};}
  if(!seen._first){seen._first=new Date().toISOString();saveSeen();}
}
function saveSeen(){try{localStorage.setItem(SEEN_KEY(),JSON.stringify(seen));}catch(e){}}
function markSeen(channel){seen[channel]=new Date().toISOString();saveSeen();}
const unreadOf=(channel,raw)=>raw.filter(m=>m.username!==ME.username&&!m.payload?.silent&&m.created_at>(seen[channel]||seen._first)).length;

/* ---------- data ---------- */
async function load(){
  const [evs,att,fol,msgs,uni]=await Promise.all([
    sb.from('events').select('*'),
    sb.from('attendance').select('event_id,user_id,tier,qty,profiles(username,tag)'),
    sb.from('follows').select('thread_id,user_id'),
    sb.from('messages').select('*').order('created_at').limit(10000),
    sb.from('uni_items').select('*')
  ]);
  for(const r of [evs,att,fol,msgs,uni])if(r.error)throw r.error;
  TODAY=iso(new Date());

  const byChannel={};
  msgs.data.forEach(m=>(byChannel[m.channel]||=[]).push(m));
  const tuples=raw=>raw.filter(m=>!m.payload?.silent).map(m=>[m.username===ME.username?'me':m.username,m.body??m.payload,timeLabel(m.created_at),m.is_host,dayLabel(m.created_at)]);

  state.going=new Set();state.bought={};
  const attBy={};
  att.data.forEach(a=>{
    (attBy[a.event_id]||=[]).push(a);
    if(a.user_id===ME.id){state.going.add(a.event_id);if(a.tier!=null)state.bought[a.event_id]={tier:a.tier,qty:a.qty};}
  });
  EVENTS=evs.data.map(r=>{
    const real=attBy[r.id]||[],ch=`event:${r.id}`,raw=byChannel[ch]||[];
    return {id:r.id,kind:r.kind,img:r.img,thread:r.thread,tag:r.tag,date:r.date,time:r.time,title:r.title,place:r.place,price:r.price||0,venue:r.venue,
      host:r.host||'',hostTag:r.host_tag||'',color:r.color||'#F0A93E',base:r.base_going,max:r.max,desc:r.descr||'',createdBy:r.created_by,mine:r.created_by===ME.id,
      tickets:(r.tickets||[]).map(t=>[t.name,t.note,t.price]),
      going:r.base_going+real.length,
      attendees:real.filter(a=>a.user_id!==r.created_by).map(a=>[a.user_id===ME.id?'You':a.profiles?.username||'guest',a.user_id===ME.id?'':a.profiles?.tag||'',a.user_id===ME.id?'me':'']),
      chat:tuples(raw),unread:state.going.has(r.id)?unreadOf(ch,raw):0};
  });
  const followCount={};
  fol.data.forEach(f=>{followCount[f.thread_id]=(followCount[f.thread_id]||0)+1;});
  const myFollows=new Set(fol.data.filter(f=>f.user_id===ME.id).map(f=>f.thread_id));
  THREADS.forEach(t=>{
    const ch=`thread:${t.id}`,raw=byChannel[ch]||[];
    Object.assign(t,{msgs:tuples(raw),members:t.base+(followCount[t.id]||0),followed:myFollows.has(t.id),
      unread:myFollows.has(t.id)?unreadOf(ch,raw):0,time:raw.length?timeLabel(raw[raw.length-1].created_at):'',last:raw.length?raw[raw.length-1].created_at:''});
  });
  TEAMS.forEach(t=>{
    const ch=`team:${t.id}`,raw=byChannel[ch]||[];
    const shown=raw.filter(m=>!m.payload?.silent);
    Object.assign(t,{msgs:tuples(raw),unread:unreadOf(ch,raw),time:shown.length?timeLabel(shown[shown.length-1].created_at):'',
      files:raw.filter(m=>m.payload?.file).reverse().map(m=>{const [n,ext,size,url]=m.payload.file;return [n,ext,size,m.username===ME.username?'me':m.username,timeLabel(m.created_at),url];})});
  });
  UNI_ITEMS=uni.data.map(x=>({id:x.id,kind:x.kind,team:x.team,course:x.course,title:x.title,date:x.date,time:x.time,place:x.place}));
}

// re-render without losing what the user is typing
function refreshUI(){
  const a=document.activeElement,id=a&&a.id,start=a&&a.selectionStart,end=a&&a.selectionEnd;
  const draft=document.getElementById('chat-input')?.value;
  render();
  if(state.chat&&!state.creating)renderChat();
  const ci=document.getElementById('chat-input');if(ci&&draft)ci.value=draft;
  const f=id&&document.getElementById(id);
  if(f&&f!==document.activeElement){f.focus();try{f.setSelectionRange(start,end);}catch(e){}}
}
let reloadTimer;
function scheduleReload(){clearTimeout(reloadTimer);reloadTimer=setTimeout(reload,150);}
async function reload(){
  try{
    await load();
    // whatever arrives in the open chat is read already
    if(state.chat){
      markSeen(channelOf(state.chat));
      const c=state.chat,o=c.type==='thread'?THREADS.find(x=>x.id===c.id):c.type==='team'?team(c.id):ev(c.id);
      if(o)o.unread=0;
    }
    refreshUI();
  }catch(e){fail(e);}
}
const channelOf=c=>`${c.type}:${c.id}`;

/* ---------- tags + sort ---------- */
const PLACEHOLDER={public:'Search events or venues',community:'Search events',threads:'Search communities'};
function toolbar(key){
  const p=state.panel[key],tag=state.tag[key];
  let panel='';
  if(p==='tags')panel=`<div class="panel"><span class="panel-label">Filter by tag</span><div class="panel-chips">${['All',...TAGS[key]].map(t=>`<button class="chip${(tag||'All')===t?' active':''}" data-tag="${key}" data-val="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  const hasDates=key in state.range,r=state.range[key];
  if(p==='dates'){
    const cur=r?`${r.from}|${r.to}`:'|';
    panel=`<div class="panel"><span class="panel-label">When</span>
      <div class="panel-chips">${presets().map(([l,v])=>`<button class="chip${cur===v?' active':''}" data-preset="${key}" data-val="${v}">${l}</button>`).join('')}</div>
      <div class="row2"><label class="field">From<input type="date" data-range="${key}" data-end="from" min="${TODAY}" value="${r?r.from:''}"></label><label class="field">To<input type="date" data-range="${key}" data-end="to" min="${TODAY}" value="${r?r.to:''}"></label></div>
    </div>`;
  }
  const pills=[];
  if(tag&&!p)pills.push(`<button data-tag="${key}" data-val="All" aria-label="Clear tag ${esc(tag)}">${esc(tag)} ${ic('x',12,2.6)}</button>`);
  if(r&&!p)pills.push(`<button data-preset="${key}" data-val="|" aria-label="Clear dates">${dm(r.from)} – ${dm(r.to)} ${ic('x',12,2.6)}</button>`);
  const active=pills.length?`<div class="active-filter">Showing ${pills.join('')}</div>`:'';
  return `<div class="toolbar">
    <label class="searchbox">${ic('search',16)}<input id="search-${key}" data-search="${key}" type="search" autocomplete="off" placeholder="${PLACEHOLDER[key]}" value="${esc(state.q[key])}"></label>
    <button class="tbtn${p==='tags'?' open':''}${tag?' set':''}" data-panel="${key}" data-val="tags" aria-label="Tags">${ic('tag',18)}</button>
    ${hasDates?`<button class="tbtn${p==='dates'?' open':''}${r?' set':''}" data-panel="${key}" data-val="dates" aria-label="Dates">${ic('calendar',18)}</button>`:''}
  </div>${panel}${active}`;
}
function presets(){
  const mon=weekStart(TODAY),sat=addDays(mon,5),sun=addDays(mon,6);
  return [['Any time','|'],['This week',`${TODAY}|${sun}`],['This weekend',`${TODAY>sat?TODAY:sat}|${sun}`],['Next week',`${addDays(mon,7)}|${addDays(mon,13)}`]];
}
const dm=s=>{const [,m,d]=s.split('-');return `${d}.${m}`;};
function applyTS(key,items){
  const tag=state.tag[key],q=state.q[key].trim().toLowerCase(),r=state.range[key];
  const hay=x=>[x.title,x.name,x.place,x.tag,x.host].filter(Boolean).join(' ').toLowerCase();
  const cmp=key==='threads'?(a,b)=>b.online-a.online:byDate;
  return items.filter(x=>(!tag||x.tag===tag)&&(!q||hay(x).includes(q))&&(!r||(x.date>=r.from&&x.date<=r.to))).slice().sort(cmp);
}
const noResults=`<div class="empty">No matches. Try another word, tag or date range.</div>`;
// past events drop out of the browse lists but stay in the calendar and My events
const upcoming=e=>e.date>=TODAY;

const threadOf=e=>THREADS.find(t=>t.id===e.thread)||{color:e.color||'var(--ink-3)',icon:'users',name:''};
// events created in a thread have no photo, so they borrow the thread's icon tile
function thumb(e,cls){
  if(e.img)return `<img class="${cls}" src="${IMG[e.img]}" alt="">`;
  const t=threadOf(e);
  return `<span class="${cls} ph" style="background:${t.color}">${ic(t.icon,24,2)}</span>`;
}
const datebox=e=>{const t=parse(e.date);return `<div class="datebox"><div class="dow">${DOW[t.getDay()].toUpperCase()}</div><div class="dnum">${t.getDate()}</div><div class="mon">${MON[t.getMonth()]}</div></div>`;};

function actionButtons(e){
  const on=state.going.has(e.id);
  if(on)return `<button class="chatbtn" data-chat-event="${e.id}" aria-label="Open event chat">${ic('chat',18)}${e.unread?`<span class="badge">${e.unread}</span>`:''}</button><button class="btn on" data-join="${e.id}">✓ Going</button>`;
  if(isFull(e))return `<button class="btn" data-join="${e.id}">Waitlist</button>`;
  if(e.tickets&&e.tickets.length)return `<button class="btn primary" data-detail="${e.id}">Tickets</button>`;
  return `<button class="btn primary" data-join="${e.id}">Join</button>`;
}

function renderPublic(){
  return `<div class="tab-head"><h1>Public events</h1></div>${toolbar('public')}<div class="list" id="results">${listPublic()}</div>`;
}
function listPublic(){
  const items=applyTS('public',EVENTS.filter(e=>e.kind==='public'&&upcoming(e)));
  return `${items.length?'':noResults}
    ${items.map(e=>`
    <article class="card has-img" data-detail="${e.id}">
      <div class="banner" style="background-image:url(${IMG[e.img]})">${datebox(e)}</div>
      <div class="card-top"><div class="card-main">
        <h3>${esc(e.title)}</h3>
        <div class="sub">${esc(e.place)} · ${esc(e.time)}</div>
      </div></div>
      <div class="card-foot"><span class="price">${priceLabel(e.price)}</span><span class="muted">· ${goingCount(e)} going</span><span class="spacer"></span>${actionButtons(e)}</div>
    </article>`).join('')}
    <button class="promo" data-demo>Run a venue in Taipei? <b>List an event →</b></button>`;
}

function renderCommunity(){
  return `<div class="tab-head"><h1>Community events</h1></div>${toolbar('community')}<div class="list" id="results">${listCommunity()}</div>`;
}
function listCommunity(){
  const items=applyTS('community',EVENTS.filter(e=>e.kind==='community'&&upcoming(e)));
  return `${items.length?'':noResults}
    ${items.map(e=>`
    <article class="card" data-detail="${e.id}">
      <div class="card-top">${thumb(e,'thumb')}
        <div class="card-main">
          <div class="when">${fmtShort(e.date)} · ${esc(e.time)}</div>
          <h3>${esc(e.title)}</h3>
          <div class="sub">${esc(e.place)}</div>
        </div>
      </div>
      <div class="card-foot">
        <span class="avatar" style="background:${e.color}" title="${esc(e.host)}">${esc(e.host.slice(0,2).toUpperCase())}</span>
        <span class="muted">${isFull(e)?'Full':e.max?`${Math.min(goingCount(e),e.max)} of ${e.max} going`:`${goingCount(e)} going`}</span>
        <span class="spacer"></span>${actionButtons(e)}
      </div>
    </article>`).join('')}`;
}

/* ---------- threads ---------- */
function lastMsg(msgs){
  const m=msgs[msgs.length-1];if(!m)return '<i>No messages yet</i>';
  let txt;
  if(typeof m[1]!=='object')txt=esc(m[1]);
  else if(m[1].event)txt=`posted an event · ${esc(ev(m[1].event)?.title||'')}`;
  else if(m[1].file)txt=`shared ${esc(m[1].file[0])}`;
  else txt=`added a deadline · ${esc(item(m[1].deadline)?.title||'')}`;
  return `<b>${m[0]==='me'?'You':esc(m[0])}:</b> ${txt}`;
}
function threadRow(t,mode){
  const right=mode==='mine'
    ?`<div class="side"><span class="time">${esc(t.time)}</span>${t.unread?`<span class="badge">${t.unread}</span>`:'<span style="height:20px"></span>'}</div>`
    :`<span class="follow${t.followed?' on':''}" role="button" tabindex="0" data-follow="${t.id}">${t.followed?'Following':'Follow'}</span>`;
  return `<button class="thread" data-open="${t.id}">
    <span class="thread-icon" style="background:${t.color}">${ic(t.icon,22,2)}</span>
    <span class="thread-body">
      <span class="thread-name">${esc(t.name)}</span>
      <span class="preview">${mode==='mine'?lastMsg(t.msgs):`${t.members.toLocaleString('en-US')} members · ${t.online} online`}</span>
    </span>
    ${right}
  </button>`;
}
function renderThreads(){
  const unread=THREADS.filter(t=>t.followed&&t.unread).length;
  const seg=`<div class="seg">
    <button class="${state.threadSeg==='mine'?'active':''}" data-seg="mine">My threads${unread?`<span class="badge">${unread}</span>`:''}</button>
    <button class="${state.threadSeg==='explore'?'active':''}" data-seg="explore">Explore</button>
  </div>`;
  if(state.threadSeg==='explore')
    return `<div class="tab-head"><h1>Threads</h1></div>${seg}${toolbar('threads')}<div class="list rows" id="results">${listThreads()}</div>`;
  const mine=THREADS.filter(t=>t.followed).sort((a,b)=>(b.unread>0)-(a.unread>0)||b.last.localeCompare(a.last));
  const body=mine.length===0?`<div class="empty">You don’t follow any communities yet.<br>Open <b>Explore</b> and tap <b>Follow</b> on the ones you like.</div>`
    :mine.map(t=>threadRow(t,'mine')).join('');
  return `<div class="tab-head"><h1>Threads</h1></div>${seg}<div class="list rows">${body}</div>`;
}
function listThreads(){
  const items=applyTS('threads',THREADS);
  return items.length?items.map(t=>threadRow(t,'all')).join(''):noResults;
}
const LISTS={public:listPublic,community:listCommunity,threads:listThreads};

/* ---------- compact event row ---------- */
function erow(e,{showDate=true}={}){
  const on=state.going.has(e.id);
  const act=on
    ?`<button class="chatbtn" data-chat-event="${e.id}" aria-label="Open event chat">${ic('chat',18)}${e.unread?`<span class="badge">${e.unread}</span>`:''}</button>`
    :(isFull(e)?`<button class="btn" data-join="${e.id}">Waitlist</button>`
      :(e.tickets&&e.tickets.length?`<button class="btn primary" data-detail="${e.id}">Tickets</button>`:`<button class="btn primary" data-join="${e.id}">Join</button>`));
  return `<div class="erow" data-detail="${e.id}">${thumb(e,'eimg')}
    <div class="body">
      <span class="w">${showDate?fmtShort(e.date)+' · ':''}${esc(e.time)}</span>
      <span class="t">${esc(e.title)}</span>
      <span class="kind"><i class="kdot ${e.kind}"></i>${e.kind==='public'?'Public':'Community'} · ${esc(e.place)}</span>
    </div>${act}</div>`;
}

/* ---------- calendar ---------- */
// 6-week grid for the month in `ym` (YYYY-MM), starting on a Monday
function monthGrid(ym,dayKey,selDay,itemsOn,dotClass){
  const first=`${ym}-01`,start=weekStart(first),month=+ym.slice(5)-1;
  const cells=[];
  for(let i=0;i<42;i++){
    const d=addDays(start,i),its=itemsOn(d);
    if(i===35&&parse(d).getMonth()!==month)break;
    cells.push(`<button class="day${parse(d).getMonth()!==month?' out':''}${d===TODAY?' today':''}${d===selDay?' sel':''}" data-${dayKey}="${d}" aria-label="${fmtShort(d)}, ${its.length} items">
      ${parse(d).getDate()}<span class="dots">${its.slice(0,3).map(dotClass).join('')}</span></button>`);
  }
  return cells.join('');
}
const shiftMonth=(ym,n)=>{const d=new Date(+ym.slice(0,4),+ym.slice(5)-1+n,1);return iso(d).slice(0,7);};
const monthHead=(ym,key)=>`<div class="mnav"><button class="icon-btn" data-month="${key}" data-val="-1" aria-label="Previous month"><span style="display:flex">${ic('back',18,2.2)}</span></button><b>${MONTHS[+ym.slice(5)-1]} ${ym.slice(0,4)}</b><button class="icon-btn" data-month="${key}" data-val="1" aria-label="Next month">${ic('next',18,2.2)}</button></div>`;

function renderCalendar(){
  const cells=monthGrid(state.calMonth,'day',state.calDay,d=>EVENTS.filter(e=>e.date===d).sort(byDate),e=>`<i class="${e.kind}${state.going.has(e.id)?' going':''}"></i>`);
  const sel=parse(state.calDay);
  const dayEvents=EVENTS.filter(e=>e.date===state.calDay).sort(byDate);
  return `<div class="tab-head"><h1>Calendar</h1></div>
  <div class="cal">
    <div class="cal-head">${monthHead(state.calMonth,'calMonth')}<div class="legend"><span><i class="kdot public"></i>Public</span><span><i class="kdot community"></i>Community</span></div></div>
    <div class="cal-grid">${['M','T','W','T','F','S','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
  </div>
  <div class="list" style="gap:0">
    <div class="dayhead">${DAYS[sel.getDay()]}, ${sel.getDate()} ${MON[sel.getMonth()]}</div>
    ${dayEvents.length?dayEvents.map(e=>erow(e,{showDate:false})).join(''):`<div class="empty" style="padding:24px 0">Nothing planned this day yet.</div>`}
  </div>`;
}

/* ---------- mine ---------- */
function renderMine(){
  const f=state.mineFilter;
  const seg=`<div class="seg">${[['all','All'],['public','Public'],['community','Community']].map(([k,l])=>`<button class="${f===k?'active':''}" data-mseg="${k}">${l}</button>`).join('')}</div>`;
  const mine=EVENTS.filter(e=>state.going.has(e.id)&&(f==='all'||e.kind===f)&&upcoming(e)).sort(byDate);
  const sun=addDays(weekStart(TODAY),6);
  const week=mine.filter(e=>e.date<=sun),later=mine.filter(e=>e.date>sun);
  const empty={all:'You haven’t joined any events yet.',public:'No public events yet. Get tickets in the <b>Public</b> tab.',community:'No community events yet. Tap <b>Join</b> in the <b>Community</b> tab.'}[f];
  const body=mine.length===0?`<div class="empty">${empty}<br>Joined events and their group chats show up here.</div>`
    :`${week.length?`<div class="section-label">This week</div>${week.map(e=>erow(e)).join('')}`:''}${later.length?`<div class="section-label">Later</div>${later.map(e=>erow(e)).join('')}`:''}`;
  return `<div class="tab-head"><h1>My events</h1></div>${seg}<div class="list rows">${body}</div>`;
}

function renderNav(){
  const badge={
    threads:THREADS.filter(t=>t.followed).reduce((a,t)=>a+t.unread,0),
    mine:EVENTS.filter(e=>state.going.has(e.id)).reduce((a,e)=>a+(e.unread||0),0),
    teams:TEAMS.reduce((a,t)=>a+t.unread,0)
  };
  nav.innerHTML=(state.uni?UNI_TABS:TABS).map(t=>`<button class="${state.tab===t.id?'active':''}" data-tab="${t.id}" aria-label="${t.label}">${ic(t.icon,22,1.9)}${t.label}${badge[t.id]?`<span class="nbadge">${badge[t.id]}</span>`:''}</button>`).join('');
}

function render(){
  if(!ME)return;
  const r={public:renderPublic,community:renderCommunity,threads:renderThreads,calendar:renderCalendar,mine:renderMine,teams:renderTeams,ucal:renderUniCalendar}[state.tab];
  view.innerHTML=r();
  fab.hidden=!['public','community','ucal'].includes(state.tab);
  renderNav();
  if(state.detail)renderDetail();
}
function setTab(id){state.tab=id;view.scrollTop=0;render();try{history.replaceState(null,'','#'+id);}catch(e){}}

/* ---------- event detail ---------- */
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const fmtLong=s=>{const t=parse(s);return `${DAYS[t.getDay()]}, ${t.getDate()} ${MON[t.getMonth()]}`;};

function attendees(e){
  // the seeded crowd fills the base count, real accounts that joined come after
  const n=[...e.id].reduce((a,c)=>a+c.charCodeAt(0),0)%PEOPLE.length;
  const fake=Math.max(0,(e.max?Math.min(e.base,e.max):e.base)-1);
  const others=[...PEOPLE.slice(n),...PEOPLE.slice(0,n)].slice(0,fake);
  return [[e.host,e.hostTag,'host'],...others,...e.attendees];
}

function renderDetail(){
  const e=ev(state.detail);if(!e)return;
  const on=state.going.has(e.id),pub=e.kind==='public';
  const organizer=pub
    ?`<div class="info-row"><span class="info-ic verified">${ic('shield',18)}</span><span>${esc(e.venue||e.place.split(' · ')[0])}<small>${e.venue?'Verified organizer':'Verified venue'}</small></span></div>`
    :`<div class="info-row"><span class="avatar" style="width:36px;height:36px;background:${e.color}">${esc(e.host.slice(0,2).toUpperCase())}</span><span>${esc(e.mine?'You':e.host)}<small>Host · ${esc(e.hostTag)}</small></span></div>`;

  let section='',bar='';
  const chatBtn=on?`<button class="chatbtn" style="width:46px;height:46px" data-chat-event="${e.id}" aria-label="Open event chat">${ic('chat',20)}${e.unread?`<span class="badge">${e.unread}</span>`:''}</button>`:'';
  if(pub){
    const b=state.bought[e.id];
    if(!e.tickets.length){
      section=`<div class="dsec"><h4>Entry</h4><div class="ticket-ok">${ic('check',18,2.4)}<span><b>Free entry.</b> No ticket needed, just show up.</span></div></div>`;
      bar=`<span class="total">Free<b>${goingCount(e)} going</b></span>${chatBtn}<button class="btn lg ${on?'on':'primary'}" data-join="${e.id}">${on?'✓ Going':'Join'}</button>`;
    }else if(b){
      const [name,,price]=e.tickets[b.tier]||e.tickets[0];
      const code=`SQ-${e.id.toUpperCase()}-${ME.id.replace(/\D/g,'').slice(0,4).padEnd(4,'0')}`;
      section=`<div class="dsec"><h4>Your tickets</h4><div class="ticket-ok">${ic('ticket',18)}<span><b>${b.qty} × ${esc(name)}</b> · NT$${(price*b.qty).toLocaleString('en-US')}<br>Show this booking code at the door: <b>${code}</b></span></div></div>`;
      bar=`<span class="total">Ticket booked<b>${goingCount(e)} going</b></span>${chatBtn}<button class="btn lg on" data-join="${e.id}">✓ Going</button>`;
    }else{
      const t=state.ticket,[,,price]=e.tickets[t.tier],total=price*t.qty;
      section=`<div class="dsec"><h4>Tickets</h4>
        ${e.tickets.map(([name,note,p],i)=>`<button class="tier${i===t.tier?' sel':''}" data-tier="${i}"><span class="radio"></span><span class="tn">${esc(name)}${note?`<small>${esc(note)}</small>`:''}</span><span class="tp">NT$${p.toLocaleString('en-US')}</span></button>`).join('')}
        <div class="qty">Quantity<div class="stepper"><button data-qty="-1" aria-label="One less"${t.qty<=1?' disabled':''}>${ic('minus',16,2.4)}</button><b>${t.qty}</b><button data-qty="1" aria-label="One more"${t.qty>=6?' disabled':''}>${ic('plus',16,2.4)}</button></div></div>
      </div>`;
      bar=`<span class="total">Total<b>NT$${total.toLocaleString('en-US')}</b></span>${chatBtn}<button class="btn lg primary" data-buy="${e.id}">Buy ${t.qty>1?t.qty+' tickets':'ticket'}</button>`;
    }
  }else{
    const people=attendees(e),full=isFull(e);
    section=`<div class="dsec"><h4>Who’s going · ${e.max?`${Math.min(goingCount(e),e.max)} of ${e.max}`:goingCount(e)}</h4>
      ${people.map(([n,tag,role])=>`<div class="person"><span class="avatar" style="width:36px;height:36px;background:${role==='me'?'var(--accent)':colorFor(n)}">${role==='me'?'ME':esc(n.slice(0,2).toUpperCase())}</span><span class="n">${esc(n)}${tag?`<small>${esc(tag)}</small>`:''}</span>${role==='host'?'<span class="host-pill">Host</span>':''}</div>`).join('')}
    </div>`;
    const left=e.max?e.max-Math.min(goingCount(e),e.max):'Open';
    bar=`<span class="total">${full?'Event is full':'Spots left'}<b>${full?'Waitlist open':left}</b></span>${chatBtn}<button class="btn lg ${on?'on':(full?'':'primary')}" data-join="${e.id}">${on?'✓ Going':(full?'Join waitlist':'Join')}</button>`;
  }

  const scroll=detail.querySelector('.dscroll'),top=scroll?scroll.scrollTop:0;
  detail.innerHTML=`<div class="dscroll">
      ${e.img?`<div class="hero" style="background-image:url(${IMG[e.img]})">`:`<div class="hero ph" style="background:${threadOf(e).color}">${ic(threadOf(e).icon,72,1.6)}`}<button class="hero-back" data-close-detail aria-label="Back">${ic('back',22,2.2)}</button></div>
      <div class="dbody">
        <div class="dhead"><span class="dtag">${pub?'Public event':'Community event'} · ${esc(e.tag)}</span><h2>${esc(e.title)}</h2></div>
        <div class="info">
          <div class="info-row"><span class="info-ic">${ic('clock',18)}</span><span>${fmtLong(e.date)}<small>${esc(e.time)}</small></span></div>
          <div class="info-row"><span class="info-ic">${ic('mappin',18)}</span><span>${esc(e.place)}<small>Taipei</small></span></div>
          ${organizer}
          ${e.thread?`<button class="info-row" style="text-align:left" data-open="${e.thread}"><span class="thread-icon" style="width:36px;height:36px;border-radius:10px;background:${threadOf(e).color}">${ic(threadOf(e).icon,18,2)}</span><span>${esc(threadOf(e).name)}<small>Created in this thread · open chat</small></span></button>`:''}
        </div>
        <p>${esc(e.desc)}</p>
        ${section}
      </div>
    </div>
    <div class="dbar">${bar}</div>`;
  if(top)detail.querySelector('.dscroll').scrollTop=top;
}
function openDetail(id){
  state.detail=id;state.ticket={tier:0,qty:1};
  raise(detail);detail.innerHTML='';renderDetail();detail.classList.add('open');detail.setAttribute('aria-hidden','false');
}
function closeDetail(){state.detail=null;detail.classList.remove('open');detail.setAttribute('aria-hidden','true');}
async function buy(id){
  const {error}=await sb.from('attendance').insert({event_id:id,tier:state.ticket.tier,qty:state.ticket.qty});
  if(error)return fail(error);
  toast('Ticket booked · payment is skipped in this demo');
  reload();
}

/* ---------- chat (community threads and event groups) ---------- */
const USER_COLORS=['#8FC1E3','#E8A0BF','#F0C987','#B8D8A8','#C9B6F2','#F2A488','#7FD1C1'];
const colorFor=n=>USER_COLORS[[...n].reduce((a,c)=>a+c.charCodeAt(0),0)%USER_COLORS.length];

function eventCard(id){
  const e=ev(id);if(!e)return '';
  const on=state.going.has(id),full=isFull(e);
  return `<div class="evmsg" data-detail="${id}">
    <div class="evlabel">${ic('calendar',13,2.2)}Event</div>
    <div class="evrow">${thumb(e,'eimg')}<div><div class="evt">${esc(e.title)}</div><div class="evw">${fmtShort(e.date)} · ${esc(e.time)}</div></div></div>
    <div class="evfoot"><span>${e.max?`${Math.min(goingCount(e),e.max)} of ${e.max} going`:`${goingCount(e)} going`}</span>${on?`<button class="btn on" data-chat-event="${id}">Open chat</button>`:`<button class="btn ${full?'':'primary'}" data-join="${id}">${full?'Waitlist':'Join'}</button>`}</div>
  </div>`;
}
function fileCard([name,ext,size,url],u,time){
  return `<button class="fmsg" data-file="${esc(url||'')}">${fileBadge(ext)}<span class="body">${u?`<span class="who" style="color:${colorFor(u)}">${esc(u)}</span>`:''}<span class="t">${esc(name)}</span><span class="kind">${esc(size)} · ${esc(time)}</span></span></button>`;
}
function deadlineCard(id){
  const x=item(id);if(!x)return '';
  return `<div class="dlmsg" data-team="${x.team}" data-ttab="deadlines">
    <div class="evlabel">${ic('flag',13,2.2)}Deadline added</div>
    <div class="evt">${esc(x.title)}</div>
    <div class="evw">${fmtShort(x.date)} · ${esc(x.time)} · <b>${dueIn(x.date)}</b></div>
  </div>`;
}
function bubbles(msgs){
  let lastDay=null;
  return msgs.map(([u,txt,time,host,day])=>{
    const sep=day!==lastDay?`<div class="daysep">${day}</div>`:'';lastDay=day;
    let card=null;
    if(typeof txt==='object')card=txt.event?eventCard(txt.event):txt.file?fileCard(txt.file,u==='me'?null:u,time):deadlineCard(txt.deadline);
    if(u==='me')return sep+(card?`<div class="msg me">${card}</div>`
      :`<div class="msg me"><div class="bubble">${esc(txt)}<span class="t">${esc(time)}</span></div></div>`);
    const av=`<span class="avatar" style="background:${colorFor(u)}">${esc(u.slice(0,2).toUpperCase())}</span>`;
    return sep+(card?`<div class="msg">${av}${card}</div>`
      :`<div class="msg">${av}<div class="bubble"><span class="who" style="color:${colorFor(u)}">${esc(u)}${host?'<em>host</em>':''}</span>${esc(txt)}<span class="t">${esc(time)}</span></div></div>`);
  }).join('');
}
const noMsgs=`<div class="empty">No messages yet. Say hi 👋</div>`;
function composer(name,withCreate){return `<form class="composer" id="composer">${withCreate?`<button type="button" class="plusbtn" data-create aria-label="Create an event">${ic('calendar',19,2)}</button>`:''}<input id="chat-input" autocomplete="off" maxlength="1000" placeholder="Message ${esc(name)}…" aria-label="Message"><button class="send" type="submit" aria-label="Send">${ic('send',18,2.2)}</button></form>`;}

function createSheet(t){
  return `<div class="sheet-wrap" data-cancel-create><form class="sheet" id="create-form">
    <div class="sheet-head"><b>New event<small>${t?`Posted in ${esc(t.name)}`:'Community event'}</small></b><button type="button" class="icon-btn" data-cancel-create aria-label="Close">${ic('x',20,2.2)}</button></div>
    <label class="field">Title<input id="ce-title" required maxlength="60" placeholder="e.g. Night fishing at Tamsui pier"></label>
    ${t?'':`<label class="field">Category<select id="ce-tag">${TAGS.community.map(x=>`<option>${x}</option>`).join('')}</select></label>`}
    <div class="row2"><label class="field">Date<input id="ce-date" type="date" required min="${TODAY}" value="${addDays(TODAY,1)}"></label><label class="field">Time<input id="ce-time" type="time" required value="18:00"></label></div>
    <label class="field">Place<input id="ce-place" required maxlength="50" placeholder="e.g. Tamsui MRT exit 2"></label>
    <label class="field">Spots<input id="ce-max" type="number" min="2" max="50" value="8"></label>
    <label class="field">Description (optional)<input id="ce-desc" maxlength="300" placeholder="What should people bring or know?"></label>
    <span class="hint">${t?'The event shows up in this chat, in the thread’s Events tab, in Community events and in the Calendar.':'The event shows up in Community events and in the Calendar.'}</span>
    <button class="btn primary lg" type="submit">Post event</button>
  </form></div>`;
}

function renderChat(){
  const c=state.chat;if(!c)return;
  let head,body,foot='',extra='';
  if(c.type==='thread'){
    const t=THREADS.find(x=>x.id===c.id);
    const related=EVENTS.filter(e=>e.thread===t.id&&upcoming(e)).sort(byDate);
    head=`<span class="thread-icon" style="background:${t.color}">${ic(t.icon,19,2)}</span>
      <div class="chat-title"><b>${esc(t.name)}</b><span>${t.members.toLocaleString('en-US')} members</span></div>
      <button class="follow${t.followed?' on':''}" data-follow="${t.id}">${t.followed?'Following':'Follow'}</button>`;
    extra=`<div class="seg chat-seg">
      <button class="${state.chatTab==='chat'?'active':''}" data-ctab="chat">Chat</button>
      <button class="${state.chatTab==='events'?'active':''}" data-ctab="events">Related events${related.length?`<span class="badge" style="background:var(--ink-3);color:var(--paper)">${related.length}</span>`:''}</button>
    </div>`;
    if(state.chatTab==='events'){
      body=`<div class="elist">${t.followed?`<button class="create-row" data-create>${ic('plus',18,2.4)}Create an event in this thread</button>`:''}
        ${related.length?related.map(e=>erow(e)).join(''):`<div class="empty">No events yet.<br>Events created in this chat will show up here.</div>`}</div>`;
    }else{
      body=`<div class="msgs" id="msgs">${t.msgs.length?bubbles(t.msgs):noMsgs}</div>`;
    }
    foot=!t.followed?`<div class="join-bar"><span style="flex:1">Follow this community to join the chat.</span><button class="btn primary" data-follow="${t.id}">Follow</button></div>`
      :(state.chatTab==='chat'?composer(t.name,true):'');
    if(state.creating)foot+=createSheet(t);
  }else if(c.type==='team'){
    const t=team(c.id);
    head=`<span class="thread-icon" style="background:${t.color}">${ic(t.icon,19,2)}</span>
      <div class="chat-title"><b>${esc(t.name)}</b><span>${esc(t.course)} · ${t.members.length+1} members</span></div>`;
    const n=UNI_ITEMS.filter(x=>x.team===t.id&&x.date>=TODAY).length;
    extra=`<div class="seg chat-seg">${[['chat','Chat'],['files',`Files<span class="badge" style="background:var(--ink-3);color:var(--paper)">${t.files.length}</span>`],['deadlines',`Deadlines${n?`<span class="badge" style="background:var(--ink-3);color:var(--paper)">${n}</span>`:''}`]]
      .map(([k,l])=>`<button class="${state.teamTab===k?'active':''}" data-tt="${k}">${l}</button>`).join('')}</div>`;
    body=teamBody(t);
    foot=state.teamTab==='chat'?teamComposer(t):'';
  }else{
    const e=ev(c.id);
    head=`${thumb(e,'chimg')}
      <div class="chat-title"><b>${esc(e.title)}</b><span>${fmtShort(e.date)} · ${esc(e.time)} · ${goingCount(e)} going</span></div>`;
    body=`<div class="msgs" id="msgs">${e.chat.length?bubbles(e.chat):noMsgs}</div>`;
    foot=composer('the group',false);
  }
  chat.innerHTML=`<div class="chat-head"><button class="icon-btn" data-close aria-label="Back">${ic('back',22,2.2)}</button>${head}</div>${extra}${body}${foot}`;
  const m=document.getElementById('msgs');if(m)m.scrollTop=m.scrollHeight;
}
// overlays stack in the order they were opened (chat over detail or detail over chat)
let layer=4;
function raise(el){el.style.zIndex=++layer;}
function openChat(type,id){
  const obj=type==='thread'?THREADS.find(x=>x.id===id):type==='team'?team(id):ev(id);
  if(!obj)return;
  obj.unread=0;state.chat={type,id};state.chatTab='chat';state.teamTab='chat';state.creating=false;
  markSeen(channelOf(state.chat));
  raise(chat);renderChat();chat.classList.add('open');chat.setAttribute('aria-hidden','false');render();
}
function closeChat(){state.chat=null;state.creating=false;chat.classList.remove('open');chat.setAttribute('aria-hidden','true');render();}

const to12h=v=>{let [h,m]=v.split(':').map(Number);const ap=h>=12?'PM':'AM';h=h%12||12;return `${h}:${String(m).padStart(2,'0')} ${ap}`;};
let busy=false;
async function createEvent(){
  if(busy)return;busy=true;
  try{
    const t=state.chat?.type==='thread'?THREADS.find(x=>x.id===state.chat.id):null;
    const val=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
    const tag=t?(TAGS.community.includes(t.tag)?t.tag:'Outdoors'):val('ce-tag');
    const {data,error}=await sb.from('events').insert({kind:'community',thread:t?t.id:null,tag,date:val('ce-date'),time:to12h(val('ce-time')),
      title:val('ce-title'),place:val('ce-place'),host:ME.username,host_tag:ME.tag,color:'#F0A93E',base_going:0,max:Math.max(2,+val('ce-max')||8),
      descr:val('ce-desc')||(t?`Created in ${t.name}. Say hi in the event chat and ask anything.`:'Say hi in the event chat and ask anything.')}).select().single();
    if(error)throw error;
    const writes=[sb.from('attendance').insert({event_id:data.id}),sb.from('messages').insert({channel:`event:${data.id}`,body:'Created this event, see you there!',is_host:true})];
    if(t)writes.push(sb.from('messages').insert({channel:`thread:${t.id}`,payload:{event:data.id}}));
    for(const r of await Promise.all(writes))if(r.error)throw r.error;
    state.creating=false;state.chatTab='chat';
    if(state.sheet)closeSheet();
    toast(t?'Event posted · also in Community and Calendar':'Event posted · also in the Calendar');
    await reload();
  }catch(e){fail(e);}
  finally{busy=false;}
}

async function toggleFollow(id){
  const t=THREADS.find(x=>x.id===id);
  const {error}=t.followed
    ?await sb.from('follows').delete().eq('thread_id',id).eq('user_id',ME.id)
    :await sb.from('follows').insert({thread_id:id});
  if(error)return fail(error);
  if(!t.followed)markSeen(`thread:${id}`);
  toast(!t.followed?'Added to My threads':`Unfollowed ${t.name}`);
  reload();
}
async function toggleJoin(id){
  const e=ev(id);
  let error;
  if(state.going.has(id)){({error}=await sb.from('attendance').delete().eq('event_id',id).eq('user_id',ME.id));if(!error)toast('You left this event');}
  else if(isFull(e)){toast('Added to the waitlist');return;}
  else{({error}=await sb.from('attendance').insert({event_id:id}));if(!error){markSeen(`event:${id}`);toast('You’re going · group chat is in My events');}}
  if(error)return fail(error);
  reload();
}

/* ---------- university mode: Teams + academic calendar ---------- */
const UNI_TABS=[{id:'teams',label:'Teams',icon:'users'},{id:'ucal',label:'Calendar',icon:'calendar'}];
const KIND_LABEL={deadline:'Deadline',exam:'Exam',other:'Other'};
const item=id=>UNI_ITEMS.find(x=>x.id===id);
const team=id=>TEAMS.find(t=>t.id===id);
const dueIn=s=>{const n=Math.round((parse(s)-parse(TODAY))/864e5);return n<0?'Past':n===0?'Today':n===1?'Tomorrow':`In ${n} days`;};
const fileBadge=ext=>`<span class="fbadge ${esc(ext)}">${esc(ext.toUpperCase())}</span>`;

function renderTeams(){
  return `<div class="tab-head"><h1>Teams</h1></div>
  <div class="list rows" style="padding-top:10px">${TEAMS.map(t=>{
    const next=UNI_ITEMS.filter(x=>x.team===t.id&&x.date>=TODAY).sort(byDate)[0];
    return `<button class="thread" data-team="${t.id}">
      <span class="thread-icon" style="background:${t.color}">${ic(t.icon,22,2)}</span>
      <span class="thread-body">
        <span class="thread-name">${esc(t.name)}</span>
        <span class="preview">${lastMsg(t.msgs)}</span>
        ${next?`<span class="due">${ic('flag',12,2.2)}${esc(next.title)} · ${dueIn(next.date)}</span>`:''}
      </span>
      <div class="side"><span class="time">${esc(t.time)}</span>${t.unread?`<span class="badge">${t.unread}</span>`:'<span style="height:20px"></span>'}</div>
    </button>`;}).join('')}</div>`;
}

function uniRow(x){
  const t=x.team&&team(x.team);
  return `<div class="urow ${x.kind}"${t?` data-team="${t.id}" data-ttab="deadlines"`:''}>
    <span class="ukind">${ic(x.kind==='exam'?'pen':x.kind==='deadline'?'flag':'clock',18,2)}</span>
    <div class="body">
      <span class="w">${KIND_LABEL[x.kind]} · ${esc(x.time)}</span>
      <span class="t">${esc(x.title)}</span>
      <span class="kind">${esc(x.course)} · ${esc(t?t.name:(x.place||COURSES[x.course]||''))}</span>
    </div>
    <span class="countdown">${dueIn(x.date)}</span>
  </div>`;
}

function renderUniCalendar(){
  const cells=monthGrid(state.uniMonth,'uday',state.uniDay,d=>UNI_ITEMS.filter(x=>x.date===d),x=>`<i class="${x.kind}"></i>`);
  const sel=parse(state.uniDay);
  const dayItems=UNI_ITEMS.filter(x=>x.date===state.uniDay).sort(byDate);
  return `<div class="tab-head"><h1>Calendar</h1></div>
  <div class="cal">
    <div class="cal-head">${monthHead(state.uniMonth,'uniMonth')}<div class="legend"><span><i class="kdot deadline"></i>Deadline</span><span><i class="kdot exam"></i>Exam</span><span><i class="kdot other"></i>Other</span></div></div>
    <div class="cal-grid">${['M','T','W','T','F','S','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
  </div>
  <div class="list" style="gap:0">
    <div class="dayhead">${DAYS[sel.getDay()]}, ${sel.getDate()} ${MON[sel.getMonth()]}</div>
    ${dayItems.length?dayItems.map(uniRow).join(''):`<div class="empty" style="padding:24px 0">Nothing due this day.</div>`}
  </div>`;
}

function teamBody(t){
  if(state.teamTab==='files')
    return `<div class="elist">${t.files.length?t.files.map(([n,ext,size,by,when,url])=>`<button class="frow" data-file="${esc(url||'')}">${fileBadge(ext)}<span class="body"><span class="t">${esc(n)}</span><span class="kind">${by==='me'?'You':esc(by)} · ${esc(size)} · ${esc(when)}</span></span></button>`).join(''):`<div class="empty">No files yet. Use the clip in the chat to share one.</div>`}</div>`;
  if(state.teamTab==='deadlines'){
    const its=UNI_ITEMS.filter(x=>x.team===t.id).sort(byDate);
    return `<div class="elist"><button class="create-row" data-add-deadline>${ic('plus',18,2.4)}Add a deadline</button>
      ${its.length?its.map(uniRow).join(''):`<div class="empty">No deadlines yet.</div>`}</div>`;
  }
  return `<div class="msgs" id="msgs">${t.msgs.length?bubbles(t.msgs):noMsgs}</div>`;
}
function teamComposer(t){
  return `<form class="composer" id="composer">
    <label class="plusbtn" aria-label="Attach a file" style="cursor:pointer">${ic('clip',19,2)}<input type="file" id="attach" hidden></label>
    <button type="button" class="plusbtn" data-add-deadline aria-label="Add a deadline">${ic('flag',19,2)}</button>
    <input id="chat-input" autocomplete="off" maxlength="1000" placeholder="Message ${esc(t.name)}…" aria-label="Message">
    <button class="send" type="submit" aria-label="Send">${ic('send',18,2.2)}</button></form>`;
}

/* bottom sheet shared by "add deadline" (team chat), "add to calendar" (calendar tab), "new event" and the profile */
const sheetHost=document.getElementById('sheet');
function openSheet(s){state.sheet=s;renderSheet();const f=document.getElementById(s.kind==='event'?'ce-title':'sh-title');if(f)f.focus();}
function closeSheet(){state.sheet=null;renderSheet();}
function renderSheet(){
  const s=state.sheet;
  if(!s){sheetHost.innerHTML='';return;}
  if(s.kind==='event'){sheetHost.innerHTML=createSheet(null);return;}
  if(s.kind==='me'){
    sheetHost.innerHTML=`<div class="sheet-wrap" data-close-sheet><div class="sheet">
      <div class="sheet-head"><b>${esc(ME.username)}<small>${esc(ME.tag)}</small></b><button type="button" class="icon-btn" data-close-sheet aria-label="Close">${ic('x',20,2.2)}</button></div>
      <span class="hint">Tip: add SideQuest to your home screen (Share → Add to Home Screen on iPhone, menu → Install app on Android) to use it like a regular app.</span>
      <button class="btn lg" data-logout>${ic('out',18,2.2)} Log out</button>
    </div></div>`;
    return;
  }
  const t=s.kind==='deadline'&&team(s.team);
  const kinds=s.kind==='cal'?`<div class="panel-chips">${['exam','deadline','other'].map(k=>`<button type="button" class="chip${s.type===k?' active':''}" data-sheet-type="${k}">${KIND_LABEL[k]}</button>`).join('')}</div>`:'';
  const course=s.kind==='cal'?`<label class="field">Course<select id="sh-course">${Object.entries(COURSES).map(([c,n])=>`<option value="${c}">${c} · ${esc(n)}</option>`).join('')}</select></label>`:'';
  const place=s.kind==='cal'?`<label class="field">Where (optional)<input id="sh-place" maxlength="50" placeholder="e.g. Engineering Hall, Room 101"></label>`:'';
  sheetHost.innerHTML=`<div class="sheet-wrap" data-close-sheet><form class="sheet" id="sheet-form">
    <div class="sheet-head"><b>${s.kind==='cal'?'Add to calendar':'New deadline'}<small>${t?`Shared with ${esc(t.name)}`:'Only visible to you'}</small></b><button type="button" class="icon-btn" data-close-sheet aria-label="Close">${ic('x',20,2.2)}</button></div>
    ${kinds}
    <label class="field">Title<input id="sh-title" required maxlength="60" placeholder="${s.kind==='cal'&&s.type==='exam'?'e.g. Calculus final':'e.g. Lab report 3'}"></label>
    ${course}
    <div class="row2"><label class="field">Date<input id="sh-date" type="date" required min="${TODAY}" value="${state.uniDay>=TODAY?state.uniDay:TODAY}"></label><label class="field">Time<input id="sh-time" type="time" required value="${s.type==='exam'?'09:00':'23:59'}"></label></div>
    ${place}
    <span class="hint">${t?'The deadline is posted in the team chat and shows up in everyone’s Calendar.':'Shows up in your Calendar.'}</span>
    <button class="btn primary lg" type="submit">${s.kind==='cal'?'Add':'Add deadline'}</button>
  </form></div>`;
}
async function saveSheet(){
  if(busy)return;busy=true;
  try{
    const s=state.sheet,val=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
    const x={kind:s.kind==='cal'?s.type:'deadline',title:val('sh-title'),date:val('sh-date'),time:to12h(val('sh-time'))};
    if(s.kind==='deadline'){const t=team(s.team);Object.assign(x,{team:t.id,course:t.course});}
    else Object.assign(x,{course:val('sh-course'),place:val('sh-place')||null});
    const {data,error}=await sb.from('uni_items').insert(x).select().single();
    if(error)throw error;
    if(s.kind==='deadline'){const r=await sb.from('messages').insert({channel:`team:${s.team}`,payload:{deadline:data.id}});if(r.error)throw r.error;}
    state.uniDay=x.date;state.uniMonth=x.date.slice(0,7);
    closeSheet();
    toast(s.kind==='deadline'?'Deadline added · also in Calendar':`${KIND_LABEL[x.kind]} added to Calendar`);
    await reload();
  }catch(e){fail(e);}
  finally{busy=false;}
}

function setMode(uni){
  state.uni=uni;
  document.getElementById('mode-btn').setAttribute('aria-pressed',String(uni));
  if(state.chat)closeChat();
  if(state.detail)closeDetail();
  closeSheet();
  setTab(uni?'teams':'public');
}

/* ---------- events ---------- */
document.getElementById('screen').addEventListener('click',e=>{
  const el=e.target.closest('[data-tab],[data-panel],[data-tag],[data-follow],[data-open],[data-join],[data-chat-event],[data-day],[data-seg],[data-mseg],[data-ctab],[data-create],[data-cancel-create],[data-preset],[data-close],[data-demo],[data-fab],[data-team],[data-tt],[data-uday],[data-add-deadline],[data-close-sheet],[data-sheet-type],[data-file],[data-detail],[data-close-detail],[data-tier],[data-qty],[data-buy],[data-month],[data-me],[data-logout]');
  if(!el)return;
  const d=el.dataset;
  if(d.detail!==undefined)return openDetail(d.detail);
  if(d.closeDetail!==undefined)return closeDetail();
  if(d.tier!==undefined){state.ticket.tier=+d.tier;return renderDetail();}
  if(d.qty!==undefined){state.ticket.qty=Math.min(6,Math.max(1,state.ticket.qty+ +d.qty));return renderDetail();}
  if(d.buy!==undefined)return buy(d.buy);
  if(d.tab!==undefined)return setTab(d.tab);
  if(d.panel!==undefined){state.panel[d.panel]=state.panel[d.panel]===d.val?null:d.val;return render();}
  if(d.tag!==undefined){state.tag[d.tag]=d.val==='All'?null:d.val;state.panel[d.tag]=null;return render();}
  if(d.follow!==undefined){e.stopPropagation();return toggleFollow(d.follow);}
  if(d.open!==undefined)return openChat('thread',d.open);
  if(d.chatEvent!==undefined)return openChat('event',d.chatEvent);
  if(d.join!==undefined)return toggleJoin(d.join);
  if(d.day!==undefined){state.calDay=d.day;state.calMonth=d.day.slice(0,7);return render();}
  if(d.month!==undefined){state[d.month]=shiftMonth(state[d.month],+d.val);return render();}
  if(d.seg!==undefined){state.threadSeg=d.seg;view.scrollTop=0;return render();}
  if(d.mseg!==undefined){state.mineFilter=d.mseg;view.scrollTop=0;return render();}
  if(d.close!==undefined){closeSheet();return closeChat();}
  if(d.ctab!==undefined){state.chatTab=d.ctab;return renderChat();}
  if(d.create!==undefined){state.creating=true;renderChat();document.getElementById('ce-title').focus();return;}
  if(d.cancelCreate!==undefined){if(el.tagName==='BUTTON'||e.target===el){state.creating=false;if(state.sheet?.kind==='event')closeSheet();else renderChat();}return;}
  if(d.preset!==undefined){const [f,t]=d.val.split('|');state.range[d.preset]=f?{from:f,to:t}:null;state.panel[d.preset]=null;return render();}
  if(d.demo!==undefined)return toast('Venue sign-up is coming soon');
  if(d.fab!==undefined)return state.tab==='ucal'?openSheet({kind:'cal',type:'exam'}):state.tab==='community'?openSheet({kind:'event'}):toast('Public events are posted by verified venues');
  if(d.team!==undefined){openChat('team',d.team);if(d.ttab){state.teamTab=d.ttab;renderChat();}return;}
  if(d.tt!==undefined){state.teamTab=d.tt;return renderChat();}
  if(d.uday!==undefined){state.uniDay=d.uday;state.uniMonth=d.uday.slice(0,7);return render();}
  if(d.addDeadline!==undefined)return openSheet({kind:'deadline',team:state.chat.id});
  if(d.closeSheet!==undefined){if(el.tagName==='BUTTON'||e.target===el)closeSheet();return;}
  if(d.sheetType!==undefined){state.sheet.type=d.sheetType;const keep=['sh-title','sh-date','sh-place'].map(i=>document.getElementById(i)?.value);renderSheet();['sh-title','sh-date','sh-place'].forEach((i,k)=>{const f=document.getElementById(i);if(f&&keep[k])f.value=keep[k];});return;}
  if(d.file!==undefined){if(d.file)window.open(d.file,'_blank','noopener');else toast('This sample file has no preview');return;}
  if(d.me!==undefined)return openSheet({kind:'me'});
  if(d.logout!==undefined)return logout();
});
sheetHost.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='create-form')createEvent();else saveSheet();});
// attaching a real file from the device uploads it and posts it to the team chat and the Files tab
chat.addEventListener('change',async e=>{
  if(e.target.id!=='attach'||!e.target.files.length)return;
  const f=e.target.files[0],t=team(state.chat.id);
  if(f.size>20*1048576)return toast('Max file size is 20 MB');
  const ext=(f.name.split('.').pop()||'file').toLowerCase().slice(0,4);
  const size=f.size>1048576?`${(f.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(f.size/1024))} KB`;
  toast('Uploading…');
  const key=`${t.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g,'_')}`;
  const up=await sb.storage.from('files').upload(key,f,{contentType:f.type||undefined});
  if(up.error)return fail(up.error);
  const url=sb.storage.from('files').getPublicUrl(key).data.publicUrl;
  const {error}=await sb.from('messages').insert({channel:`team:${t.id}`,payload:{file:[f.name,ext,size,url]}});
  if(error)return fail(error);
  toast('File shared with the team');
  reload();
});
document.getElementById('screen').addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('span[data-follow]')){e.preventDefault();e.stopPropagation();toggleFollow(e.target.dataset.follow);}
});
document.getElementById('mode-btn').addEventListener('click',()=>{setMode(!state.uni);toast(state.uni?'Academic mode':'City mode');});
view.addEventListener('change',e=>{
  const key=e.target.dataset.range;if(!key)return;
  const r=state.range[key]||{from:'',to:''};
  r[e.target.dataset.end]=e.target.value;
  if(r.from&&!r.to)r.to=r.from;
  if(r.to&&!r.from)r.from=r.to;
  if(r.from>r.to)[r.from,r.to]=[r.to,r.from];
  state.range[key]=r.from?r:null;
  render();
});
// search re-renders only the result list so the input keeps focus
view.addEventListener('input',e=>{
  const key=e.target.dataset.search;if(!key)return;
  state.q[key]=e.target.value;
  document.getElementById('results').innerHTML=LISTS[key]();
});
chat.addEventListener('submit',async e=>{
  e.preventDefault();
  if(e.target.id==='create-form')return createEvent();
  const input=document.getElementById('chat-input');const txt=input.value.trim();if(!txt)return;
  input.value='';
  const {error}=await sb.from('messages').insert({channel:channelOf(state.chat),body:txt});
  if(error){input.value=txt;return fail(error);}
  await reload();
  document.getElementById('chat-input')?.focus();
});

/* ---------- login ---------- */
const loginEl=document.getElementById('login');
loginEl.addEventListener('submit',async e=>{
  e.preventDefault();
  const nick=document.getElementById('lg-nick').value.trim().toLowerCase(),pw=document.getElementById('lg-pass').value;
  const btn=loginEl.querySelector('button');btn.disabled=true;
  const {error}=await sb.auth.signInWithPassword({email:`${nick}@${EMAIL_DOMAIN}`,password:pw});
  btn.disabled=false;
  if(error){document.getElementById('lg-err').textContent='Wrong nickname or password';return;}
  start();
});
let channel=null;
async function start(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){loginEl.hidden=false;return;}
  const {data:prof,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(error||!prof){await sb.auth.signOut();loginEl.hidden=false;document.getElementById('lg-err').textContent='This account has no profile yet';return;}
  ME={id:prof.id,username:prof.username,tag:prof.tag};
  loadSeen();
  document.getElementById('me-btn').textContent=ME.username.slice(0,2).toUpperCase();
  try{await load();}catch(e){return fail(e);}
  loginEl.hidden=true;
  const s=(location.hash||'').slice(1);
  if(TABS.some(t=>t.id===s))state.tab=s;
  render();
  channel=sb.channel('db').on('postgres_changes',{event:'*',schema:'public'},scheduleReload).subscribe();
}
async function logout(){
  if(channel)sb.removeChannel(channel);
  await sb.auth.signOut();
  location.hash='';location.reload();
}
// refresh when the phone wakes the app up again (realtime may have dropped meanwhile)
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ME)scheduleReload();});
start();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
