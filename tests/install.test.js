const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const repo=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'reminders-install-'));
try{
 const fake=path.join(tmp,'project');fs.mkdirSync(path.join(fake,'scripts'),{recursive:true});fs.copyFileSync(path.join(repo,'scripts/install.mjs'),path.join(fake,'scripts/install.mjs'));fs.cpSync(path.join(repo,'templates'),path.join(fake,'templates'),{recursive:true});
 const plugin=path.join(fake,'plugin/work-reminders-sync');fs.mkdirSync(path.join(plugin,'RemindersBridge.app/Contents/MacOS'),{recursive:true});fs.writeFileSync(path.join(plugin,'main.js'),"const ROOT='工作/平时工作';");fs.writeFileSync(path.join(plugin,'manifest.json'),'{}');fs.writeFileSync(path.join(plugin,'styles.css'),'');fs.writeFileSync(path.join(plugin,'RemindersBridge.app/Contents/MacOS/reminders-bridge'),'fixture');
 const vault=path.join(tmp,'vault');fs.mkdirSync(path.join(vault,'.obsidian'),{recursive:true});fs.writeFileSync(path.join(vault,'.obsidian/community-plugins.json'),'["existing-plugin"]');
 const run=(args=[])=>cp.spawnSync(process.execPath,[path.join(fake,'scripts/install.mjs'),'--vault',vault,...args],{encoding:'utf8'});
 assert.equal(run().status,0);const installed=path.join(vault,'.obsidian/plugins/work-reminders-sync');assert.ok(fs.existsSync(path.join(vault,'工作/平时工作/待办.md')));assert.ok(fs.existsSync(path.join(vault,'工作/平时工作/待办资料/待办清单.md')));
 fs.writeFileSync(path.join(installed,'data.json'),'private state');fs.writeFileSync(path.join(vault,'工作/平时工作/待办资料/待办清单.md'),'unsynced edits');
 assert.equal(run().status,0);assert.equal(fs.readFileSync(path.join(installed,'data.json'),'utf8'),'private state');assert.equal(fs.readFileSync(path.join(vault,'工作/平时工作/待办资料/待办清单.md'),'utf8'),'unsynced edits');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(vault,'.obsidian/community-plugins.json'),'utf8')),['existing-plugin','work-reminders-sync']);
 assert.notEqual(run(['--folder','../escape']).status,0);assert.notEqual(run(['--folder','/escape']).status,0);assert.equal(run(['--folder','个人/任务']).status,0);assert.ok(fs.readFileSync(path.join(installed,'main.js'),'utf8').includes('个人/任务'));
 const outside=path.join(tmp,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(vault,'外部'));assert.notEqual(run(['--folder','外部/任务']).status,0);
 console.log('通过：安装、升级保留运行数据与清单、启用列表去重、自定义目录、路径穿越和符号链接边界。');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
