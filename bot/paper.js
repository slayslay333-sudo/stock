// 가상계좌 모의투자: 정해진 날부터 매주 실제 시세로 규칙대로 사고판 결과를 기록
// 사용: node paper.js   → ../paper/state.json 저장
const fs=require('fs'),path=require('path'),E=require('./engine.js');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));
const p={...cfg.strategy,from:cfg.paper.from};
const r=E.run(D,p);
const lastDate=D.dates.at(-1);
const hold=k=>{const i0=D.dates.findIndex(d=>d>=cfg.paper.from);if(i0<0||i0+1>=D.dates.length)return null;const A=D.assets[k];const sh=p.start/(1+p.fee/100)/A[i0+1][0];return sh*A.at(-1)[2]};
const core=r.sleeves[0];
const target=(()=>{const pb=r.pending.find(x=>x.kind==='장타'&&x.act==='매수');if(pb)return pb.asset;if(r.pending.some(x=>x.kind==='장타'&&x.act==='매도'))return null;return core.asset})();
const st=E.stats(r.eq)||null;
const state={
  updated:new Date().toISOString(),dataUntil:lastDate,dataUpdated:D.updated||null,
  start:{date:cfg.paper.from,money:p.start},
  value:r.eq.length?r.eq.at(-1)[1]:p.start,
  weeks:r.eq.length,
  holdings:r.sleeves.filter(s=>s.asset).map(s=>({kind:s.kind,asset:s.asset,name:cfg.assets[s.asset].이름,shares:s.shares,price:s.price,entry:s.entry,valueMan:s.value})),
  cashMan:r.sleeves.reduce((a,s)=>a+s.cash,0),
  pending:r.pending.map(x=>({...x,name:x.asset?cfg.assets[x.asset].이름:null})),
  target, targetName:target?cfg.assets[target].이름:'현금',
  log:r.log.map(x=>({week:x[0],kind:x[1],act:x[2],asset:x[3],name:cfg.assets[x[3]].이름,price:x[4],why:x[5],shares:x[6]})),
  equity:r.eq, feeMan:r.feePaid, taxMan:r.taxPaid, unrealizedTaxableMan:r.realized,
  compareQQQ:hold('QQQ'),
  stats:st&&{avg:st.avg,cagr:st.cagr,mdd:st.mdd,months:st.months,monthly:st.monthly},
  rules:p
};
fs.mkdirSync(path.join(__dirname,'..','paper'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'..','paper','state.json'),JSON.stringify(state,null,1));
console.log(`가상계좌 ${lastDate} 기준: ${state.value.toFixed(1)}만원 (시작 ${p.start}만원, ${state.weeks}주) / 목표 보유: ${state.targetName} / 다음 주 주문: ${state.pending.map(x=>x.act+' '+x.name).join(', ')||'없음'}`);
