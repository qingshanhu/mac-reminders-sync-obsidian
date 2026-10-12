const {Plugin,PluginSettingTab,Setting,Notice,Modal,MarkdownRenderChild}=require('obsidian');
const {spawn}=require('child_process');
const path=require('path');
const ROOT='工作/平时工作', DASH=ROOT+'/待办.md', DATA=ROOT+'/待办资料/待办清单.md';
const defaults={minutes:5,enabled:true,adaptive:false,defaultList:'',records:{},lists:[],lastSync:0,idleRuns:0};
class EditTask extends Modal {
 constructor(plugin,task){super(plugin.app);this.p=plugin;this.task=task;}
 onOpen(){this.titleEl.setText('编辑待办'); const t=this.task;let title=t.title,due=t.due,list=t.listId;
 new Setting(this.contentEl).setName('任务').addText(x=>x.setValue(title).onChange(v=>title=v));
 new Setting(this.contentEl).setName('截止日期').setDesc('YYYY-MM-DD，可附加 HH:mm；留空表示无日期。').addText(x=>x.setValue(due).onChange(v=>due=v));
 new Setting(this.contentEl).setName('提醒事项列表').addDropdown(x=>{for(const l of this.p.s.lists)x.addOption(l.id,l.title);x.setValue(list).onChange(v=>list=v);});
 new Setting(this.contentEl).addButton(x=>x.setButtonText('保存').setCta().onClick(async()=>{if(!title.trim())return new Notice('请输入任务名称');if(!this.p.validDate(due))return new Notice('请填写有效日期');try{await this.p.updateTask(t.key,{title:CoreOneLine(title),due,listId:list});this.close();}catch(e){new Notice(e.message);}}));
 }
 onClose(){this.contentEl.empty();}
}
const CoreOneLine=s=>s.trim().replace(/[\r\n]+/g,' ');
class Panel extends MarkdownRenderChild {
 constructor(el,plugin){super(el);this.p=plugin;this.filter='全部';}
 onload(){this.build();this.p.panels.add(this);requestAnimationFrame(()=>this.refresh());}
 onunload(){this.p.panels.delete(this);}
 build(){const p=this.p,r=this.containerEl;r.empty();r.addClass('work-reminders');
 const header=r.createDiv({cls:'wr-header'});header.createEl('span',{text:'APPLE REMINDERS',cls:'wr-eyebrow'});this.status=header.createEl('span',{cls:'wr-status',attr:{'aria-live':'polite'}});
 const add=r.createEl('form',{cls:'wr-add'});this.title=add.createEl('input',{type:'text',placeholder:'添加一项待办…',attr:{'aria-label':'任务名称'}});
 const controls=add.createDiv({cls:'wr-add-controls'});
 this.date=controls.createEl('input',{type:'date',attr:{'aria-label':'截止日期'}});
 this.list=controls.createEl('select',{attr:{'aria-label':'提醒事项列表'}});
 this.add=controls.createEl('button',{text:'添加',cls:'mod-cta',attr:{type:'submit'}});
 this.registerDomEvent(add,'submit',async(e)=>{e.preventDefault();if(!this.title.value.trim())return;this.add.disabled=true;try{await p.addTask(this.title.value,this.date.value,this.list.value);this.title.value='';this.date.value='';this.title.focus();}catch(e){new Notice(e.message);}finally{this.add.disabled=false;}});
 const toolbar=r.createDiv({cls:'wr-toolbar'});const tabs=toolbar.createDiv({cls:'wr-tabs'});this.tabs=[];
 for(const label of ['全部','今日','逾期','已完成']){const b=tabs.createEl('button',{text:label});this.tabs.push([label,b]);this.registerDomEvent(b,'click',()=>{this.filter=label;this.refresh();});}
 this.sync=toolbar.createEl('button',{text:'立即同步',cls:'wr-sync'});this.registerDomEvent(this.sync,'click',()=>p.sync(true));
 this.rows=r.createDiv({cls:'wr-rows'});
 const details=r.createEl('details',{cls:'wr-options'});details.createEl('summary',{text:'同步设置与操作'});
 const opts=details.createDiv({cls:'wr-setting-row'});const label=opts.createEl('label',{text:'每 '});this.interval=label.createEl('input',{type:'number',attr:{min:'1',max:'1440','aria-label':'同步间隔（分钟）'}});label.appendText(' 分钟同步');
 const apply=opts.createEl('button',{text:'应用'});this.registerDomEvent(apply,'click',async()=>{const n=Number(this.interval.value);if(!Number.isInteger(n)||n<1||n>1440)return new Notice('周期范围：1–1440 分钟');p.s.minutes=n;await p.saveSettings();p.schedule();p.refresh();new Notice('同步周期已更新');});
 const auto=opts.createEl('label',{cls:'wr-checkbox'});this.auto=auto.createEl('input',{type:'checkbox'});auto.appendText('自动同步');this.registerDomEvent(this.auto,'change',async()=>{p.s.enabled=this.auto.checked;await p.saveSettings();p.schedule();p.refresh();});
 const adaptive=details.createEl('label',{cls:'wr-checkbox'});this.adaptive=adaptive.createEl('input',{type:'checkbox'});adaptive.appendText('空闲时自动延长周期（最多 3 倍，发现变化后恢复）');this.registerDomEvent(this.adaptive,'change',async()=>{p.s.adaptive=this.adaptive.checked;p.s.idleRuns=0;await p.saveSettings();p.schedule();p.refresh();});
 details.createEl('p',{text:'在任意一端新增或勾选任务，下次同步会更新另一端。点击任务标题可修改名称、日期和列表。需要立即更新时点击“立即同步”。'});
 details.createEl('p',{text:'Obsidian 保持运行时自动同步。首次允许提醒事项访问。删除任务请在 Mac 操作；直接删除清单行不会删除 Mac 任务。重复规则、子任务结构、附件和标签不在此界面同步；Mac 原有信息保留。'});
 this.message=r.createDiv({cls:'wr-message',attr:{'aria-live':'polite'}});
 }
 async refresh(){const p=this.p; if(!this.containerEl.isConnected)return;const tasks=await p.readTasks();if(!this.containerEl.isConnected)return;
 const when=p.s.lastSync?new Date(p.s.lastSync).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'尚未同步';this.status.setText(p.busy?'正在同步…':`${p.s.enabled?'自动同步':'已暂停'} · ${p.effectiveMinutes()} 分钟 · ${when}`);
 this.message.setText(p.error||p.result||'');this.message.toggleClass('wr-error',!!p.error);this.sync.disabled=p.busy;
 if(document.activeElement!==this.interval)this.interval.value=String(p.s.minutes);this.auto.checked=p.s.enabled;this.adaptive.checked=p.s.adaptive;
 const previous=this.list.value;this.list.empty();for(const l of p.s.lists.filter(l=>l.writable))this.list.createEl('option',{text:l.title,attr:{value:l.id}});
 if(!p.s.lists.length)this.list.createEl('option',{text:'首次同步后选择列表',attr:{value:''}});
 this.list.value=previous||p.s.defaultList||this.list.options[0]?.value||'';
 for(const [label,b]of this.tabs){b.toggleClass('is-active',label===this.filter);b.setAttribute('aria-pressed',String(label===this.filter));}
 const now=new Date(),day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const shown=tasks.filter(t=>this.filter==='已完成'?t.done:!t.done&&(this.filter==='全部'||(this.filter==='今日'?t.due.slice(0,10)===day:!!t.due&&t.due.slice(0,10)<day)));
 shown.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title));this.rows.empty();
 if(!shown.length)this.rows.createDiv({text:p.s.lastSync?'当前没有待办':'点击“立即同步”，连接 Mac 提醒事项。',cls:'wr-empty'});
 for(const t of shown){const row=this.rows.createDiv({cls:'wr-task'});const check=row.createEl('input',{type:'checkbox',attr:{'aria-label':'完成 '+t.title}});check.checked=t.done;
 check.onchange=async()=>{check.disabled=true;try{await p.updateTask(t.key,{done:check.checked});}catch(e){check.checked=!check.checked;new Notice(e.message);}finally{check.disabled=false;}};
 const body=row.createDiv({cls:'wr-task-body'});const title=body.createEl('button',{text:t.title,cls:'wr-task-title'});title.onclick=()=>new EditTask(p,t).open();title.toggleClass('is-done',t.done);
 const list=p.s.lists.find(l=>l.id===t.listId)?.title||'待同步';body.createDiv({text:list,cls:'wr-list-name'});
 if(t.due)row.createEl('span',{text:t.due,cls:'wr-due'+(t.due.slice(0,10)<day&&!t.done?' is-overdue':'')});
 }
 }
}
class WorkReminders extends Plugin {
 async onload(){this.s=Object.assign({},defaults,await this.loadData());this.panels=new Set();this.busy=false;this.error='';this.result='';
 this.addSettingTab(new class extends PluginSettingTab {display(){this.containerEl.empty();new Setting(this.containerEl).setName('平时工作待办').setDesc('双向同步与周期设置位于待办页面。').addButton(b=>b.setButtonText('打开待办').onClick(()=>this.app.workspace.openLinkText(DASH,'',false)));}}(this.app,this));
 this.registerMarkdownCodeBlockProcessor('mac-reminders',(source,el,ctx)=>ctx.addChild(new Panel(el,this)));
 this.addCommand({id:'open',name:'打开待办',callback:()=>this.app.workspace.openLinkText(DASH,'',false)});
 this.addCommand({id:'sync',name:'立即同步 Mac 提醒事项',callback:()=>this.sync(true)});
 this.registerEvent(this.app.vault.on('modify',f=>{if(f.path===DATA)this.refresh();}));
 this.registerDomEvent(window,'focus',()=>{if(this.s.enabled&&Date.now()-this.s.lastSync>=this.effectiveMinutes()*60000)this.sync();});
 this.app.workspace.onLayoutReady(()=>{this.schedule();if(this.s.enabled)this.sync();});
 }
 onunload(){clearTimeout(this.timer);if(this.child)this.child.kill();}
 async saveSettings(){await this.saveData(this.s);}
 effectiveMinutes(){return this.s.minutes*(this.s.adaptive?Math.min(3,1+Math.floor(this.s.idleRuns/3)):1);}
 schedule(){clearTimeout(this.timer);if(this.s.enabled)this.timer=setTimeout(()=>this.sync(),this.effectiveMinutes()*60000);}
 refresh(){for(const panel of this.panels)panel.refresh().catch(e=>{this.error=e.message;});}
 validDate(s){if(!s)return true;if(!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(s))return false;const d=new Date(s.replace(' ','T')+(s.length===10?'T12:00:00':':00'));if(!Number.isFinite(d.getTime()))return false;const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`===s.slice(0,10);}
 async dataFile(){const folder=ROOT+'/待办资料';if(!this.app.vault.getAbstractFileByPath(folder))await this.app.vault.createFolder(folder);let f=this.app.vault.getAbstractFileByPath(DATA);if(!f)f=await this.app.vault.create(DATA,'# 待办清单\n');return f;}
 async readTasks(){const f=this.app.vault.getAbstractFileByPath(DATA);return f?Core.parse(await this.app.vault.read(f),this.s.lists,this.s.records):[];}
 async addTask(title,due,listId){if(!this.validDate(due))throw new Error('日期无效');title=CoreOneLine(title);if(!title)throw new Error('任务不能为空');if(/<!--|📅/.test(title))throw new Error('任务名称不能包含同步标识或日期标记');const f=await this.dataFile();const list=this.s.lists.find(l=>l.id===listId);if(!list)throw new Error('请先点击“立即同步”连接提醒事项');
 await this.app.vault.process(f,c=>{const tasks=Core.parse(c,this.s.lists,this.s.records);tasks.push({key:Core.freshKey(),title,done:false,due,listId});return Core.render(tasks,this.s.lists);});this.s.defaultList=listId;await this.saveSettings();this.refresh();new Notice('已添加，下次同步写入 Mac');}
 async updateTask(key,patch){const f=await this.dataFile();await this.app.vault.process(f,c=>{const tasks=Core.parse(c,this.s.lists,this.s.records);const t=tasks.find(t=>t.key===key);if(!t)throw new Error('任务已变更，请刷新');if(patch.title && /<!--|📅/.test(patch.title))throw new Error('任务名称不能包含同步标识或日期标记');Object.assign(t,patch);return Core.render(tasks,this.s.lists);});this.refresh();}
 bridge(request){return new Promise((resolve,reject)=>{const base=this.app.vault.adapter.getBasePath();const executable=path.join(base,this.manifest.dir,'RemindersBridge.app/Contents/MacOS/reminders-bridge');
 const child=spawn(executable,[],{stdio:['pipe','pipe','pipe']});this.child=child;let out='',err='',ended=false;
 const timer=setTimeout(()=>{child.kill();reject(new Error('连接提醒事项超时，请完成系统授权后再次同步。'));},100000);
 child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
 child.on('error',e=>{clearTimeout(timer);ended=true;reject(e);});child.on('close',code=>{clearTimeout(timer);this.child=null;if(ended)return;if(code!==0)return reject(new Error(err.trim()||'本地提醒事项连接失败'));try{resolve(JSON.parse(out));}catch(e){reject(new Error('提醒事项响应无效'));}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(request));});}
 async sync(manual=false){if(this.busy)return;this.busy=true;this.error='';this.refresh();let changed=false;
 try{const snapshot=await this.bridge({operation:'snapshot'});const f=await this.dataFile();const original=await this.app.vault.read(f);let initial=Core.parse(original,snapshot.lists,this.s.records);
 const tagged=Core.tagContent(original,initial);if(tagged!==original){await this.app.vault.process(f,c=>{if(c!==original)throw new Error('清单正在编辑，请再次同步');return tagged;});}
 const plan=Core.plan(initial,snapshot,this.s.records,this.s.defaultList);
 const before=JSON.stringify(Object.values(this.s.records).map(r=>r.base));const final=plan.updates.length?await this.bridge({operation:'apply',updates:plan.updates}):snapshot;
 const {records,tasks}=Core.materialize(final,this.s.records,{...plan.links,...final.applied});
 const newContent=Core.render(tasks,final.lists);
 // Keep a local recovery copy before rewriting. On-disk Markdown edits during an API call survive.
 const backupPath=path.join(this.app.vault.adapter.getBasePath(),this.manifest.dir,'last-backup.md');
 require('fs').writeFileSync(backupPath,await this.app.vault.read(f),'utf8');
 await this.app.vault.process(f,c=>{if(c===tagged)return newContent;return Core.mergeDuringWrite(c,initial,tasks,final.lists);});
 changed=plan.updates.length>0||before!==JSON.stringify(Object.values(records).map(r=>r.base));
 this.s.records=records;this.s.lists=final.lists;this.s.lastSync=Date.now();this.s.idleRuns=changed?0:this.s.idleRuns+1;if(!this.s.defaultList||!final.lists.some(l=>l.id===this.s.defaultList&&l.writable))this.s.defaultList=final.lists.find(l=>l.writable)?.id||'';
 if(plan.conflicts.length){const logPath=path.join(this.app.vault.adapter.getBasePath(),this.manifest.dir,'conflicts.jsonl');require('fs').appendFileSync(logPath,JSON.stringify({time:new Date().toISOString(),conflicts:plan.conflicts})+'\n');this.result=`已同步 ${tasks.length} 项；${plan.conflicts.length} 处同时修改采用 Mac 版本，旧值保存在插件 conflicts.jsonl。`;}else this.result=`已同步 ${tasks.filter(t=>!t.done).length} 项待办 · ${tasks.filter(t=>t.done).length} 项已完成`;
 await this.saveSettings();if(manual)new Notice(this.result);
 }catch(e){this.error=e.message;if(manual)new Notice('同步失败：'+e.message,10000);}
 finally{this.busy=false;this.schedule();this.refresh();}
 }
}
module.exports=WorkReminders;
