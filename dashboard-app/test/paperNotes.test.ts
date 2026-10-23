import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeNote,decodeNote,noteFilename,noteWords} from '../src/lib/paperNotes.ts';
test('Markdown file preserves long pasted comments exactly through a save/read cycle',()=>{
 const body='Reviewer 1\n\n> Explain Figure 2a.\n\n## Response\nβ = 0.10; 127 patients.\n\n|A|B|\n|-|-|\n|1|2|\n'+('Long note\n'.repeat(10000));
 assert.deepEqual(decodeNote(encodeNote('First review comments',body)),{title:'First review comments',body});
});
test('title cannot inject extra file headers; downloaded filename stays a Markdown filename',()=>{
 assert.equal(decodeNote(encodeNote('Review\nreply','text')).title,'Review reply');
 assert.equal(noteFilename('../review: reply?'),'..-review- reply-.md');
 assert.equal(noteFilename(''),'paper-note.md');
});
test('plain Markdown without the application title header remains readable',()=>{
 assert.equal(decodeNote('Plain text\n\nNothing removed.').body,'Plain text\n\nNothing removed.');
 assert.equal(noteWords('  '),0);assert.equal(noteWords('One\n two'),2);
});
