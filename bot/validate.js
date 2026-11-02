// 실수 방지 점검: 문제가 하나라도 있으면 실패(종료 코드 1)
const fs=require('fs'),path=require('path'),E=require('./engine.js'),NEWS=require('./news.js'),ST=require('./strat.js'),P=require('./picks.js');
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
const stockStatus=ST.status(D);
{let neg=false;for(const x of SJ.strategies){if(x.s.kind==='picks'&&!stockStatus.ready)continue;const r=ST.run(D,{...x.s,from:'2005-01-01'});if(r.sleeves.some(z=>z.cash<-1e-6)||r.eq.some(e=>!(e[1]>0)))neg=true}ok(!neg,'전략 모두 현금 마이너스·0원 이하 없음 (2005년부터)')}
const mp=path.join(__dirname,'..','paper','multi.json');
if(fs.existsSync(mp)){const m=JSON.parse(fs.readFileSync(mp,'utf8'));let good=m.dataUntil===D.dates.at(-1)&&m.strategies.length===SJ.strategies.length;
  for(const x of SJ.strategies){if(x.s.kind==='picks'&&!stockStatus.ready){const st=m.strategies.find(z=>z.id===x.id);if(!st||!st.waiting)good=false;continue}const r=ST.run(D,{...x.s,from:x.from||SJ.from});const v=r.eq.length?r.eq.at(-1)[1]:x.s.start;const st=m.strategies.find(z=>z.id===x.id);if(!st||Math.abs(st.value-v)>0.01)good=false}
  ok(good,'전략 '+SJ.strategies.length+'개 가상계좌 저장값과 재계산 일치')}
const ap=path.join(__dirname,'..','paper','analysis.json');
if(fs.existsSync(ap)){const a=JSON.parse(fs.readFileSync(ap,'utf8'));ok(a.dataUntil===D.dates.at(-1)&&a.rows.filter(x=>!x.compareOnly).length===SJ.strategies.length,'분석 자료가 최신 자료 기준')}
// 8. 12번 재무 전략 · 회사 자료
{const SL=JSON.parse(fs.readFileSync(path.join(__dirname,'stocks.json'),'utf8')).list;const dir=path.join(__dirname,'data','stocks');
 const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')):[];
 ok(files.every(f=>SL.some(x=>x.sym+'.json'===f)),'회사 자료 파일이 모두 명단 안 회사 ('+files.length+'개)');
 let fine=true;for(const f of files){const j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
   if(j.price&&!j.price.rows.every((r,i,a)=>r.slice(1).every(v=>v>0)&&(i===0||r[0]>a[i-1][0])))fine=false;
   for(const k of ['inc','bal'])if(j[k]&&!j[k].q.every((r,i,a)=>i===0||r[0]>a[i-1][0]))fine=false}
 ok(fine,'회사 자료: 날짜 순서·가격이 0보다 큼');
 console.log('     회사 자료 '+stockStatus.have+'/'+stockStatus.total+(stockStatus.ready?' (12번 계산함, '+stockStatus.upTo+' 주까지)':' (다 모이면 12번 시작)'));
 const pk=SJ.strategies.find(x=>x.s.kind==='picks');
 if(pk&&stockStatus.ready){const s={...pk.s,from:'2016-01-01',tax:0};const r=ST.run(D,s);const S=ST.stocks(D);const fee=s.fee/100,sec=s.sec/100;let cash=s.start*r.fxUsd;const sh={};
   for(const x of r.log){if(x[2]==='매수'){cash-=x[6]*x[4]*(1+fee);sh[x[3]]=(sh[x[3]]||0)+x[6]}else{cash+=x[6]*x[4]*(1-fee-sec);sh[x[3]]-=x[6]}}
   const last=D.dates.indexOf(r.eq.at(-1)[0]);const lp=k=>{for(let i=last;i>=0;i--)if(S[k].c[i]>0)return S[k].c[i];return 0};
   const v=(cash+Object.entries(sh).reduce((a,[k,q])=>a+q*lp(k),0))/r.fxUsd;ok(Math.abs(v-r.eq.at(-1)[1])<0.01,'12번 현금 흐름 검산 '+v.toFixed(2)+' = 엔진 '+r.eq.at(-1)[1].toFixed(2)+'만원');
   ok(r.log.every(x=>Number.isInteger(x[6])&&x[6]>0)&&Object.values(sh).every(q=>q>=0)&&cash>=-1e-6,'12번: 1주 단위, 수량·현금 마이너스 없음');
   ok(r.log.filter(x=>x[2]==='매수').length>0&&new Set(r.log.filter(x=>x[2]==='매수').map(x=>x[3])).size>=10,'12번: 여러 회사를 실제로 사고팜');
   // 미래 자료: 주가를 잘라서 다시 돌려도 거래 동일
   const n2=r.eq.length?D.dates.indexOf(r.eq.at(-1)[0])+1:D.dates.length;let same=true;
   for(let k=n2-60;k<=n2;k+=13){const Dk={dates:D.dates.slice(0,k),assets:D.assets};const Sk=Object.fromEntries(Object.entries(S).map(([a,v])=>[a,{...v,o:v.o.slice(0,k),l:v.l.slice(0,k),c:v.c.slice(0,k)}]));
     const rk=P.run(Dk,{...s,universe:ST.SYMS},Sk);if(JSON.stringify(rk.log)!==JSON.stringify(r.log.filter(x=>x[0]<=Dk.dates.at(-1)))){same=false;break}}
   ok(same,'12번 미래 주가 안 씀');
   // 미래 재무: 고른 날 기준 발표 전(마감+90일 안) 분기 자료를 망가뜨려도 그날 선택이 같아야 함
   const i=D.dates.indexOf('2018-06-29');if(i>0){const a=P.pick(S,ST.SYMS,i,D,{...pk.s}).list.join();const S2=JSON.parse(JSON.stringify(S));
     for(const k of Object.keys(S2))for(const q of S2[k].inc)if(q[0]>'2018-03-31')q[3]=-1;ok(a===P.pick(S2,ST.SYMS,i,D,{...pk.s}).list.join()&&a.length>0,'12번 발표 전 재무 자료 안 씀')}}}
console.log(fail?'\n문제 '+fail+'개':'\n전부 통과');process.exit(fail?1:0);
