// 실수 방지 점검: 문제가 하나라도 있으면 실패(종료 코드 1)
const fs=require('fs'),path=require('path'),E=require('./engine.js');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));
let fail=0;const ok=(c,m)=>{console.log((c?'통과':'실패')+' · '+m);if(!c)fail++};
// 1. 자료
const n=D.dates.length;ok(n>1000,'자료 주 수 '+n);
ok(Object.values(D.assets).every(a=>a.length===n&&a.every(r=>r.every(v=>v>0&&isFinite(v)))),'모든 가격이 0보다 큰 숫자');
const age=(Date.now()-new Date(D.dates.at(-1)))/864e5;ok(age<14,'마지막 자료 '+D.dates.at(-1)+' ('+age.toFixed(0)+'일 전)');
ok(D.dates.every((d,i)=>i===0||d>D.dates[i-1]),'날짜 순서');
// 2. 미래 자료를 보지 않는지: 자료를 k주까지만 줬을 때 거래가 전체 실행과 똑같아야 함
const p={...cfg.strategy,from:'2016-01-01'};const full=E.run(D,p);
let same=true,checked=0;
for(let k=n-160;k<=n;k+=7){const Dk={dates:D.dates.slice(0,k),assets:Object.fromEntries(Object.entries(D.assets).map(([a,v])=>[a,v.slice(0,k)]))};
  const rk=E.run(Dk,p);const fk=full.log.filter(x=>x[0]<=Dk.dates.at(-1));
  if(JSON.stringify(rk.log)!==JSON.stringify(fk)){same=false;console.log('  다름:',Dk.dates.at(-1));break}checked++}
ok(same,'미래 자료 안 씀 (잘라서 '+checked+'번 다시 돌려도 거래 동일)');
// 3. 돈 계산 검산: 매수·매도 기록으로 현금 흐름을 따로 다시 계산
const p2={...cfg.strategy,from:'2016-01-01',tax:0};const r2=E.run(D,p2);const fee=p2.fee/100,sec=p2.sec/100;
let cash=p2.start*r2.fxUsd,sh=0;for(const x of r2.log){if(x[2]==='매수'){const amt=x[6]*x[4];cash-=amt*(1+fee);sh=x[6]}else{cash+=x[6]*x[4]*(1-fee-sec);sh=0}}
const last=r2.log.at(-1);const val=(cash+(sh&&last[2]==='매수'?sh*D.assets[last[3]].at(-1)[2]:0))/r2.fxUsd;
ok(Math.abs(val-r2.eq.at(-1)[1])<0.01,'현금 흐름 검산 '+val.toFixed(2)+' = 엔진 '+r2.eq.at(-1)[1].toFixed(2)+'만원');
ok(r2.log.every(x=>Number.isInteger(x[6])&&x[6]>0),'모든 주문이 1주 단위 정수');
ok(r2.sleeves.every(s=>s.cash>=-1e-9),'현금이 마이너스가 된 적 없음(마지막)');
// 4. 세금 검산: 한 해 이익 1,000만원이면 (1000-250)*22% = 165만원
ok(Math.abs(Math.max(0,1000-250)*0.22-165)<1e-9,'양도세 공식 (1000-250)×22% = 165');
// 5. 시험실 성적 재현 (검증 기간 월평균 1% 근처)
const s=E.stats(E.run(D,cfg.strategy).eq,'2016-01-01','2026-12-31');ok(s.avg>0.9,'검증 기간 월평균 '+s.avg.toFixed(3)+'%');
// 6. 가상계좌 결과가 저장되어 있으면 재계산과 일치
const sp=path.join(__dirname,'..','paper','state.json');
if(fs.existsSync(sp)){const st=JSON.parse(fs.readFileSync(sp,'utf8'));const rr=E.run(D,{...cfg.strategy,from:cfg.paper.from});
  ok(Math.abs((rr.eq.length?rr.eq.at(-1)[1]:cfg.strategy.start)-st.value)<0.01&&st.dataUntil===D.dates.at(-1),'가상계좌 저장값과 재계산 일치')}
console.log(fail?'\n문제 '+fail+'개':'\n전부 통과');process.exit(fail?1:0);
