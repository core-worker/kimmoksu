const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const nodes = {};
function el(id) { return { id, textContent: '', style: {}, children: [], disabled: false, append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; } }; }
for (const id of ['btnSavePerms','permSaveStatus','permModalTitle','permMemberList']) nodes[id] = el(id);
const checks = () => nodes.permMemberList.children.map(label => label.children[0]);
let team = {owner:'owner@test.com',members:['owner@test.com','writer@test.com'],admins:[],meetingAdmins:['writer@test.com']}, rejected = false, writes = [], reloads = 0, resolveWrite;
const ref = { async get() {return {exists:true,data:()=>team};} };
const ctx = vm.createContext({console, window:{},document:{getElementById:id=>nodes[id],createElement:()=>el(''),querySelectorAll:selector=>selector.endsWith(':checked')?checks().filter(c=>c.checked):checks()},auth:{currentUser:{uid:'owner',email:'owner@test.com'}},myTeamId:'t1',myRole:'member',currentPermType:'',globalEmailToNick:{},permModalInst:{show(){}},alert(){},location:{reload(){reloads++;}},setTimeout(){return 1;},clearTimeout(){},db:{collection:()=>({doc:()=>ref}),async runTransaction(fn){let updates;await fn({get:()=>ref.get(),update:(_ref,data)=>{updates=data;}});if(rejected)throw {code:'permission-denied'};if(resolveWrite!==undefined)await new Promise(r=>{resolveWrite=r;});writes.push(updates);Object.assign(team,updates);}}});
vm.runInContext(fs.readFileSync('js/team.js','utf8'),ctx);
(async()=>{
 await ctx.openPermModal('meetings'); assert.equal(checks()[1].checked,true); // uses server state even when old global role is stale
 checks()[0].checked=true; await ctx.savePerms();assert.equal(writes.length,1);assert.deepEqual([...writes[0].meetingAdmins],['owner@test.com','writer@test.com']);assert.equal(reloads,1);
 rejected=true;await ctx.openPermModal('meetings');await ctx.savePerms();assert(nodes.permSaveStatus.textContent.includes('permission-denied'));assert.equal(nodes.btnSavePerms.disabled,false);assert.equal(checks()[1].checked,true);assert.equal(reloads,1);
 rejected=false;await ctx.openPermModal('meetings');team.owner='other@test.com';await ctx.savePerms();assert(nodes.permSaveStatus.textContent.includes('관리자 권한'));assert.equal(writes.length,1);
 team.owner='owner@test.com';await ctx.openPermModal('meetings');team.members=['owner@test.com'];await ctx.savePerms();assert(nodes.permSaveStatus.textContent.includes('팀원 목록'));assert.equal(writes.length,1);
 await ctx.openPermModal('invalid');await ctx.savePerms();assert.equal(writes.length,1);
 team.members.push('writer@test.com');await ctx.openPermModal('meetings');resolveWrite=null;const first=ctx.savePerms();await Promise.resolve();await Promise.resolve();await ctx.savePerms();assert(nodes.btnSavePerms.disabled);while(typeof resolveWrite!=='function')await Promise.resolve();resolveWrite();await first;assert.equal(writes.length,2);
 console.log('PASS: fresh server permissions, meeting field selection, permission-denied feedback/retry, revoked authority, stale members, invalid mode, duplicate submit protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
