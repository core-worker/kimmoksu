const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, runTransaction } = require('firebase/firestore');
const fs = require('node:fs');
(async () => {
  const env = await initializeTestEnvironment({projectId:'demo-kimmoksu-meetings',firestore:{host:'127.0.0.1',port:8087,rules:fs.readFileSync('firestore/firestore.rules','utf8')}});
  try {
    await env.clearFirestore();
    const team={owner:'owner@test.com',members:['owner@test.com','admin@test.com','writer@test.com','reader@test.com'],admins:['admin@test.com'],meetingAdmins:['writer@test.com'],inviteCode:'ABC123'};
    await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'teams/t1'),team);});
    const clients=Object.fromEntries(['owner','admin','writer','reader','outsider'].map(u=>[u,env.authenticatedContext(u,{email:u+'@test.com'}).firestore()]));
    const path='teams/t1/meetings/m1', draft='teams/t1/meetingDrafts/writer/items/m1';
    const record=()=>({title:'회의록',body:'자재 관련 내용',date:'2026-09-15',authorUid:'writer',authorName:'담당자',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedByUid:'writer',updatedByName:'담당자',revision:1,pinned:false});
    await assertFails(setDoc(doc(clients.reader,path),record()));
    await assertSucceeds(setDoc(doc(clients.writer,path),record()));
    await assertSucceeds(getDoc(doc(clients.reader,path)));
    await assertSucceeds(getDocs(collection(clients.reader,'teams/t1/meetings')));
    await assertFails(getDoc(doc(clients.outsider,path)));
    await assertFails(getDocs(collection(clients.outsider,'teams/t1/meetings')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
    await assertFails(updateDoc(doc(clients.reader,path),{pinned:true}));
    await assertSucceeds(updateDoc(doc(clients.admin,path),{pinned:true}));
    const draftData={title:'초안',body:'개인 내용',date:'2026-09-15',authorUid:'writer',authorName:'담당자',baseRevision:1,updatedAt:serverTimestamp()};
    await assertSucceeds(setDoc(doc(clients.writer,draft),draftData));
    await assertSucceeds(getDocs(collection(clients.writer,'teams/t1/meetingDrafts/writer/items')));
    await assertFails(getDoc(doc(clients.admin,draft)));
    await assertFails(getDoc(doc(clients.reader,draft)));
    await assertFails(setDoc(doc(clients.writer,'teams/t1/meetingDrafts/reader/items/x'),draftData));
    await assertFails(updateDoc(doc(clients.writer,path),{revision:9,updatedAt:serverTimestamp()}));
    await assertFails(updateDoc(doc(clients.writer,path),{authorUid:'owner',revision:2,updatedAt:serverTimestamp()}));
    await assertSucceeds(runTransaction(clients.writer,async tx=>{const r=doc(clients.writer,path);await tx.get(r);tx.update(r,{body:'게시된 수정',revision:2,updatedAt:serverTimestamp()});tx.delete(doc(clients.writer,draft));}));
    await assertFails(updateDoc(doc(clients.reader,'teams/t1'),{meetingAdmins:['reader@test.com']}));
    await assertFails(updateDoc(doc(clients.reader,'teams/t1'),{admins:['reader@test.com']}));
    await assertFails(updateDoc(doc(clients.outsider,'teams/t1'),{members:[...team.members,'outsider@test.com']}));
    await assertFails(deleteDoc(doc(clients.reader,'teams/t1')));
    await assertSucceeds(updateDoc(doc(clients.admin,'teams/t1'),{meetingAdmins:['writer@test.com','reader@test.com']}));
    await assertSucceeds(updateDoc(doc(clients.reader,'teams/t1'),{membersInfo:{note:'legacy field'}}));
    await assertSucceeds(setDoc(doc(clients.outsider,'teams/t1/joinRequests/outsider'),{email:'outsider@test.com',nickname:'신규',createdAt:serverTimestamp()}));
    await assertFails(getDocs(collection(clients.reader,'teams/t1/joinRequests')));
    await assertSucceeds(getDocs(collection(clients.admin,'teams/t1/joinRequests')));
    await assertSucceeds(runTransaction(clients.admin,async tx=>{const t=doc(clients.admin,'teams/t1'),r=doc(clients.admin,'teams/t1/joinRequests/outsider');const td=await tx.get(t);const rd=await tx.get(r);tx.update(t,{members:[...td.data().members,rd.data().email]});tx.delete(r);}));
    await assertSucceeds(getDoc(doc(clients.outsider,path)));
    await assertFails(setDoc(doc(clients.outsider,'teams/t2'),{...team,owner:'outsider@test.com',members:['outsider@test.com'],admins:['outsider@test.com']}));
    await assertSucceeds(setDoc(doc(clients.outsider,'teams/t2'),{owner:'outsider@test.com',members:['outsider@test.com'],admins:[],meetingAdmins:[],inviteCode:'XYZ123'}));
    await assertSucceeds(setDoc(doc(clients.reader,'worklogs/compatibility'),{test:true}));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'worklogs/compatibility')));
    const specialEmail='idong2300@naver.com';
    const special=env.authenticatedContext('special',{email:specialEmail}).firestore();
    const legacyTeams={
      missingAdmins:{owner:specialEmail,members:[specialEmail,'reader@test.com']},
      missingOwner:{members:[specialEmail,'reader@test.com'],admins:[]},
      departedOwner:{owner:'departed@test.com',members:[specialEmail,'admin@test.com','reader@test.com'],admins:['admin@test.com']},
      departedAdmin:{owner:specialEmail,members:[specialEmail,'reader@test.com'],admins:['departed@test.com']}
    };
    await env.withSecurityRulesDisabled(async c=>{
      for(const [id,data] of Object.entries(legacyTeams)) await setDoc(doc(c.firestore(),'teams/'+id),data);
    });
    for(const id of Object.keys(legacyTeams)) {
      const ref=doc(special,'teams/'+id);
      await assertSucceeds(runTransaction(special,async tx=>{await tx.get(ref);tx.update(ref,{meetingAdmins:['reader@test.com']});}));
      await assertSucceeds(updateDoc(ref,{meetingAdmins:[]}));
      await assertFails(updateDoc(doc(clients.reader,'teams/'+id),{meetingAdmins:['reader@test.com']}));
      await assertFails(updateDoc(ref,{meetingAdmins:['outsider@test.com']}));
      await assertFails(updateDoc(ref,{meetingAdmins:'reader@test.com'}));
      await assertFails(updateDoc(doc(clients.reader,'teams/'+id),{meetingAdmins:['reader@test.com'],admins:['reader@test.com']}));
      await assertFails(updateDoc(ref,{meetingAdmins:[],owner:'reader@test.com'}));
    }
    await assertSucceeds(updateDoc(doc(clients.admin,'teams/departedOwner'),{meetingAdmins:['reader@test.com']}));
    await assertFails(updateDoc(doc(clients.outsider,'teams/missingAdmins'),{meetingAdmins:[]}));
    for (const [id, data] of Object.entries(legacyTeams)) {
      const requestPath='teams/'+id+'/joinRequests/outsider';
      await assertSucceeds(setDoc(doc(clients.outsider,requestPath),{email:'outsider@test.com',nickname:'new member',createdAt:serverTimestamp()}));
      const approve = client => runTransaction(client,async tx=>{
        const t=doc(client,'teams/'+id), r=doc(client,requestPath);
        const td=await tx.get(t), rd=await tx.get(r);
        tx.update(t,{members:Array.from(new Set([...td.data().members,rd.data().email]))});
        tx.delete(r);
      });
      await assertFails(approve(clients.reader));
      await assertFails(updateDoc(doc(clients.outsider,'teams/'+id),{members:[...data.members,'outsider@test.com']}));
      await assertFails(updateDoc(doc(special,'teams/'+id),{members:[...data.members,'outsider@test.com'],owner:'outsider@test.com'}));
      const manager=id==='departedOwner'?clients.admin:special;
      await assertSucceeds(approve(manager));
      const saved=(await getDoc(doc(manager,'teams/'+id))).data();
      if (!saved.members.includes('outsider@test.com') || (await getDoc(doc(manager,requestPath))).exists()) throw Error('Approval must add member and remove request atomically');
      for (const key of ['owner','admins']) if(JSON.stringify(saved[key])!==JSON.stringify(data[key])) throw Error('Approval changed legacy roles');
      await assertFails(updateDoc(doc(manager,'teams/'+id),{members:'invalid'}));
    }
    console.log('PASS: emulator checks for meeting access, private drafts, role escalation, join approval, transaction publish, and legacy permission saves.');
  } finally { await env.cleanup(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
