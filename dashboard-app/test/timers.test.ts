import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SECONDS, acknowledge, addTime, advance, clampSeconds, clearFinished, createTimer, describeSeconds, due, formatClock, formatElapsed, lapTimes, move, parseHms, parseSetData,
 pause, projectedEnds, remaining, reminderChanges, reset, resume, ringing, sequenceInfo, soonest, splitHms, start, startAll, startLoaded, stopwatchElapsed, stopwatchLap, stopwatchStart,
 stopwatchStop, STOPWATCH_ZERO, timersFromSet, toSetData, wantedReminders, type Timer } from '../src/extended/modules/bench/timers/logic.ts';

const T0=1_800_000_000_000;
const MIN=60_000;
const timer=(id:string,seconds:number,over:Partial<Timer>={}):Timer=>({...createTimer(id,id,seconds),...over});
const ids=()=>{let n=0;return()=>`id${++n}`};

test('typed hours, minutes and seconds become seconds',()=>{
 assert.equal(parseHms('','5',''),300);
 assert.equal(parseHms('1','30','15'),5415);
 assert.equal(parseHms('','90',''),5400);
 assert.equal(parseHms('',' 1,5 ',''),90);
 assert.equal(parseHms('','','45'),45);
 assert.equal(parseHms('','',''),null);
 assert.equal(parseHms('0','0','0'),null);
 assert.equal(parseHms('','abc',''),null);
 assert.equal(parseHms('','-5',''),null);
 assert.equal(parseHms('500','',''),MAX_SECONDS);
 assert.deepEqual(splitHms(5415),{h:1,m:30,s:15});
 assert.equal(clampSeconds(Number.NaN),0);
 assert.equal(clampSeconds(1e9),MAX_SECONDS);
});

test('time is shown as m:ss, and h:mm:ss from an hour up',()=>{
 assert.equal(formatClock(0),'0:00');
 assert.equal(formatClock(1),'0:01');
 assert.equal(formatClock(59_001),'1:00');
 assert.equal(formatClock(600_000),'10:00');
 assert.equal(formatClock(3_600_000),'1:00:00');
 assert.equal(formatClock(3_725_000),'1:02:05');
 assert.equal(formatClock(-500),'0:00');
 assert.equal(formatElapsed(65_430),'1:05.4');
 assert.equal(formatElapsed(3_725_900),'1:02:05.9');
 assert.equal(describeSeconds(5400),'1 h 30 min');
 assert.equal(describeSeconds(45),'45 s');
});

test('a new timer is idle with its full time, named by its length when unnamed',()=>{
 const t=createTimer('a','',600);
 assert.equal(t.status,'idle');assert.equal(t.name,'10 min');assert.equal(remaining(t,T0),600_000);
 assert.equal(createTimer('b',' Block ',60,'blue').name,'Block');
 assert.equal(createTimer('c','x',0).seconds,1);
});

test('a running timer is its end time: remaining follows the clock',()=>{
 const t=start(timer('a',600),T0);
 assert.equal(t.endsAt,T0+600_000);
 assert.equal(remaining(t,T0+1),599_999);
 assert.equal(remaining(t,T0+599_999),1);
 assert.equal(remaining(t,T0+700_000),0);
 assert.equal(start(t,T0+5000),t,'starting a running timer changes nothing');
});

test('pause and resume keep the remaining time exactly',()=>{
 let t=start(timer('a',600),T0);
 t=pause(t,T0+123_456);
 assert.equal(t.status,'paused');assert.equal(t.endsAt,null);assert.equal(t.remainingMs,476_544);
 // However long it stays paused, nothing is lost.
 assert.equal(remaining(t,T0+9_999_999),476_544);
 t=resume(t,T0+5_000_000);
 assert.equal(t.endsAt,T0+5_000_000+476_544);
 t=pause(t,T0+5_000_000+76_544);
 assert.equal(t.remainingMs,400_000);
 assert.equal(pause(t,T0),t,'pausing a paused timer changes nothing');
});

test('the clock jumping (device asleep) causes no drift',()=>{
 const t=start(timer('a',1800),T0);
 // Nothing ran for ten minutes; the first look afterwards is still exact.
 assert.equal(remaining(t,T0+10*MIN),20*MIN);
 assert.equal(due([t],T0+10*MIN).length,0);
 // Asleep past the end: it is due, and it ended when it should have, not when the device woke.
 const woke=T0+47*MIN;
 const {timers,fired}=advance([t],woke);
 assert.equal(timers[0].status,'done');assert.equal(timers[0].finishedAt,T0+30*MIN);
 assert.deepEqual(fired,[{id:'a',name:'a',endedAt:T0+30*MIN}]);
 assert.deepEqual(advance(timers,woke+MIN).fired,[],'a finished timer fires once');
});

test('reset, +1 min and acknowledging',()=>{
 let t=start(timer('a',300),T0);
 t=addTime(t,MIN,T0+10_000);
 assert.equal(t.endsAt,T0+360_000);
 assert.equal(addTime(pause(t,T0+60_000),MIN,T0+60_000).remainingMs,360_000);
 assert.equal(addTime(timer('i',300),MIN,T0).remainingMs,360_000);
 const done=advance([t],T0+400_000).timers[0];
 assert.equal(ringing([done]).length,1);
 assert.equal(ringing([acknowledge(done)]).length,0);
 // +1 min on a finished timer runs one more minute from now.
 const again=addTime(done,MIN,T0+500_000);
 assert.equal(again.status,'running');assert.equal(again.endsAt,T0+560_000);assert.equal(again.acked,false);
 const back=reset(again);
 assert.equal(back.status,'idle');assert.equal(back.remainingMs,300_000);assert.equal(back.endsAt,null);
 // Starting a finished timer runs its full length again.
 assert.equal(start(done,T0+900_000).endsAt,T0+900_000+300_000);
 // Time added never exceeds the maximum.
 assert.equal(addTime(start(timer('m',MAX_SECONDS),T0),MIN,T0).endsAt,T0+MAX_SECONDS*1000);
});

test('several timers ending in the same second all fire, once, in order',()=>{
 const list=[start(timer('a',60),T0+400),start(timer('b',60),T0),start(timer('c',61),T0),timer('idle',60),start(timer('later',600),T0)];
 assert.deepEqual(due(list,T0+60_500).map(t=>t.id),['b','a']);
 const {timers,fired}=advance(list,T0+61_000);
 assert.deepEqual(fired.map(f=>f.id),['b','a','c']);
 assert.deepEqual(timers.map(t=>t.status),['done','done','done','idle','running']);
 assert.deepEqual(ringing(timers).map(t=>t.id),['a','b','c']);
 assert.equal(soonest(timers)?.id,'later');
 assert.deepEqual(clearFinished(timers).map(t=>t.id),['idle','later']);
});

test('a sequential set runs one step after another',()=>{
 const data={timers:[{name:'Block',seconds:3600},{name:'Wash 1',seconds:600},{name:'Wash 2',seconds:600},{name:'Wash 3',seconds:600}],sequential:true};
 const loaded=timersFromSet(data,'Western',ids());
 assert.ok(loaded.every(t=>t.seq==='id1'&&t.setTitle==='Western'));
 let list=startLoaded(loaded,loaded,T0);
 assert.deepEqual(list.map(t=>t.status),['running','idle','idle','idle']);
 let info=sequenceInfo(list,'id1');
 assert.equal(info.current?.name,'Block');assert.equal(info.position,1);assert.equal(info.next?.name,'Wash 1');
 // The whole run is known in advance.
 assert.deepEqual([...projectedEnds(list).values()],[T0+60*MIN,T0+70*MIN,T0+80*MIN,T0+90*MIN]);

 // Block ends: Wash 1 starts at that moment, even though the tick came 4 s late.
 let step=advance(list,T0+60*MIN+4000);
 assert.deepEqual(step.fired,[{id:'id2',name:'Block',endedAt:T0+60*MIN,setTitle:'Western',next:'Wash 1'}]);
 list=step.timers;
 assert.equal(list[0].startedNext,'Wash 1');
 assert.equal(list[1].status,'running');assert.equal(list[1].endsAt,T0+70*MIN);
 info=sequenceInfo(list,'id1');
 assert.equal(info.current?.name,'Wash 1');assert.equal(info.position,2);assert.equal(info.next?.name,'Wash 2');

 // Pausing a step holds the sequence; nothing follows until it is resumed.
 const held=list.map(t=>t.id==='id3'?pause(t,T0+65*MIN):t);
 assert.deepEqual(advance(held,T0+200*MIN).fired,[]);
 assert.equal(projectedEnds(held).size,0);

 // The device slept through two washes: both fire, each at its own time, and the third is running.
 step=advance(list,T0+85*MIN);
 assert.deepEqual(step.fired.map(f=>[f.name,f.endedAt,f.next]),[['Wash 1',T0+70*MIN,'Wash 2'],['Wash 2',T0+80*MIN,'Wash 3']]);
 list=step.timers;
 assert.equal(list[3].endsAt,T0+90*MIN);
 step=advance(list,T0+90*MIN);
 assert.deepEqual(step.fired.map(f=>[f.name,f.next]),[['Wash 3',undefined]]);
 assert.ok(sequenceInfo(step.timers,'id1').finished);
});

test('start all starts loose timers and only the current step of a sequence',()=>{
 const seq=timersFromSet({timers:[{name:'A',seconds:60},{name:'B',seconds:60}],sequential:true},'S',ids());
 const list=[timer('x',60),pause(start(timer('y',60),T0),T0+1000),...seq,advance([start(timer('z',1),T0)],T0+5000).timers[0]];
 const out=startAll(list,T0+10_000);
 assert.deepEqual(out.map(t=>t.status),['running','running','running','idle','done']);
 assert.equal(out[1].endsAt,T0+10_000+59_000);
 assert.deepEqual(startAll(out,T0+20_000),out,'nothing more to start');
 // A plain set starts all of its timers.
 const plain=timersFromSet({timers:[{name:'A',seconds:60},{name:'B',seconds:90}]},'P',ids());
 assert.deepEqual(startLoaded([timer('keep',60),...plain],plain,T0).map(t=>t.status),['idle','running','running']);
});

test('reordering and saving as a set',()=>{
 const list=[timer('a',60),timer('b',120,{color:'blue'}),timer('c',180)];
 assert.deepEqual(move(list,'c',-1).map(t=>t.id),['a','c','b']);
 assert.deepEqual(move(list,'a',1).map(t=>t.id),['b','a','c']);
 assert.equal(move(list,'a',-1),list);assert.equal(move(list,'c',1),list);
 const data=toSetData(list,true);
 assert.deepEqual(data,{timers:[{name:'a',seconds:60},{name:'b',seconds:120,color:'blue'},{name:'c',seconds:180}],sequential:true});
 assert.deepEqual(parseSetData(JSON.parse(JSON.stringify(data))),data);
 assert.deepEqual(parseSetData(null),{timers:[],sequential:false});
 assert.deepEqual(parseSetData({timers:[{name:5,seconds:'90'},{seconds:-1},'junk',{name:'ok',seconds:1e9}]}),
  {timers:[{name:'',seconds:90},{name:'ok',seconds:MAX_SECONDS}],sequential:false});
});

test('telegram reminders follow the timers',()=>{
 const none=new Map();
 const short=start(timer('s',119),T0), long=timer('l',120);
 assert.equal(wantedReminders([short,long],true).size,0,'nothing for short or idle timers');
 const running=start(long,T0);
 let want=wantedReminders([short,running],true);
 assert.deepEqual([...want],[['l',{at:T0+120_000,title:'Timer done: l',body:null}]]);
 assert.equal(wantedReminders([running],false).size,0);
 assert.deepEqual(reminderChanges(none,want),{remove:[],put:[...want]});
 // Paused: the row goes. Resumed or +1 min: it is written again with the new time.
 assert.deepEqual(reminderChanges(want,wantedReminders([pause(running,T0+1000)],true)),{remove:['l'],put:[]});
 const more=wantedReminders([addTime(running,MIN,T0)],true);
 assert.deepEqual(reminderChanges(want,more).put.map(([id,w])=>[id,w.at]),[['l',T0+180_000]]);
 // Finished and still sounding: the row stays for the server; acknowledged: it goes.
 const done=advance([running],T0+120_000).timers;
 assert.deepEqual(reminderChanges(want,wantedReminders(done,true)),{remove:[],put:[]});
 assert.deepEqual(reminderChanges(want,wantedReminders(done.map(acknowledge),true)),{remove:['l'],put:[]});
 // A sequence has all its steps scheduled from the start, and advancing changes none of them.
 const seq=timersFromSet({timers:[{name:'Block',seconds:3600},{name:'Wash',seconds:600}],sequential:true},'Western',ids());
 const begun=startLoaded(seq,seq,T0);
 want=wantedReminders(begun,true);
 assert.deepEqual([...want.values()],[{at:T0+60*MIN,title:'Timer done: Block',body:'Western · Next: Wash'},{at:T0+70*MIN,title:'Timer done: Wash',body:'Western'}]);
 assert.deepEqual(reminderChanges(want,wantedReminders(advance(begun,T0+61*MIN).timers,true)),{remove:[],put:[]});
});

test('the stopwatch counts from timestamps and keeps laps',()=>{
 let w=stopwatchStart(STOPWATCH_ZERO,T0);
 assert.equal(stopwatchElapsed(w,T0+12_345),12_345);
 w=stopwatchLap(w,T0+10_000);
 w=stopwatchStop(w,T0+15_000);
 assert.equal(stopwatchElapsed(w,T0+999_999),15_000,'stopped: time stands still');
 w=stopwatchStart(w,T0+100_000);
 w=stopwatchLap(w,T0+107_000);
 assert.equal(stopwatchElapsed(w,T0+110_000),25_000);
 assert.deepEqual(w.laps,[10_000,22_000]);
 assert.deepEqual(lapTimes(w.laps),[10_000,12_000]);
 assert.equal(stopwatchStart(w,T0+200_000),w);
});
