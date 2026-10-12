import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);const get=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(key+' requires a value');return args[i+1];};
if(args.includes('--help')){console.log('node scripts/install.mjs --vault /absolute/vault [--folder 工作/平时工作] [--no-enable]');process.exit(0);}
const vaultArg=get('--vault','');if(!vaultArg||!path.isAbsolute(vaultArg))throw new Error('--vault must be an absolute path to an existing vault.');
const vault=fs.realpathSync(vaultArg);const folder=get('--folder','工作/平时工作').replace(/\\/g,'/');
if(!folder||folder.startsWith('/')||folder.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))throw new Error('--folder must be a relative non-hidden folder inside the vault.');
const config=path.join(vault,'.obsidian');if(!fs.existsSync(config))throw new Error('Vault .obsidian folder not found. Open this vault once in Obsidian first.');
const source=fs.existsSync(path.join(root,'dist/work-reminders-sync'))?path.join(root,'dist/work-reminders-sync'):path.join(root,'plugin/work-reminders-sync');
const allowed=['main.js','manifest.json','styles.css','RemindersBridge.app'];for(const name of allowed)if(!fs.existsSync(path.join(source,name)))throw new Error('Plugin files missing. Run npm run build:universal or use the release installer ZIP.');
const target=path.join(config,'plugins/work-reminders-sync'),noteDir=path.resolve(vault,folder);
function inside(p){const rel=path.relative(vault,fs.realpathSync(p));if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Symlink resolves outside the selected vault: '+p);}
inside(config);if(fs.existsSync(path.join(config,'plugins')))inside(path.join(config,'plugins'));if(fs.existsSync(target))inside(target);
for(let p=noteDir;p!==vault;p=path.dirname(p))if(fs.existsSync(p))inside(p);
const community=path.join(config,'community-plugins.json');if(fs.existsSync(community))inside(community);
let enabled=fs.existsSync(community)?JSON.parse(fs.readFileSync(community,'utf8')):[];if(!Array.isArray(enabled))throw new Error('community-plugins.json must contain an array.');
// Back up software only; do not copy user task state into release artifacts.
if(fs.existsSync(target)){const backup=path.join(config,'plugins-backup','work-reminders-sync-'+Date.now());fs.mkdirSync(backup,{recursive:true});for(const name of allowed)if(fs.existsSync(path.join(target,name)))fs.cpSync(path.join(target,name),path.join(backup,name),{recursive:true});console.log('Software backup: '+backup);}
fs.mkdirSync(target,{recursive:true});for(const name of allowed){const dest=path.join(target,name);if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw new Error('Refusing to overwrite symlink: '+dest);if(name==='RemindersBridge.app')fs.rmSync(dest,{recursive:true,force:true});fs.cpSync(path.join(source,name),dest,{recursive:true});}
const main=path.join(target,'main.js');let code=fs.readFileSync(main,'utf8');if(!code.includes("const ROOT='工作/平时工作'"))throw new Error('Unexpected plugin template.');code=code.replace("const ROOT='工作/平时工作'",'const ROOT='+JSON.stringify(folder));fs.writeFileSync(main,code);
const binary=path.join(target,'RemindersBridge.app/Contents/MacOS/reminders-bridge');fs.chmodSync(binary,0o755);
fs.mkdirSync(path.join(noteDir,'待办资料'),{recursive:true});inside(path.join(noteDir,'待办资料'));
const dashboard=path.join(noteDir,'待办.md'),data=path.join(noteDir,'待办资料/待办清单.md');
const dashboardText='```mac-reminders\n```\n\n[['+folder+'/待办资料/待办清单|打开 Markdown 清单]]\n';
if(!fs.existsSync(dashboard))fs.writeFileSync(dashboard,dashboardText);else console.log('Preserved existing note: '+dashboard);
if(!fs.existsSync(data))fs.writeFileSync(data,fs.readFileSync(path.join(root,'templates/待办资料/待办清单.md'),'utf8'));
if(!args.includes('--no-enable')&&!enabled.includes('work-reminders-sync')){enabled.push('work-reminders-sync');fs.writeFileSync(community,JSON.stringify(enabled,null,2)+'\n');}
console.log('Installed. Reopen Obsidian, enable community plugins, then open '+folder+'/待办.md. Allow Reminders access when prompted.');
