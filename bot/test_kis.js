// 실제 계좌 없이 한투 연결부를 끝까지 시험 (가짜 서버 사용)
const fs=require('fs'),os=require('os'),path=require('path');const {KIS}=require('./kis.js');const {main}=require('./kis_trade.js');const M=require('./mock_kis.js');
let fail=0;const ok=(c,m)=>{console.log((c?'통과':'실패')+' · '+m);if(!c)fail++};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kis'));
const mk=(srv,mode)=>new KIS({mode,baseUrl:srv.url,appkey:'k',appsecret:'s',cano:'12345678',prdt:'01',tokenFile:path.join(tmp,'t_'+mode+Math.random()+'.json')});
const st=t=>({target:t,targetName:t||'현금',dataUntil:'시험'});
(async()=>{
  const s=await M.start({mode:'demo'});const k=mk(s,'demo');
  let r=await main({live:false,state:st('QQQ'),kis:k});ok(r.plan.length===1&&r.plan[0].side==='buy'&&s.acct.cash===7400,'확인만 모드는 주문을 내지 않음');
  r=await main({live:true,state:st('QQQ'),kis:k});ok(s.acct.pos.QQQ>0,'모의: 현금 → 나스닥 추종 '+s.acct.pos.QQQ+'주 매수');
  ok(r.plan[0].qty===Math.floor(7400/(+(715.34*1.01).toFixed(2)*1.0025)),'매수 수량 계산 정확 ('+r.plan[0].qty+'주)');
  r=await main({live:true,state:st('QQQ'),kis:k});ok(r.plan.length===0,'이미 목표대로면 주문 없음');
  r=await main({live:true,state:st('SPY'),kis:k});ok(!s.acct.pos.QQQ&&s.acct.pos.SPY>0,'모의: 갈아타기 (나스닥 매도 → 에스앤피500 '+s.acct.pos.SPY+'주 매수)');
  ok(s.seen.some(x=>x.tr==='VTTT1001U'),'모의 매도 코드 VTTT1001U 사용');
  r=await main({live:true,state:st(null),kis:k});ok(!s.acct.pos.SPY,'모의: 추세 꺾임 → 전부 매도 (현금 '+s.acct.cash.toFixed(2)+'달러)');
  ok(s.tokens()===1,'토큰은 한 번만 발급하고 다시 씀 (발급 '+s.tokens()+'번)');
  ok(k.calls.every(c=>c.rt_cd==='0'),'모든 요청이 공식 형식 검사 통과 ('+k.calls.length+'건)');s.srv.close();
  const s2=await M.start({mode:'demo',rejectDemoSell1001:true});const k2=mk(s2,'demo');s2.acct.pos.QQQ=3;
  await main({live:true,state:st(null),kis:k2});ok(!s2.acct.pos.QQQ&&s2.seen.some(x=>x.tr==='VTTT1006U'),'모의 매도 코드가 거절되면 다른 코드로 재시도');s2.srv.close();
  const s3=await M.start({mode:'real'});const k3=mk(s3,'real');
  await main({live:true,state:st('QQQ'),kis:k3});const o=s3.seen.find(x=>x.path.endsWith('/order'));
  ok(o&&o.tr==='TTTT1002U'&&o.body.ORD_DVSN==='00','실전: 매수는 TTTT1002U 지정가(00)');
  s3.acct.pos.SPY=2;await main({live:true,state:st('QQQ'),kis:k3});const o2=s3.seen.filter(x=>x.path.endsWith('/order')).find(x=>x.body.SLL_TYPE==='00');
  ok(o2&&o2.tr==='TTTT1006U'&&o2.body.ORD_DVSN==='00'&&o2.body.OVRS_EXCG_CD==='AMEX','실전: 매도는 TTTT1006U 지정가(00), 거래소 AMEX');s3.srv.close();
  console.log(fail?'\n문제 '+fail+'개':'\n전부 통과');process.exit(fail?1:0)})().catch(e=>{console.error(e);process.exit(1)});
