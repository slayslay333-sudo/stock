// 단타 모의투자(실험): 나스닥 추종(QQQ) 하나를 장중 현재가로 하루 안에 사고판다. 밤을 넘겨 들고 있지 않는다.
// 무료 자료로는 30분 단위 과거 시세를 받을 수 없어서(유료 전용) 과거 시험이 안 된다. 앞으로 쌓이는 기록으로만 평가.
// 사용: node daytrade.js <현재가 파일>   (알파 밴티지 GLOBAL_QUOTE 결과: CSV 또는 {"result":"CSV"})
//       node daytrade.js --check          (기록 점검만)
// 규칙 (미국 동부 시간 기준, 정규장 9:30~16:00)
//   사기: 보유 없음 + 10:30~15:30 사이 + 오늘 시가보다 0.3% 넘게 높고 + 어제 종가보다 높을 때 → 가진 돈 전부로 1주 단위 매수
//   팔기: 산 값보다 1% 떨어지면(손절) / 2% 오르면(익절) / 15:30 이후 또는 장이 끝난 뒤 처음 실행될 때(당일 정리)
//   하루에 한 번만 산다. 수수료 0.25%(사고팔 때 각각) + 팔 때 미국 거래위원회 수수료, 체결가는 현재가에서 0.05% 불리하게.
//   양도세는 해가 바뀔 때 1년 이익에서 250만원 빼고 22%.
const fs=require('fs'),path=require('path');
const FILE=path.join(__dirname,'data','daytrade.json');
const R={sym:'QQQ',start:1000,fx:1350,fee:0.25,sec:0.00206,slip:0.05,tax:22,ded:250,upOpen:0.3,stop:1,take:2,entryFrom:'10:30',entryTo:'15:30',exitAt:'15:30'};
function load(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){const fxUsd=1e4/R.fx;return {rules:R,cashUsd:R.start*fxUsd,shares:0,entry:null,entryDay:null,costUsd:0,boughtDays:[],realizedUsdYear:0,year:null,taxMan:0,feeMan:0,log:[],marks:[],quotes:[]}}}
function et(now){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,weekday:'short'});
  const p=Object.fromEntries(f.formatToParts(now).map(x=>[x.type,x.value]));return {day:p.year+'-'+p.month+'-'+p.day,hm:(p.hour==='24'?'00':p.hour)+':'+p.minute,wd:p.weekday}}
function parseQuote(file){let t=fs.readFileSync(file,'utf8').trim();if(t.startsWith('{')){const o=JSON.parse(t);if(typeof o.result!=='string')throw new Error('현재가 결과가 아닙니다: '+t.slice(0,120));t=o.result.trim()}
  const L=t.split(/\r?\n/);if(!/^symbol,open,high,low,price/.test(L[0]))throw new Error('현재가 형식이 다릅니다: '+L[0]);const h=L[0].split(','),v=L[1].split(',');const q=Object.fromEntries(h.map((k,i)=>[k,v[i]]));
  for(const k of ['open','high','low','price','previousClose'])q[k]=+q[k];if(q.symbol!==R.sym||!(q.price>0&&q.open>0&&q.previousClose>0))throw new Error('현재가 값이 이상합니다');return q}
function step(st,q,now){const fxUsd=1e4/R.fx,fee=R.fee/100,sec=R.sec/100,slip=R.slip/100;const t=et(now);const msgs=[];
  const live=q.latestDay===t.day&&t.hm>='09:30'&&t.hm<'16:00'&&!['Sat','Sun'].includes(t.wd);
  const closed=q.latestDay===t.day&&(t.hm>='16:00'||['Sat','Sun'].includes(t.wd))||q.latestDay<t.day;
  // 해가 바뀌면 양도세
  const y=t.day.slice(0,4);if(st.year&&y!==st.year){const tax=Math.max(0,st.realizedUsdYear-R.ded*fxUsd)*R.tax/100;st.cashUsd-=tax;st.taxMan+=tax/fxUsd;st.realizedUsdYear=0;if(tax>0)msgs.push('양도세 '+(tax/fxUsd).toFixed(1)+'만원')}st.year=y;
  const sell=(why)=>{const px=q.price*(1-slip);const g=st.shares*px,f=g*(fee+sec);st.feeMan+=f/fxUsd;st.realizedUsdYear+=g-f-st.costUsd;st.cashUsd+=g-f;st.log.push({at:now.toISOString(),et:t.day+' '+t.hm,act:'매도',price:+px.toFixed(4),shares:st.shares,why,profitMan:+((g-f-st.costUsd)/fxUsd).toFixed(2)});msgs.push('매도 '+st.shares+'주 @'+px.toFixed(2)+' ('+why+')');st.shares=0;st.costUsd=0;st.entry=null;st.entryDay=null};
  if(st.shares>0){
    if(st.entryDay!==q.latestDay||closed)sell(st.entryDay!==q.latestDay?'날짜 넘김 정리':'장 마감 정리');
    else if(live&&q.price<=st.entry*(1-R.stop/100))sell('손절 '+R.stop+'%');
    else if(live&&q.price>=st.entry*(1+R.take/100))sell('익절 '+R.take+'%');
    else if(live&&t.hm>=R.exitAt)sell('장 마감 전 정리');}
  if(st.shares===0&&live&&t.hm>=R.entryFrom&&t.hm<R.entryTo&&!st.boughtDays.includes(t.day)&&q.price>q.open*(1+R.upOpen/100)&&q.price>q.previousClose){
    const px=q.price*(1+slip);const n=Math.floor(st.cashUsd/(px*(1+fee)));if(n>0){const amt=n*px,f=amt*fee;st.feeMan+=f/fxUsd;st.cashUsd-=amt+f;st.shares=n;st.costUsd=amt+f;st.entry=px;st.entryDay=t.day;st.boughtDays.push(t.day);st.boughtDays=st.boughtDays.slice(-30);
      st.log.push({at:now.toISOString(),et:t.day+' '+t.hm,act:'매수',price:+px.toFixed(4),shares:n,why:'시가보다 '+((q.price/q.open-1)*100).toFixed(2)+'% 위, 어제 종가보다 위'});msgs.push('매수 '+n+'주 @'+px.toFixed(2))}}
  const value=(st.cashUsd+st.shares*q.price)/fxUsd;
  st.quotes.push({at:now.toISOString(),et:t.day+' '+t.hm,latestDay:q.latestDay,price:q.price,open:q.open,prevClose:q.previousClose,live});st.quotes=st.quotes.slice(-400);
  st.marks.push([now.toISOString(),+value.toFixed(2)]);st.marks=st.marks.slice(-2000);
  st.updated=now.toISOString();st.valueMan=value;st.rules=R;
  return {msgs:msgs.length?msgs:[live?'변화 없음':'장 시간 아님 — 할 일 없음'],value,live,t}}
function check(st){const fxUsd=1e4/R.fx,fee=R.fee/100,sec=R.sec/100;let cash=R.start*fxUsd,sh=0;const errs=[];
  for(const x of st.log){if(!Number.isInteger(x.shares)||x.shares<=0)errs.push('수량 오류 '+x.et);if(x.act==='매수'){cash-=x.shares*x.price*(1+fee);sh+=x.shares}else{cash+=x.shares*x.price*(1-fee-sec);sh-=x.shares}}
  cash-=st.taxMan*fxUsd;if(sh!==st.shares)errs.push('보유 수량 불일치');if(Math.abs(cash-st.cashUsd)>0.01)errs.push('현금 불일치 '+cash.toFixed(2)+' / '+st.cashUsd.toFixed(2));if(st.cashUsd<-1e-6)errs.push('현금 마이너스');return errs}
if(require.main===module){const a=process.argv[2];const st=load();
  if(a==='--check'){const e=check(st);console.log(e.length?'문제: '+e.join(', '):'단타 기록 점검 통과 (거래 '+st.log.length+'건)');process.exit(e.length?1:0)}
  if(!a){console.error('사용: node daytrade.js <현재가 파일> | --check');process.exit(1)}
  const q=parseQuote(a);const r=step(st,q,new Date(process.env.NOW||Date.now()));fs.writeFileSync(FILE,JSON.stringify(st));
  const e=check(st);if(e.length){console.error('점검 실패: '+e.join(', '));process.exit(1)}
  console.log('단타 '+r.t.day+' '+r.t.hm+'(미국 동부) 현재가 '+q.price+' · '+r.msgs.join(', ')+' · 계좌 '+r.value.toFixed(1)+'만원')}
module.exports={load,step,check,parseQuote,et,R,FILE};
