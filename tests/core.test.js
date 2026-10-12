const assert=require('node:assert/strict');const C=require('../src/core');
const lists=[{id:'list-a',title:'工作',writable:true},{id:'list-b',title:'工作',writable:true}];
const remote={id:'r1',externalId:'ext1',title:'巡检',done:false,due:'2026-10-12',listId:'list-a',modified:1};
const records={k1:{remoteId:'r1',externalId:'ext1',base:C.project(remote)}};
const row={key:'k1',...C.project(remote)};
function snap(items=[remote]){return {items,lists,applied:{}};}
let p=C.plan([{...row,title:'巡检两台'}],snap(),records,'list-a');assert.equal(p.updates[0].title,'巡检两台');assert.equal(p.updates[0].due,undefined);
p=C.plan([row],snap([{...remote,done:true}]),records,'list-a');assert.equal(p.updates.length,0);
p=C.plan([{...row,title:'本地标题'}],snap([{...remote,done:true}]),records,'list-a');assert.equal(p.updates[0].title,'本地标题');assert.equal(p.updates[0].done,undefined);
p=C.plan([{...row,title:'本地标题'}],snap([{...remote,title:'Mac标题'}]),records,'list-a');assert.equal(p.conflicts.length,1);assert.equal(p.updates.length,0);
p=C.plan([{...row,due:''}],snap(),records,'list-a');assert.equal(p.updates[0].clearDue,true);
p=C.plan([{...row,key:'k2',title:'新增',listId:'list-b'}],snap(),records,'list-a');assert.equal(p.updates[0].listId,'list-b');assert.equal(p.updates[0].key,'k2');
p=C.plan([row],snap([]),records,'list-a');assert.equal(p.updates.length,0);
p=C.plan([row],snap([{...remote,id:'new-cloud-id'}]),records,'list-a');assert.equal(p.links.k1,'new-cloud-id');
const recovered={...remote,key:'new-key'};p=C.plan([{...row,key:'new-key'}],snap([recovered]),{},'list-a');assert.equal(p.updates.length,0);assert.equal(p.links['new-key'],'r1');
const ts=[row,{...row,key:'k2',title:'第二个同名列表',listId:'list-b',due:'2026-10-13 09:30'}];const doc=C.render(ts,lists);const parsed=C.parse(doc,lists,records);assert.equal(parsed[1].listId,'list-b');assert.equal(parsed[1].due,'2026-10-13 09:30');
assert.throws(()=>C.parse(doc+'\n- [ ] 重复 <!-- mr:k1 -->',lists),/重复任务/);
const imported=C.materialize(snap([{...remote,done:true}]),records);assert.equal(imported.tasks[0].key,'k1');assert.equal(imported.tasks[0].done,true);
const initial=C.parse(C.render([row],lists),lists,records);const during=C.render([{...row,title:'同步时继续编辑'},{...row,key:'k2',title:'同步时添加'}],lists);
const merged=C.parse(C.mergeDuringWrite(during,initial,[{...row,done:true}],lists),lists);assert.equal(merged.find(t=>t.key==='k1').title,'同步时继续编辑');assert.equal(merged.find(t=>t.key==='k1').done,true);assert.equal(merged.find(t=>t.key==='k2').title,'同步时添加');
const untagged='## 工作\n- [ ] 新任务 📅 2026-10-14\n';const raw=C.parse(untagged,lists);const tagged=C.tagContent(untagged,raw);assert.equal(C.parse(tagged,lists)[0].key,raw[0].key);
console.log('通过：双向新增、完成状态、逐字段合并、冲突、清除日期、云端 ID 恢复、同名列表、并发编辑、重复标识检测。');

for(const title of ['标题 📅 2026-10-12','多行\n标题','<!-- mr:reserved -->','']){const doc=C.render([{...row,title}],lists);assert.equal(C.parse(doc,lists,records)[0].title,title);}
assert.throws(()=>C.parse('## 工作\n- [ ] 无效日期 📅 2026-02-30',lists),/日期无效/);
console.log('通过：特殊标题、空标题与原始换行无损回读，无效截止日期拒绝同步。');
