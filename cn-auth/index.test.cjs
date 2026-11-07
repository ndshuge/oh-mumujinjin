const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('./index.js');
const cfg={IM_APP_ID:'1400000000',IM_SECRET_KEY:'im-test-key-only',IM_SESSION_SECRET:'f'.repeat(48),
 ALLOWED_ORIGINS:'https://ndshuge.github.io'};
const genSig=async({userID})=>'SIGN_'+userID;
const req=(body,origin='https://ndshuge.github.io')=>({httpMethod:'POST',headers:{origin},body:JSON.stringify(body)});
test('creates unique anonymous identity and signed resumable ticket; credentials never include server keys',async()=>{
 const handler=createApp(cfg,genSig);
 const response=await handler(req({}));
 assert.equal(response.statusCode,200);
 const data=JSON.parse(response.body);
 assert.match(data.userID,/^m_[a-z0-9]{24}$/);
 assert.equal(data.sdkAppID,1400000000);
 assert.equal(data.userSig,'SIGN_'+data.userID);
 assert.equal(typeof data.ticket,'string');
 assert.ok(!JSON.stringify(data).includes('im-test-key'));
 const second=JSON.parse((await handler(req({ticket:data.ticket}))).body);
 assert.equal(second.userID,data.userID);
});
test('refuses forbidden origin, invalid ticket, missing secrets and GET requests',async()=>{
 const handler=createApp(cfg,genSig);
 const denied=await handler(req({},'https://evil.example'));
 assert.equal(denied.statusCode,403);
 const invalid=await handler(req({ticket:'forged-ticket'}));
 assert.equal(invalid.statusCode,401);
 const get=await handler({httpMethod:'GET',headers:{origin:'https://ndshuge.github.io'}});
 assert.equal(get.statusCode,405);
 assert.throws(()=>createApp({...cfg,IM_SECRET_KEY:''},genSig),/IM_SECRET_KEY/);
});
test('OPTIONS preflight only allows configured origin',async()=>{
 const handler=createApp(cfg,genSig);
 const allow=await handler({httpMethod:'OPTIONS',headers:{origin:'https://ndshuge.github.io'}});
 assert.equal(allow.statusCode,204);
 assert.equal(allow.headers['Access-Control-Allow-Origin'],'https://ndshuge.github.io');
 const deny=await handler({httpMethod:'OPTIONS',headers:{origin:'https://evil.example'}});
 assert.equal(deny.statusCode,403);
});
