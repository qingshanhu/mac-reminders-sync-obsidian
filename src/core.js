const crypto = require('crypto');
const fields = ['title', 'done', 'due', 'listId'];
const freshKey = () => crypto.randomUUID();
const same = (a,b) => a === b;
const project = t => Object.fromEntries(fields.map(f=>[f,t[f] ?? (f==='done'?false:'')]));
function parse(content, lists=[], records={}) {
  let listId=''; const rows=[]; const seen=new Set();
  const names = new Map(lists.map(l=>[l.title,l.id]));
  content.split('\n').forEach((line,index)=>{
    const h=line.match(/^## (.*)$/); if(h) { const marker=h[1].match(/<!-- list:([A-Za-z0-9_-]+) -->/); listId=marker?Buffer.from(marker[1],'base64url').toString('utf8'):names.get(h[1])||''; }
    const m=line.match(/^\s*- \[([ xX])\] (.*)$/); if(!m)return;
    const id=m[2].match(/<!-- mr:([a-zA-Z0-9-]+) -->/);
    const key=id?.[1]||freshKey(); if(seen.has(key))throw new Error('清单中存在重复任务标识，请删除重复行后同步。');seen.add(key);
    const date=m[2].match(/📅 (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/);
    const meta=m[2].match(/<!-- mt:([A-Za-z0-9_-]*) -->/);
    let title=m[2].replace(/<!-- mr:[a-zA-Z0-9-]+ -->/,'').replace(/<!-- mt:[A-Za-z0-9_-]* -->/,'').replace(/📅 \d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?/,'').trim();
    if(meta){const original=Buffer.from(meta[1],'base64url').toString('utf8');if(title===displayTitle(original))title=original;}
    if(date && !validDue(date[1]))throw new Error('截止日期无效：'+date[1]);
    if(!title&&!meta)throw new Error('任务标题不能为空。');
    rows.push({key,title,done:m[1]!==' ',due:date?.[1]||'',listId:listId||records[key]?.base?.listId||'',index,tagged:!!id});
  }); return rows;
}
function tagContent(content,rows) {
  const lines=content.split('\n'); for(const t of rows)if(!t.tagged)lines[t.index]+=' <!-- mr:'+t.key+' -->'; return lines.join('\n');
}
function plan(rows,snapshot,records,defaultList) {
  const updates=[], conflicts=[], links={}; const remoteById=new Map(snapshot.items.map(t=>[t.id,t]));
  for(const local of rows) {
    const rec=records[local.key];
    let remote=remoteById.get(rec?.remoteId)||snapshot.items.find(t=>t.key===local.key);
    if(!remote&&rec?.externalId) { const matches=snapshot.items.filter(t=>t.externalId===rec.externalId);if(matches.length===1)remote=matches[0]; }
    if(!remote&&rec)continue; // Remote deletion is authoritative; never recreate it.
    if(!remote) { const listId=local.listId||defaultList||snapshot.lists.find(l=>l.writable)?.id; if(!listId)throw new Error('Mac 没有可写的提醒事项列表。'); updates.push({key:local.key,title:local.title,done:local.done,due:local.due||undefined,clearDue:!local.due,listId});continue; }
    links[local.key]=remote.id;
    if(!rec)continue; // Recover a create committed before the local state was saved.
    const patch={key:local.key,id:remote.id};
    for(const f of fields) {
      const base=rec.base[f], lv=local[f], rv=remote[f];
      if(same(lv,base)||same(lv,rv))continue;
      if(!same(rv,base)) { conflicts.push({key:local.key,field:f,local:lv,remote:rv});continue; }
      if(f==='due') { patch.clearDue=!lv; if(lv)patch.due=lv; } else patch[f]=lv;
    }
    if(Object.keys(patch).length>2) {
      if(!snapshot.lists.find(l=>l.id===remote.listId)?.writable) { conflicts.push({key:local.key,field:'只读列表',local:local.title,remote:remote.title});continue; }
      updates.push(patch);
    }
  }
  return {updates,conflicts,links};
}
function materialize(snapshot,records,links={}) {
  const newRecords={}, tasks=[], used=new Set();
  for(const remote of snapshot.items) {
    let key=Object.keys(links).find(k=>links[k]===remote.id)||Object.keys(records).find(k=>records[k].remoteId===remote.id);
    if(!key&&remote.externalId) { const m=Object.keys(records).filter(k=>records[k].externalId===remote.externalId);if(m.length===1)key=m[0]; }
    key=key||remote.key||freshKey(); if(used.has(key))key=freshKey();used.add(key);
    newRecords[key]={remoteId:remote.id,externalId:remote.externalId,base:project(remote)};
    tasks.push({...project(remote),key});
  }
  return {records:newRecords,tasks};
}
function oneLine(s){return String(s).replace(/[\r\n]+/g,' ').replace(/<!-- mr:/g,'〈mr:').trim();}
function displayTitle(s){return oneLine(s).replace(/📅/g,'📆')||'未命名待办';}
function validDue(s){const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);if(!m)return false;const [y,mo,d,h,mi]=m.slice(1).map(Number);const date=new Date(Date.UTC(y,mo-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d&&(!m[4]||(h<=23&&mi<=59));}
function render(tasks,lists) {
  const lines=['# 待办清单','','此文件由待办页面维护。可直接新增或勾选任务；保留行尾任务标识。',''];
  for(const l of lists) { const group=tasks.filter(t=>t.listId===l.id);if(!group.length)continue;
    lines.push('## '+oneLine(l.title)+' <!-- list:'+Buffer.from(l.id).toString('base64url')+' -->','');
    group.sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title));
    for(const t of group)lines.push(`- [${t.done?'x':' '}] ${displayTitle(t.title)}${t.due?' 📅 '+t.due:''}${displayTitle(t.title)!==t.title?' <!-- mt:'+Buffer.from(t.title).toString('base64url')+' -->':''} <!-- mr:${t.key} -->`);
    lines.push('');
  }
  const orphan=tasks.filter(t=>!lists.some(l=>l.id===t.listId));if(orphan.length)throw new Error('无法识别提醒事项列表，本次未重写清单。');
  return lines.join('\n');
}
function mergeDuringWrite(current,initial,finalTasks,lists) {
  const before=new Map(initial.map(t=>[t.key,t])); const after=new Map(parse(current,lists).map(t=>[t.key,t]));
  const merged=finalTasks.map(t=>{const a=before.get(t.key),b=after.get(t.key);if(!a||!b)return t; const copy={...t};for(const f of fields)if(a[f]!==b[f])copy[f]=b[f];return copy;});
  for(const [key,t]of after)if(!before.has(key)&&!merged.some(x=>x.key===key))merged.push(t);
  return render(merged,lists);
}
module.exports={parse,tagContent,plan,materialize,render,mergeDuringWrite,freshKey,project};
