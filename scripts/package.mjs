import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const plugin=path.join(root,'dist/work-reminders-sync');const allowed=['main.js','manifest.json','styles.css','RemindersBridge.app'];
for(const name of allowed)if(!fs.existsSync(path.join(plugin,name)))throw new Error('Build first: npm run build:universal');
const stage=path.join(root,'build/package');fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
const wrapper=path.join(stage,'mac-reminders-sync-obsidian');fs.mkdirSync(path.join(wrapper,'plugin/work-reminders-sync'),{recursive:true});
for(const name of allowed)fs.cpSync(path.join(plugin,name),path.join(wrapper,'plugin/work-reminders-sync',name),{recursive:true});
for(const name of ['scripts/install.mjs','templates/待办.md','templates/待办资料/待办清单.md','README.md','LICENSE','docs/使用说明.md','docs/故障排查.md']){fs.mkdirSync(path.dirname(path.join(wrapper,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(wrapper,name));}
const archives=[['mac-reminders-sync-obsidian-v'+manifest.version+'-universal.zip',stage,'mac-reminders-sync-obsidian'],['work-reminders-sync-v'+manifest.version+'-plugin.zip',path.join(root,'dist'),'work-reminders-sync']];
for(const [name,cwd,item]of archives){const archive=path.join(root,'dist',name);fs.rmSync(archive,{force:true});execFileSync('python3',['-c',`import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file(): z.write(p, p.relative_to(root.parent).as_posix())
`,path.join(cwd,item),archive]);console.log(archive);}
