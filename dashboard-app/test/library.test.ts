import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileNameFor, isBlankVersion, isUnwritten, languageOptions, newerVersion, nextVersion, protocolText, sortEntries } from '../src/extended/modules/library/logic.ts';
import type { LibraryEntry, LibraryVersion } from '../src/extended/lib/types.ts';

const entry=(over:Partial<LibraryEntry>):LibraryEntry=>({id:'e',kind:'protocol',title:'Western blot',technique:'',language:'',purpose:'',tags:[],project_id:null,paper_id:null,
 publication_id:null,source_url:null,current_version_id:null,pinned:false,archived_at:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',...over});
const ver=(over:Partial<LibraryVersion>):LibraryVersion=>({id:'v1',entry_id:'e',version:1,body:'',materials:'',notes:'',change_note:'',created_at:'2026-01-01T00:00:00Z',...over});

test('the next version is one more than the highest saved, whatever the order or gaps',()=>{
 assert.equal(nextVersion([]),1);
 assert.equal(nextVersion([ver({version:1})]),2);
 assert.equal(nextVersion([ver({version:4}),ver({version:1}),ver({version:2})]),5);
});

test('a version is blank only when steps, materials and notes are all empty',()=>{
 assert.ok(isBlankVersion(ver({})));
 assert.ok(isBlankVersion(ver({body:'  \n',materials:'\t',notes:' ',change_note:'ignored'})));
 assert.equal(isBlankVersion(ver({body:'Block in BSA'})),false);
 assert.equal(isBlankVersion(ver({materials:'anti-pSTAT3'})),false);
 assert.equal(isBlankVersion(ver({notes:'Keep cold'})),false);
});

test('only an entry with nothing but an empty version 1 is filled in place of getting a version 2',()=>{
 assert.ok(isUnwritten([]));
 assert.ok(isUnwritten([ver({})]));
 assert.equal(isUnwritten([ver({body:'x'})]),false);
 assert.equal(isUnwritten([ver({id:'v2',version:2})]),false);
 assert.equal(isUnwritten([ver({}),ver({id:'v2',version:2,body:'x'})]),false);
});

test('a newer version is offered only when the entry has moved past the one in use',()=>{
 const v1=ver({id:'v1',version:1}),v2=ver({id:'v2',version:2}),v3=ver({id:'v3',version:3});
 const all=[v3,v2,v1];
 assert.equal(newerVersion(entry({current_version_id:'v3'}),v1,all),v3);
 assert.equal(newerVersion(entry({current_version_id:'v3'}),v3,all),null);
 // Rolled back: the current version is older than the one in use.
 assert.equal(newerVersion(entry({current_version_id:'v1'}),v2,all),null);
 assert.equal(newerVersion(entry({current_version_id:null}),v1,all),null);
 assert.equal(newerVersion(entry({current_version_id:'v3'}),undefined,all),null);
 // A version of another entry is never compared.
 assert.equal(newerVersion(entry({id:'other',current_version_id:'v3'}),v1,all),null);
 assert.equal(newerVersion(entry({current_version_id:'gone'}),v1,all),null);
});

test('a download is named from the title with the extension of its language',()=>{
 const name=(title:string,language:string)=>fileNameFor(entry({kind:'code',title,language}));
 assert.equal(name('Bayesian BMI model','R'),'Bayesian-BMI-model.R');
 assert.equal(name('plot','r'),'plot.R');
 assert.equal(name('Cell counts','Python'),'Cell-counts.py');
 assert.equal(name('align','bash'),'align.sh');
 assert.equal(name('align','Shell'),'align.sh');
 assert.equal(name('cohort','SQL'),'cohort.sql');
 assert.equal(name('chart','JavaScript'),'chart.js');
 assert.equal(name('chart','TypeScript'),'chart.ts');
 assert.equal(name('fit','MATLAB'),'fit.m');
 assert.equal(name('fit',' julia '),'fit.jl');
 assert.equal(name('notes','Nextflow'),'notes.txt');
 assert.equal(name('notes',''),'notes.txt');
 // Safe characters only, no doubled extension, and never an empty name.
 assert.equal(name('../etc/passwd: a "test" <x>?','R'),'etc-passwd-a-test-x.R');
 assert.equal(name('deseq2_run.R','R'),'deseq2_run.R');
 assert.equal(name('  ','Python'),'untitled.py');
 assert.match(name('Größe über/alles\n2','R'),/^[A-Za-z0-9._-]+\.R$/);
});

test('entries sort pinned first, then most recently updated, without changing the list given',()=>{
 const list=[entry({id:'old',updated_at:'2026-01-01T00:00:00Z'}),entry({id:'new',updated_at:'2026-06-01T00:00:00Z'}),entry({id:'pinned-old',pinned:true,updated_at:'2025-01-01T00:00:00Z'}),entry({id:'pinned-new',pinned:true,updated_at:'2026-02-01T00:00:00Z'})];
 assert.deepEqual(sortEntries(list).map(e=>e.id),['pinned-new','pinned-old','new','old']);
 assert.equal(list[0].id,'old');
});

test('a protocol copied into an experiment carries its steps and, if any, its reagents',()=>{
 assert.equal(protocolText(ver({body:'1. Block\n2. Probe\n',materials:''})),'1. Block\n2. Probe');
 assert.equal(protocolText(ver({body:'1. Block',materials:' anti-pSTAT3 1:1000 '})),'1. Block\n\nReagents: anti-pSTAT3 1:1000');
 assert.equal(protocolText(ver({})),'');
});

test('language suggestions put the ones already used first, without duplicates',()=>{
 const o=languageOptions(['Nextflow','r','',' Nextflow ']);
 assert.deepEqual(o.slice(0,2),['Nextflow','r']);
 assert.equal(o.filter(l=>l.toLowerCase()==='r').length,1);
 assert.ok(o.includes('Python'));
});
