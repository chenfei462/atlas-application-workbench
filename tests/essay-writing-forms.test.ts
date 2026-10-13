import test from 'node:test';
import assert from 'node:assert/strict';
import {editors,editorHtml} from '../src/forms.js';

test('programme requirements expose separate English-word and character limits',()=>{
 const html=editorHtml(editors.program_essay_requirements,{});
 assert.match(html,/name="word_limit"/);
 assert.match(html,/name="character_limit"/);
 assert.match(html,/字符上限/);
});

test('an essay without a linked requirement can retain its own original prompt and word limit',()=>{
 const html=editorHtml(editors.essays,{});
 assert.match(html,/name="prompt"/);
 assert.match(html,/name="word_limit"/);
});
