import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSteps, publicationPatch, stepPatch, summarise, isDecided, daysAt, daysInStep, submittedOnPatch, decidedOnPatch, paperOfProject, projectPhaseFor, type Submission } from '../src/lib/submissions.ts';

const sub=(over:Partial<Submission>):Submission=>({id:'s',publication_id:'p',journal:'J',position:0,status:'submitted',submitted_on:'2026-01-10',decided_on:null,
 history:[{status:'submitted',on:'2026-01-10'}],manuscript_ref:'',notes:'',review_comments:'',decision_email_url:'',created_at:'2026-01-10T00:00:00Z',updated_at:'2026-01-10T00:00:00Z',...over});

test('a submission offers only the steps that can follow its state',()=>{
 assert.deepEqual(nextSteps('submitted').map(s=>s.status),['under_review','desk_rejected','withdrawn']);
 assert.deepEqual(nextSteps('under_review').map(s=>s.status),['revision_requested','accepted','rejected']);
 assert.deepEqual(nextSteps('revision_requested').map(s=>s.status),['resubmitted','withdrawn']);
 assert.deepEqual(nextSteps('resubmitted').map(s=>s.status),['revision_requested','accepted','rejected']);
 for(const s of ['desk_rejected','rejected','accepted','withdrawn'] as const){assert.equal(nextSteps(s).length,0);assert.ok(isDecided(s))}
});

test('recording a step keeps the history and dates the decision',()=>{
 const review=stepPatch(sub({}),'under_review','2026-01-15');
 assert.equal(review.decided_on,null);assert.equal(review.history.length,2);
 const desk=stepPatch(sub({}),'desk_rejected','2026-01-14');
 assert.equal(desk.decided_on,'2026-01-14');assert.deepEqual(desk.history.at(-1),{status:'desk_rejected',on:'2026-01-14'});
 // A step cannot be dated before the submission.
 assert.equal(stepPatch(sub({}),'desk_rejected','2026-01-01').decided_on,'2026-01-10');
});

test('the publication follows its latest submission',()=>{
 assert.deepEqual(publicationPatch('Nature Cancer','submitted'),{venue:'Nature Cancer',stage:'Under Review',rejection_type:null});
 assert.deepEqual(publicationPatch('Nature Cancer','desk_rejected'),{venue:'Nature Cancer',stage:'Rejected',rejection_type:'Desk rejection'});
 assert.deepEqual(publicationPatch('Gut','rejected'),{venue:'Gut',stage:'Rejected',rejection_type:'After review'});
 assert.equal(publicationPatch('Gut','revision_requested').stage,'Revision Requested');
 assert.equal(publicationPatch('Gut','resubmitted').stage,'Under Review');
 assert.equal(publicationPatch('Gut','accepted').stage,'Accepted');
 assert.equal(publicationPatch('Gut','withdrawn').stage,'Drafting');
});

test('the summary counts rejections by kind and says where the paper is now',()=>{
 const rows=[
  sub({id:'c',journal:'Cancer Research',position:2,status:'under_review',submitted_on:'2026-03-01',history:[{status:'submitted',on:'2026-03-01'},{status:'under_review',on:'2026-03-06'}]}),
  sub({id:'a',journal:'Nature Cancer',position:0,status:'desk_rejected',decided_on:'2026-01-14'}),
  sub({id:'b',journal:'Gut',position:1,status:'rejected',submitted_on:'2026-01-20',decided_on:'2026-02-25'}),
 ];
 const t=summarise(rows,'2026-03-16');
 assert.deepEqual(t.rows.map(r=>r.journal),['Nature Cancer','Gut','Cancer Research']);
 assert.equal(t.current?.journal,'Cancer Research');
 assert.deepEqual(t.deskRejections.map(r=>r.journal),['Nature Cancer']);
 assert.deepEqual(t.reviewRejections.map(r=>r.journal),['Gut']);
 assert.equal(t.headline,'Under review at Cancer Research · 10 days in this step, 15 days at this journal.');
 assert.equal(daysAt(rows[1],'2026-03-16'),4);
 assert.equal(summarise([],'2026-03-16').headline,'Not submitted anywhere yet.');
 assert.equal(summarise([rows[1]],'2026-03-16').headline,'Desk rejected at Nature Cancer. Not at a journal now.');
 assert.equal(summarise([sub({status:'accepted',decided_on:'2026-02-01'})],'2026-03-16').headline,'Accepted at J.');
});

test('a back-dated or re-dated submission counts the same days on the card and in the detail',()=>{
 // Entered today as submitted four days ago.
 const fresh=sub({submitted_on:'2026-11-23',history:[{status:'submitted',on:'2026-11-23'}]});
 assert.equal(summarise([fresh],'2026-11-27').headline,'Submitted to J · 4 days.');
 // Recorded with today's date, then the submitted date corrected: the first step moves with it.
 const wrong=sub({submitted_on:'2026-11-27',history:[{status:'submitted',on:'2026-11-27'}]});
 const fixed={...wrong,...submittedOnPatch(wrong,'2026-11-23')};
 assert.deepEqual(fixed.history,[{status:'submitted',on:'2026-11-23'}]);
 assert.equal(daysInStep(fixed,'2026-11-27'),4);assert.equal(daysAt(fixed,'2026-11-27'),4);
 // Moving the submitted date later never leaves an earlier step behind it.
 const later=submittedOnPatch(sub({history:[{status:'submitted',on:'2026-01-10'},{status:'under_review',on:'2026-01-12'}]}),'2026-01-15');
 assert.deepEqual(later.history.map(h=>h.on),['2026-01-15','2026-01-15']);
 const decided=decidedOnPatch(sub({history:[{status:'submitted',on:'2026-01-10'},{status:'desk_rejected',on:'2026-01-14'}]}),'2026-01-12');
 assert.equal(decided.decided_on,'2026-01-12');assert.equal(decided.history.at(-1)!.on,'2026-01-12');
});

test('a project follows the paper that speaks for it',()=>{
 for(const phase of ['Planning','Active','Analysis','Writing',null]){
  for(const s of ['submitted','under_review','revision_requested','resubmitted','accepted'] as const)assert.equal(projectPhaseFor(phase,s),'Submitted');
 }
 assert.equal(projectPhaseFor('Submitted','under_review'),null,'already there');
 for(const s of ['desk_rejected','rejected','withdrawn'] as const){
  assert.equal(projectPhaseFor('Submitted',s),'Writing');
  assert.equal(projectPhaseFor('Analysis',s),null,'a project that was not Submitted is left alone');
 }
 for(const phase of ['Paused','Completed','Archived'])for(const s of ['submitted','rejected','accepted'] as const)assert.equal(projectPhaseFor(phase,s),null);
 assert.equal(projectPhaseFor('Writing',null),null);
 // Which paper speaks: the output publication, else the only publication, else none.
 const papers=[{id:'a',project_id:'p'},{id:'b',project_id:'p'},{id:'c',project_id:'q'}];
 assert.equal(paperOfProject({id:'p',output_publication_id:'b'},papers),'b');
 assert.equal(paperOfProject({id:'p'},papers),null);
 assert.equal(paperOfProject({id:'q'},papers),'c');
 assert.equal(paperOfProject({id:'z'},papers),null);
});
