import test from 'node:test';
import assert from 'node:assert/strict';
import {editors,editorHtml,labelFor} from '../src/forms.ts';
import type {Snapshot} from '../src/repositories.ts';

const snapshot={programs:[{id:'program-a',program_name:'Synthetic MSc'}],applications:[{id:'application-a',program_id:'program-a',status:'PREPARING'}],essays:[{id:'essay-a',application_id:'application-a',type:'PS'}],essay_versions:[{id:'version-one',essay_id:'essay-a',version_number:1},{id:'version-two',essay_id:'essay-a',version_number:2}],evidence_items:[{id:'evidence-a',title:'Synthetic project'}],materials:[{id:'material-a',title:'Synthetic CV'}]} as unknown as Snapshot;

for(const [table,fields] of [
 ['material_application_links',['material_id','application_id']],
 ['evidence_material_links',['evidence_item_id','material_id']],
 ['essay_evidence_items',['essay_id','evidence_item_id']],
 ['essay_evidence_links',['essay_version_id','evidence_item_id','claim_note']],
] as const){
 test(`${table} offers its actual schema relations through the existing editor`,()=>{
  const editor=editors[table];assert.ok(editor,'Missing relation editor');
  const html=editorHtml(editor,snapshot);
  for(const name of fields)assert.ok(html.includes(`name="${name}"`),`Missing ${name}`);
  assert.ok(!html.includes('name="owner_id"'),'Owner is supplied by the repository, never a form field');
 });
}

test('essay versions and requirements identify the relevant essay/program instead of an ambiguous record',()=>{
 const first=labelFor('essay_versions',snapshot.essay_versions![0] as unknown as Record<string,unknown>,snapshot);
 const second=labelFor('essay_versions',snapshot.essay_versions![1] as unknown as Record<string,unknown>,snapshot);
 assert.match(first,/Synthetic MSc.*PS.*v1/);assert.match(second,/Synthetic MSc.*PS.*v2/);assert.notEqual(first,second);
 assert.match(labelFor('program_essay_requirements',{program_id:'program-a',essay_type:'PS',prompt:'Synthetic prompt'},snapshot),/Synthetic MSc.*PS.*Synthetic prompt/);
});

test('evidence/version selection escapes titles while retaining exact option IDs',()=>{
 const malicious={...snapshot,evidence_items:[{id:'evidence-a',title:'<script>fake</script>'}]} as unknown as Snapshot;
 const editor=editors.essay_evidence_links;assert.ok(editor);
 const html=editorHtml(editor,malicious);
 assert.ok(html.includes('value="evidence-a"'));assert.ok(html.includes('value="version-two"'));
 assert.ok(!html.includes('<script>fake</script>'));assert.ok(html.includes('&lt;script&gt;fake&lt;/script&gt;'));
});

test('two PS essays for different requirements remain distinguishable when linking evidence',()=>{
 const duplicate={...snapshot,program_essay_requirements:[{id:'requirement-one',program_id:'program-a',essay_type:'PS',prompt:'Motivation'},{id:'requirement-two',program_id:'program-a',essay_type:'PS',prompt:'Research experience'}],essays:[{id:'essay-one',application_id:'application-a',type:'PS',program_essay_requirement_id:'requirement-one'},{id:'essay-two',application_id:'application-a',type:'PS',program_essay_requirement_id:'requirement-two'}],essay_versions:[{id:'v-one',essay_id:'essay-one',version_number:1},{id:'v-two',essay_id:'essay-two',version_number:1}]} as unknown as Snapshot;
 const one=labelFor('essay_versions',duplicate.essay_versions![0] as unknown as Record<string,unknown>,duplicate);
 const two=labelFor('essay_versions',duplicate.essay_versions![1] as unknown as Record<string,unknown>,duplicate);
 assert.notEqual(one,two);assert.match(one,/Motivation/);assert.match(two,/Research experience/);
});
