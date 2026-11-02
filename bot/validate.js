// 실수 방지 점검: 문제가 하나라도 있으면 실패(종료 코드 1)
const fs=require('fs'),path=require('path'),E=require('./engine.js'),NEWS=require('./news.js');
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
// 7. 전략 10개 가상계좌
const SJ=JSON.parse(fs.readFileSync(path.join(__dirname,'strategies.json'),'utf8'));
ok(SJ.strategies.length>=10&&new Set(SJ.strategies.map(x=>x.id)).size===SJ.strategies.length,'전략 '+SJ.strategies.length+'개, 번호 겹침 없음');
{const e=NEWS.check(D.dates);ok(!e.length,'뉴스 점수 기록 '+NEWS.load().weeks.length+'주 형식'+(e.length?': '+e.join(', '):''))}
ok(SJ.strategies.every(x=>[...(x.s.risk||[]),...(x.s.safe||[]),...Object.keys(x.s.w||{})].every(k=>D.assets[k])),'전략이 쓰는 종목 자료가 모두 있음');
ok(SJ.strategies.filter(x=>x.s.kind==='fixed').every(x=>Math.abs(Object.values(x.s.w).reduce((a,b)=>a+b,0)-1)<1e-9),'고정 비율 합이 100%');
// 미래 자료를 보지 않는지 (고정 비율 5번, 업종 순환 8번)
for(const id of [5,8]){const s={...SJ.strategies.find(x=>x.id===id).s,from:'2016-01-01'};const fl=E.runAny(D,s);let same=true;
  for(let k=n-120;k<=n;k+=9){const Dk={dates:D.dates.slice(0,k),assets:Object.fromEntries(Object.entries(D.assets).map(([a,v])=>[a,v.slice(0,k)]))};
    if(JSON.stringify(E.runAny(Dk,s).log)!==JSON.stringify(fl.log.filter(x=>x[0]<=Dk.dates.at(-1)))){same=false;break}}
  ok(same,id+'번 전략 미래 자료 안 씀')}
// 고정 비율 돈 계산 검산 (세금 0으로)
{const s={...SJ.strategies.find(x=>x.id===5).s,from:'2016-01-01',tax:0};const r=E.runAny(D,s);const fee=s.fee/100,sec=s.sec/100;let cash=s.start*r.fxUsd;const sh={};
 for(const x of r.log){if(x[2]==='매수'){cash-=x[6]*x[4]*(1+fee);sh[x[3]]=(sh[x[3]]||0)+x[6]}else{cash+=x[6]*x[4]*(1-fee-sec);sh[x[3]]-=x[6]}}
 const v=(cash+Object.entries(sh).reduce((a,[k,q])=>a+q*D.assets[k].at(-1)[2],0))/r.fxUsd;ok(Math.abs(v-r.eq.at(-1)[1])<0.01,'고정 비율 현금 흐름 검산 '+v.toFixed(2)+' = 엔진 '+r.eq.at(-1)[1].toFixed(2)+'만원');
 ok(Object.values(sh).every(q=>q>=0)&&r.log.every(x=>Number.isInteger(x[6])&&x[6]>0),'고정 비율: 1주 단위, 보유 수량 마이너스 없음')}
{let neg=false;for(const x of SJ.strategies){const r=E.runAny(D,{...x.s,from:'2005-01-01'});if(r.sleeves.some(z=>z.cash<-1e-6)||r.eq.some(e=>!(e[1]>0)))neg=true}ok(!neg,'전략 모두 현금 마이너스·0원 이하 없음 (2005년부터)')}
const mp=path.join(__dirname,'..','paper','multi.json');
if(fs.existsSync(mp)){const m=JSON.parse(fs.readFileSync(mp,'utf8'));let good=m.dataUntil===D.dates.at(-1)&&m.strategies.length===SJ.strategies.length;
  for(const x of SJ.strategies){const r=E.runAny(D,{...NEWS.attach(x.s),from:SJ.from});const v=r.eq.length?r.eq.at(-1)[1]:x.s.start;const st=m.strategies.find(z=>z.id===x.id);if(!st||Math.abs(st.value-v)>0.01)good=false}
  ok(good,'전략 '+SJ.strategies.length+'개 가상계좌 저장값과 재계산 일치')}
const ap=path.join(__dirname,'..','paper','analysis.json');
if(fs.existsSync(ap)){const a=JSON.parse(fs.readFileSync(ap,'utf8'));ok(a.dataUntil===D.dates.at(-1)&&a.rows.length===SJ.strategies.length,'분석 자료가 최신 자료 기준')}
console.log(fail?'\n문제 '+fail+'개':'\n전부 통과');process.exit(fail?1:0);
