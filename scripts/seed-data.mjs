// Sample data lifted from mockup/sidequest.html; dates are relative to the mockup's 'today' (2026-09-28)
const EVENTS=[
  // public: posted by venues
  {id:'p0',kind:'public',img:'p0',tag:'Clubs',date:'2026-10-02',time:'11:00 PM',title:'Neon Tide: techno all-nighter',place:'Lumen Club · Xinyi',price:600,going:412,
   chat:[['lumen_club','Doors open at 11. First 100 students get a free shot','Mon',true],['jess_au','Anyone want to meet at Taipei 101 MRT at 10:45?','12:02'],['marco.it','Count me in, I’ll be at exit 4','12:10']],unread:2},
  {id:'p1',kind:'public',img:'p1',tag:'Live Music',date:'2026-09-30',time:'9:00 PM',title:'Open Jam Night — bring your instrument',place:'The Copper Room · Gongguan',price:0,going:138,
   chat:[['copper_room','Sign-up sheet opens at 8:30 at the bar','Sun',true],['ryo_surf','Bringing my sax, anyone on keys?','10:12']]},
  {id:'p2',kind:'public',img:'p2',tag:'Festivals',date:'2026-10-10',time:'2:00 PM',title:'Riverside Indie Festival',place:'Dadaocheng Wharf',price:1200,going:1906,
   chat:[['riverside_fest','Line-up is out: 18 bands across 2 stages','Fri',true],['hana.j','Who’s going both days? Looking for a group','09:40']]},
  {id:'p3',kind:'public',img:'p3',tag:'Bars',date:'2026-10-06',time:'8:00 PM',title:'Craft Beer Quiz Night',place:'Hops & Lanterns · Zhongshan',price:150,going:87,
   chat:[['hops_lanterns','Teams of 2–6, max 20 teams. Register at the door','Sat',true],['felix_k','Need 2 more for our team, message here!','11:30']]},
  {id:'p4',kind:'public',img:'p4',tag:'Food',date:'2026-10-08',time:'7:30 PM',title:'Late-night dumpling workshop',place:'Lin’s Kitchen Studio · Da’an',price:850,going:64,
   chat:[['lins_kitchen','Aprons provided. Tell us about any allergies here','Thu',true],['amy_run','Is it vegetarian-friendly?','08:55'],['lins_kitchen','Yes, we have a cabbage and tofu filling','09:20',true]]},
  {id:'p5',kind:'public',img:'p5',tag:'Clubs',date:'2026-10-03',time:'9:30 PM',title:'Latin Night + salsa lesson',place:'Club Cumbia · Zhongshan',price:400,going:221,
   chat:[['club_cumbia','Lesson starts at 10 sharp on the main floor','Sun',true],['priya.s','Total beginner here, who else is coming?','13:05']]},
  // community: posted by students and expats
  {id:'c0',kind:'community',img:'c0',tag:'Sports',date:'2026-10-04',time:'4:00 PM',title:'5-a-side football, need 4 more',place:'Da’an Forest Park',host:'lucas_br',color:'#8FC1E3',going:6,max:10,
   chat:[['lucas_br','I booked the north pitch 4–6. Bring a light and a dark shirt','11:02',true],['tom_de','I can bring a second ball','11:20'],['lucas_br','Perfect. We’re 7 now, need 3 more','11:45',true]],unread:3},
  {id:'c1',kind:'community',img:'c1',tag:'Trips',date:'2026-10-10',time:'7:00 AM · 2 days',title:'Sun Moon Lake road trip',place:'Taipei Main Station',host:'anna.k',color:'#E8A0BF',going:2,max:4,
   chat:[['anna.k','Car is booked! Pick-up at Taipei Main exit M3, 7 AM','Sun',true],['anna.k','Hostel in Ita Thao is NT$700 per night, I’ll book once we’re 4','09:10',true],['me','Sounds great, I can drive on the way back','09:30']]},
  {id:'c2',kind:'community',img:'c2',tag:'Outdoors',date:'2026-10-07',time:'5:00 AM',title:'Sunrise hike up Elephant Mountain',place:'Xiangshan MRT exit 2',host:'mei_t',color:'#F0C987',going:5,max:12,
   chat:[['mei_t','Meet at exit 2 at 4:50. Bring a headlamp','Mon',true],['daniel.h','Is it OK for beginners?','10:02'],['mei_t','Yes, it’s mostly stairs, about 30 minutes','10:15',true]]},
  {id:'c3',kind:'community',img:'c3',tag:'Language',date:'2026-10-01',time:'6:30 PM',title:'Mandarin ⇄ English coffee exchange',place:'Café near Gongguan MRT',host:'chenyu',color:'#B8D8A8',going:7,max:10,
   chat:[['chenyu','I reserved the big table by the window','Tue',true],['sam.uk','My Mandarin is very basic, is that fine?','12:40'],['chenyu','Perfect, that’s the point 😊','12:44',true]]},
  {id:'c4',kind:'community',img:'c4',tag:'Games',date:'2026-10-02',time:'7:00 PM',title:'Board game night',place:'Board game café · Shida',host:'tom_de',color:'#C9B6F2',going:8,max:8,
   chat:[['tom_de','Both tables are full, the waitlist is open','Mon',true],['nina.b','Put me on the waitlist please','14:00']]},
  {id:'c5',kind:'community',img:'c5',tag:'Trips',date:'2026-10-17',time:'9:00 AM',title:'Jiufen & Shifen day trip',place:'Taipei Main Station',host:'priya.s',color:'#F2A488',going:3,max:6,
   chat:[['priya.s','Train from Taipei Main at 9:10, then the Pingxi line','Sat',true],['leo.fr','How much are the sky lanterns?','15:22'],['priya.s','Around NT$200–300 for a single-color one','15:30',true]]},
  // community events created inside a thread chat (no photo, shown with the thread's icon)
  {id:'c6',kind:'community',img:null,thread:'anglers',tag:'Outdoors',date:'2026-10-03',time:'6:00 PM',title:'Squid fishing night at Keelung harbor',place:'Keelung harbor, west pier',host:'kevin_w',color:'#8FC1E3',going:4,max:8,
   chat:[['kevin_w','Train from Taipei Main at 4:40 PM, I’ll wait at Keelung station','13:45',true],['marco.it','Can I rent a rod somewhere nearby?','13:58'],['kevin_w','Tackle shop by the pier rents them for NT$200','14:03',true]]},
  {id:'c7',kind:'community',img:null,thread:'surf',tag:'Sports',date:'2026-10-03',time:'6:00 AM',title:'Jinshan surf session + carpool',place:'Pick-up at Gongguan MRT exit 1',host:'lin.wei',color:'#7FD1C1',going:3,max:5,
   chat:[['lin.wei','Car fits 3 boards on the roof. Gas split is about NT$150 each','13:22',true]]},
  {id:'c8',kind:'community',img:null,thread:'cinema',tag:'Culture',date:'2026-10-11',time:'7:30 PM',title:'In the Mood for Love — group screening',place:'SPOT Huashan',host:'sofia.r',color:'#E8A0BF',going:6,max:15,
   chat:[['sofia.r','Tickets are NT$280 at the box office. Drinks at the café after?','11:25',true],['daniel.h','Yes! I’ll bring my friend from the film club','11:31']]}
];

// extra fields shown on the event detail screen
const DETAILS={
  p0:{desc:'Two rooms and a Berlin-style sound system, with DJ Kaori closing the night. Student tickets need a valid student ID at the door.',tickets:[['Student','ID checked at the door',450],['Regular','',600],['VIP table','Up to 4 people, 1 bottle',4800]]},
  p1:{desc:'The house band provides drums, a bass amp and keys. Sign up at the bar for a 15-minute slot, or just come and listen.',tickets:[]},
  p2:{venue:'Riverside Indie Fest',desc:'Taiwanese and Japanese indie acts on two stages, food trucks and a craft beer village on the riverbank.',tickets:[['Saturday pass','Oct 10',700],['Sunday pass','Oct 11',700],['Two-day pass','Best value',1200]]},
  p3:{desc:'Six rounds in English and Mandarin. Teams of 2–6, and the winning team takes home a NT$3,000 bar voucher.',tickets:[['Quiz entry','Per person, 1 draft beer included',150]]},
  p4:{desc:'Fold xiaolongbao and potstickers with a chef, then eat everything you made. Vegetarian filling available.',tickets:[['Workshop seat','All ingredients and apron',850]]},
  p5:{desc:'Beginner salsa lesson at 10 PM, no partner needed. Bachata and reggaeton after midnight.',tickets:[['Entry + lesson','Before 10 PM',400],['Late entry','After midnight',300]]},
  c0:{hostTag:'Exchange · NTU',desc:'Friendly game, mixed level. I have a ball and bibs, we just need players. Bring water, there’s a 7-Eleven by the park gate.'},
  c6:{hostTag:'Expat · Keelung',desc:'Squid bite best after sunset. Bring glow jigs and a headlamp. Beginners welcome, I’ll show you the basics.'},
  c7:{hostTag:'NTU · local',desc:'Morning session at Jinshan before the wind picks up. 2 seats left in my car, board racks on the roof.'},
  c8:{hostTag:'Expat · Da’an',desc:'35mm print as part of the Wong Kar-wai retrospective, English subtitles. We sit together and grab drinks after.'},
  c1:{thread:'trips',hostTag:'Expat · Da’an',desc:'Cycling around the lake on Saturday, Ita Thao and the ropeway on Sunday. About NT$1,500 per person for the car, gas and hostel.'},
  c2:{hostTag:'NTUST',desc:'Easy 30-minute climb, back in time for class. Breakfast at the soy milk shop afterwards.'},
  c3:{thread:'mandarin',hostTag:'NTU · local',desc:'30 minutes in each language. All levels welcome, beginners especially. Buy your own coffee.'},
  c4:{thread:'gamers',hostTag:'Expat · Shida',desc:'Two tables booked, Catan and Codenames. Table fee is NT$150. Join the waitlist in case someone drops out.'},
  c5:{thread:'trips',hostTag:'Exchange · NTUST',desc:'Pingxi line train, sky lanterns in Shifen, dinner on Jiufen Old Street. About NT$600 per person.'}
};
EVENTS.forEach(e=>Object.assign(e,DETAILS[e.id]));
const PEOPLE=[['marco.it','Exchange · NTU'],['jess_au','Expat · Da’an'],['yuki_ex','Exchange · NTUST'],['daniel.h','NTU · local'],['nina.b','Expat · Zhongshan'],['felix_k','Exchange · NTU'],['hana.j','NTUST · local'],['sam.uk','Expat · Xinyi'],['leo.fr','Exchange · NCCU'],['amy_run','NTU · local'],['wen.c','NTU · local']];

const THREADS=[
  {id:'anglers',name:'Taipei Anglers',icon:'fish',color:'#8FC1E3',tag:'Outdoors',members:1284,online:37,time:'14:22',unread:3,followed:true,
   msgs:[['kevin_w','Squid season is picking up, who’s in for Saturday?','13:40'],['kevin_w',{event:'c6'},'13:41'],['marco.it','I’m in. Taking the 5:40 train from Taipei Main','13:52'],['yu.hsuan','Bring glow jigs, they worked great last weekend 🦑','14:05'],['me','First time sea fishing here — do I need a license?','14:10'],['kevin_w','No license needed for shore fishing in Taiwan. Just avoid the marked navy areas','14:22']]},
  {id:'surf',name:'Surf North Coast',icon:'wave',color:'#7FD1C1',tag:'Sports',members:2310,online:64,time:'13:58',unread:12,followed:true,
   msgs:[['jess_au','Swell looks solid for Jinshan on Saturday, 1–1.5m','12:30'],['ryo_surf','Wind turns offshore after 9 AM, go early','12:41'],['lin.wei','I have 2 free seats from Gongguan, made an event for it','13:19'],['lin.wei',{event:'c7'},'13:20'],['me','Can I grab one? I’ll bring my own board','13:35'],['lin.wei','Sure, DM me your number 🤙','13:58']]},
  {id:'cinema',name:'Taipei Cinephiles',icon:'film',color:'#E8A0BF',tag:'Culture',members:980,online:21,time:'12:10',unread:0,followed:true,
   msgs:[['sofia.r','Is anyone going to the Wong Kar-wai retrospective at SPOT Huashan?','11:02'],['daniel.h','Saw In the Mood for Love there last night, the 35mm print is beautiful','11:15'],['sofia.r',{event:'c8'},'11:20'],['me','Which days are the screenings?','11:40'],['sofia.r','Every weekend until Oct 25, English subtitles on all of them','12:10']]},
  {id:'runners',name:'Riverside Runners',icon:'run',color:'#F0C987',tag:'Sports',members:1542,online:18,time:'10:05',unread:0,
   msgs:[['amy_run','Tonight’s 10K group is leaving at 7:05 sharp','09:20'],['tom_de','Is the riverside path still flooded near Yongfu bridge?','09:44'],['amy_run','Cleared yesterday, all good now','10:05']]},
  {id:'boulder',name:'Bouldering Taipei',icon:'mountain',color:'#C9B6F2',tag:'Sports',members:870,online:12,time:'Yesterday',unread:0,
   msgs:[['nina.b','New set at the Neihu gym, lots of slab problems','Yesterday'],['felix_k','Anyone want to go Friday evening?','Yesterday'],['nina.b','Count me in','Yesterday']]},
  {id:'nightmarket',name:'Night Market Hunters',icon:'bowl',color:'#F2A488',tag:'Food',members:3120,online:88,time:'14:40',unread:0,
   msgs:[['hana.j','Ningxia tonight, the oyster omelette stall with the long queue is worth it','14:02'],['leo.fr','Best stinky tofu in Shilin? Asking for a brave friend','14:21'],['wen.c','Skip Shilin for that, go to Shenkeng on the weekend','14:40']]},
  {id:'film',name:'Film Photography TPE',icon:'camera',color:'#B8D8A8',tag:'Culture',members:640,online:9,time:'Mon',unread:0,
   msgs:[['koji.m','Where do people develop 120 film these days?','Mon'],['ella.p','Lab on Bo’ai Road, 2 days turnaround, NT$180 per roll','Mon']]},
  {id:'mandarin',name:'Mandarin Survival Club',icon:'lang',color:'#9CCBB1',tag:'Language',members:4205,online:103,time:'14:31',unread:0,
   msgs:[['sam.uk','How do I say “no ice” at the tea shop?','14:12'],['chenyu','去冰 (qù bīng). Or 少冰 for less ice','14:20'],['sam.uk','謝謝! Just tried it and it worked','14:31'],['chenyu',{event:'c3'},'14:35']]},
  {id:'jazz',name:'Live Music Taipei',icon:'music',color:'#E8A0BF',tag:'Music',members:1860,online:41,time:'13:12',unread:0,
   msgs:[['ryo_surf','Who’s playing at the jazz bar in Da’an this Friday?','12:50'],['sofia.r','A trio from Kaohsiung, the pianist is great','13:12']]},
  {id:'guitar',name:'Guitar & Jam Buddies',icon:'music',color:'#F0C987',tag:'Music',members:520,online:8,time:'Sun',unread:0,
   msgs:[['felix_k','Looking for a bassist for Sunday jams in Gongguan','Sun'],['leo.fr','I play bass! Where do you rehearse?','Sun']]},
  {id:'afterdark',name:'Taipei After Dark',icon:'moon',color:'#C9B6F2',tag:'Nightlife',members:2740,online:95,time:'14:48',unread:0,
   msgs:[['jess_au','Any rooftop bars with no cover charge in Xinyi?','14:30'],['marco.it','Try the one above the ATT 4 FUN mall, drinks from NT$300','14:48']]},
  {id:'gamers',name:'Taipei Gamers',icon:'game',color:'#8FC1E3',tag:'Gaming',members:1390,online:57,time:'14:02',unread:0,
   msgs:[['koji.m','Smash tournament at the NTU student center on Saturday','13:40'],['tom_de','Do we need to bring our own Switch?','14:02'],['tom_de',{event:'c4'},'14:06']]},
  {id:'tech',name:'Tech & Startups TPE',icon:'code',color:'#7FD1C1',tag:'Tech',members:980,online:22,time:'11:30',unread:0,
   msgs:[['daniel.h','Startup mixer at the Taipei Innovation Hub next Wednesday','11:02'],['sam.uk','Is it in English?','11:30']]},
  {id:'yoga',name:'Yoga & Wellness',icon:'leaf',color:'#B8D8A8',tag:'Wellness',members:760,online:11,time:'09:15',unread:0,
   msgs:[['nina.b','Free sunrise yoga at Da’an Park, Saturdays 7 AM','08:40'],['amy_run','Do I need my own mat?','09:15']]},
  {id:'sketch',name:'Urban Sketchers Taipei',icon:'palette',color:'#F2A488',tag:'Art',members:430,online:6,time:'Sat',unread:0,
   msgs:[['ella.p','This Saturday we’re drawing at Bopiliao Old Street','Sat'],['hana.j','I’ll be there, watercolors only!','Sat']]},
  {id:'dogs',name:'Taipei Dog Owners',icon:'paw',color:'#F0C987',tag:'Pets',members:1120,online:19,time:'12:25',unread:0,
   msgs:[['wen.c','Which riverside parks have off-leash areas?','12:10'],['yu.hsuan','Dajia Riverside Park has a big fenced one','12:25']]},
  {id:'trips',name:'Weekend Trips Taiwan',icon:'plane',color:'#7FD1C1',tag:'Travel',members:3380,online:72,time:'14:15',unread:0,
   msgs:[['priya.s','Taroko Gorge next month, is the trail open again?','13:55'],['anna.k','Partly. Shakadang trail is open, Zhuilu is still closed','14:15'],['anna.k',{event:'c1'},'14:18'],['priya.s',{event:'c5'},'14:24']]}
];
const TEAMS=[
  {id:'nbd',name:'SideQuest team',course:'MGT5012',icon:'bulb',color:'#F0C987',members:['mei_t','daniel.h','yuki_ex'],time:'14:32',unread:4,
   msgs:[['daniel.h','Mockup is almost done, can everyone check the calendar screen?','13:50'],['mei_t',{file:['SideQuest-mockup-v3.pdf','pdf','4.2 MB']},'14:02'],['yuki_ex','Looks great. I’ll start on the pitch slides tonight','14:10'],['mei_t',{deadline:'d2'},'14:20'],['daniel.h','Can we meet Thursday after class to rehearse?','14:32']],
   files:[['SideQuest-mockup-v3.pdf','pdf','4.2 MB','mei_t','Today'],['Market-research.xlsx','xlsx','860 KB','daniel.h','Mon'],['Interview-notes.docx','docx','120 KB','yuki_ex','Sun'],['Pitch-draft.pptx','pptx','9.8 MB','me','Fri']]},
  {id:'md2',name:'Machine Design II — Group 4',course:'ME3021',icon:'gear',color:'#8FC1E3',members:['felix_k','hana.j','wen.c'],time:'12:15',unread:2,
   msgs:[['felix_k','I finished the shaft calculations, uploading now','11:40'],['felix_k',{file:['Shaft-calcs.xlsx','xlsx','1.1 MB']},'11:41'],['hana.j',{deadline:'d1'},'11:55'],['wen.c','I’ll do the bearing selection part tomorrow','12:15']],
   files:[['Shaft-calcs.xlsx','xlsx','1.1 MB','felix_k','Today'],['Gearbox-sketch.png','png','2.4 MB','hana.j','Sat'],['Report-template.docx','docx','85 KB','wen.c','Thu']]},
  {id:'mkt',name:'Marketing case study',course:'BA2104',icon:'chart',color:'#E8A0BF',members:['sofia.r','leo.fr','amy_run'],time:'Yesterday',unread:0,
   msgs:[['sofia.r','Which brand should we pick? I vote for the bubble tea chain','Yesterday'],['leo.fr','Agreed, lots of public data on them',"Yesterday"],['amy_run',{deadline:'d3'},'Yesterday']],
   files:[['Case-brief.pdf','pdf','640 KB','sofia.r','Yesterday'],['Competitor-list.xlsx','xlsx','210 KB','leo.fr','Yesterday']]},
  {id:'chn',name:'Mandarin 102 study group',course:'CHN102',icon:'lang',color:'#9CCBB1',members:['chenyu','sam.uk','nina.b'],time:'Mon',unread:0,
   msgs:[['chenyu','Uploaded the vocab list for chapters 5–6','Mon'],['chenyu',{file:['Vocab-ch5-6.pdf','pdf','300 KB']},'Mon'],['sam.uk','Thanks! Flashcards session before the midterm?','Mon']],
   files:[['Vocab-ch5-6.pdf','pdf','300 KB','chenyu','Mon'],['Grammar-notes.docx','docx','95 KB','nina.b','Sep 24']]}
];
// deadlines belong to a team; exams and other entries are personal calendar items
const UNI_ITEMS=[
  {id:'d1',kind:'deadline',team:'md2',course:'ME3021',title:'Gearbox calculation report',date:'2026-10-02',time:'11:59 PM'},
  {id:'d2',kind:'deadline',team:'nbd',course:'MGT5012',title:'Business model canvas',date:'2026-10-06',time:'12:00 PM'},
  {id:'d3',kind:'deadline',team:'mkt',course:'BA2104',title:'Case study slides',date:'2026-10-08',time:'6:00 PM'},
  {id:'d4',kind:'deadline',team:'md2',course:'ME3021',title:'CAD model v2',date:'2026-10-14',time:'11:59 PM'},
  {id:'d5',kind:'deadline',team:'nbd',course:'MGT5012',title:'Final pitch deck + mockup demo',date:'2026-10-20',time:'9:00 AM'},
  {id:'x1',kind:'exam',course:'CHN102',title:'Mandarin 102 midterm',date:'2026-10-09',time:'10:20 AM',place:'Liberal Arts, Room 204'},
  {id:'x2',kind:'exam',course:'BA2104',title:'Marketing Strategy quiz',date:'2026-10-13',time:'2:20 PM',place:'Management Bldg 2, Room 301'},
  {id:'x3',kind:'exam',course:'ME3021',title:'Machine Design II midterm',date:'2026-10-22',time:'9:10 AM',place:'Engineering Hall, 1F'},
  {id:'o1',kind:'other',course:'MGT5012',title:'Office hours with Prof. Lin',date:'2026-10-07',time:'3:30 PM',place:'Management Bldg 1, Room 512'}
];
export {EVENTS,PEOPLE,THREADS,TEAMS,UNI_ITEMS};
