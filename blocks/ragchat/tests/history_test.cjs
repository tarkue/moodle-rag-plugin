const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
let History;
vm.runInNewContext(fs.readFileSync(__dirname+'/../amd/src/history.js','utf8'),{define:(_dependencies,factory)=>{History=factory();},URL});
const now=Date.now(),scope={origin:'https://moodle.test',userid:7,courseid:3};
const source={doc_id:'doc-1',contenthash:'a'.repeat(40),page:2,fragment:'Validated excerpt',url:'https://secret.invalid/?token=private'};
const turn=(i=0)=>({question:'Question '+i,answer:'Answer [S1] '+i,at:new Date(now+i).toISOString(),sources:[source]});
const storage=()=>{const entries=new Map();return{getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key),entries};};
test('namespace separates origin, Moodle user, course and schema',()=>{
 const key=History.key(scope);assert.ok(key.includes('v1'));
 for(const changed of [{userid:8},{courseid:4},{origin:'https://another.test'},{sitepath:'/other-moodle/'}])assert.notEqual(History.key({...scope,...changed}),key);
 assert.equal(History.key({...scope,userid:0}),null);assert.equal(History.key({...scope,courseid:'__proto__'}),null);
});
test('only validated bounded records persist, never source URLs or credentials',()=>{
 const store=storage();History.save(store,scope,[{...turn(),sesskey:'secret-session'}],now);
 const raw=store.getItem(History.key(scope));assert.ok(raw);assert.ok(!raw.includes('secret'));assert.ok(!raw.includes('token'));assert.ok(!raw.includes('url'));
 const records=History.load(store,scope,now);assert.equal(records.length,1);assert.equal(records[0].sources[0].page,2);
});
test('rejects malformed, foreign scoped, oversized and prototype payloads',()=>{
 const store=storage(),key=History.key(scope);
 for(const raw of ['{', 'null','[]','x'.repeat(300000),JSON.stringify({v:1,userid:8,courseid:3,origin:scope.origin,turns:[turn()]}),'{"__proto__":{"polluted":true}}']){store.setItem(key,raw);assert.equal(History.load(store,scope,now).length,0);}
 assert.equal({}.polluted,undefined);
});
test('rejects invalid source hash and expires records after seven days',()=>{
 const store=storage();History.save(store,scope,[turn(),{...turn(),sources:[{...source,contenthash:'invalid'}]}],now);
 assert.equal(History.load(store,scope,now).length,1);assert.equal(History.load(store,scope,now+8*86400000).length,0);assert.equal(store.getItem(History.key(scope)),null);
});
test('bounds turn count and serialized size, retaining newest valid turns',()=>{
 const store=storage();History.save(store,scope,Array.from({length:50},(_,i)=>({...turn(i),answer:'я'.repeat(30000)})),now+100);
 const raw=store.getItem(History.key(scope));assert.ok(raw.length*3<=200000);const loaded=History.load(store,scope,now+100);assert.ok(loaded.length<=20);assert.equal(loaded.at(-1).question,'Question 49');
});
test('unavailable storage and quota failures cannot break chat',()=>{
 const denied={getItem(){throw Error('disabled');},setItem(){throw Error('quota');},removeItem(){throw Error('disabled');}};
 assert.equal(History.load(denied,scope,now).length,0);assert.doesNotThrow(()=>History.save(denied,scope,[turn()],now));assert.doesNotThrow(()=>History.clear(denied,scope));
});
test('rehydrates sources in original citation order only after every hash matches',()=>{
 const record={...turn(),sources:[source,{...source,doc_id:'doc-2',contenthash:'b'.repeat(40)}]};
 const allowed=[{doc_id:'doc-2',contenthash:'b'.repeat(40),doc:'Second',url:'/pluginfile.php/2'},{doc_id:'doc-1',contenthash:'a'.repeat(40),doc:'First',url:'/pluginfile.php/1'}];
 const restored=History.rehydrate(record,allowed,scope.origin);assert.equal(restored.sources[0].doc,'First');assert.equal(restored.sources[1].doc,'Second');assert.equal(restored.sources[0].fragment,'Validated excerpt');
 assert.equal(History.rehydrate(record,allowed.slice(1),scope.origin),null);
 assert.equal(History.rehydrate(record,[{...allowed[0],contenthash:'c'.repeat(40)},allowed[1]],scope.origin),null);
 assert.equal(History.rehydrate(record,[{...allowed[0],url:'https://foreign.test/doc'},allowed[1]],scope.origin),null);
});
test('source-free assistant text can persist without a source validation request',()=>{const store=storage();History.save(store,scope,[{...turn(),sources:[]}],now);assert.equal(History.load(store,scope,now).length,1);assert.equal(History.rehydrate(History.load(store,scope,now)[0],[],scope.origin).sources.length,0);});
