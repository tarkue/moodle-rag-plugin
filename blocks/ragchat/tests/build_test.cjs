const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const names=['chat','markdown','history','legacy'];
const inject=(text,name)=>text.replace('define(', 'define("block_ragchat/'+name+'", ');
const legacyTransport=(text,name)=>inject(text,name);
const modernTransport=(text,name)=>/define\(\s*['"]/.test(text)?text:inject(text,name);
function exportsFromTransport(text,name){let exported;vm.runInNewContext(text,{URL,define:(...args)=>{assert.equal(args.length,3,'one named definition after installed Moodle transport');assert.equal(args[0],'block_ragchat/'+name);assert.ok(Array.isArray(args[1]));assert.equal(typeof args[2],'function');exported=args[2]();}});return exported;}
for(const name of names){test(name+' build remains anonymous source bytes for core-owned AMD naming',()=>{const source=fs.readFileSync(__dirname+'/../amd/src/'+name+'.js','utf8'),built=fs.readFileSync(__dirname+'/../amd/build/'+name+'.min.js','utf8');assert.equal(built,source);assert.match(built,/^define\(\[/m);});
for(const [version,transport]of [['3.0 always-inject',legacyTransport],['modern inject-if-missing',modernTransport]])test(name+' exports survive '+version+' transport',()=>{const built=fs.readFileSync(__dirname+'/../amd/build/'+name+'.min.js','utf8'),exports=exportsFromTransport(transport(built,name),name),method={chat:'init',markdown:'render',history:'load',legacy:'init'}[name];assert.equal(typeof exports[method],'function');});}
