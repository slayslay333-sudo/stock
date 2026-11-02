// 12번 전략: 재무로 회사 고르기 (노드 전용 — 회사 자료 data/stocks/*.json 사용)
// 매 rebalW주(기본 13주=약 3개월)마다, 그 주 종가 시점에 "이미 발표됐을" 재무 자료만으로 점수를 매겨 상위 top개를 똑같이 나눠 산다.
// 발표 날짜가 자료에 없어서 분기 마감일 + lag일(기본 90일)이 지나야 쓴 것으로 계산한다 (미래 자료 방지).
// 점수 = 아래 4가지 순위 백분율의 평균 (높을수록 좋음)
//   수익성: 최근 4분기 순이익 ÷ 최근 4분기 매출          (높을수록)
//   성장  : 최근 4분기 매출 ÷ 그 1년 전 4분기 매출 - 1     (높을수록)
//   부채  : 총부채 ÷ 총자산                                (낮을수록)
//   가치  : 최근 4분기 순이익 ÷ 시가총액(주식 수 × 주가)   (높을수록 = 이익에 비해 싸다)
// 거르기: 최근 4분기 모두 흑자여야 후보.  equal:true 면 점수 없이 자료 있는 회사 전부를 똑같이(비교 기준용).
const fs=require('fs'),path=require('path'),E=require('./engine.js');
const DIR=path.join(__dirname,'data','stocks');
function load(D,syms){const out={};for(const s of syms){let j;try{j=JSON.parse(fs.readFileSync(path.join(DIR,s+'.json'),'utf8'))}catch(e){continue}
  const m=new Map((j.price&&j.price.rows||[]).map(r=>[r[0],r]));const o=[],l=[],c=[];for(const d of D.dates){const r=m.get(d);o.push(r?r[1]:null);l.push(r?r[2]:null);c.push(r?r[3]:null)}
  out[s]={o,l,c,inc:j.inc?j.inc.q:[],bal:j.bal?j.bal.q:[]}}return out}
const addDays=(d,n)=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
function features(x,date,price,lag){const known=d=>addDays(d,lag)<=date;
  const inc=x.inc.filter(r=>known(r[0]));const bal=x.bal.filter(r=>known(r[0]));if(inc.length<8||!bal.length||!(price>0))return null;
  const last4=inc.slice(-4),prev4=inc.slice(-8,-4);
  // 분기가 연달아 있는지(빠진 분기 없이 약 1년 안에 4개)
  const span=(new Date(last4[3][0])-new Date(last4[0][0]))/864e5;if(span>300)return null;
  if(addDays(last4[3][0],lag+200)<date)return null; // 너무 오래된 자료만 있으면 제외
  const sum=(a,k)=>a.reduce((s,r)=>s+(r[k]==null?NaN:r[k]),0);
  const rev=sum(last4,1),revP=sum(prev4,1),ni=sum(last4,3);
  if(!(rev>0)||!(revP>0)||!isFinite(ni))return null;
  if(last4.some(r=>!(r[3]>0)))return {loss:true};
  const b=bal.at(-1);const assets=b[1],liab=b[2],sh=b[4];if(!(assets>0)||liab==null||!(sh>0))return null;
  return {margin:ni/rev,growth:rev/revP-1,debt:liab/assets,value:ni/(sh*price)}}
function pick(S,syms,i,D,p){const date=D.dates[i];
  const avail=syms.filter(s=>S[s]&&S[s].c[i]>0);
  if(p.equal)return {list:avail.slice(),why:{}};
  const F={};for(const s of avail){const f=features(S[s],date,S[s].c[i],p.lag);if(f&&!f.loss)F[s]=f}
  const ks=Object.keys(F);if(ks.length<p.top)return {list:[],why:{},note:'후보 부족 '+ks.length};
  const rank=(key,hi)=>{const v=ks.slice().sort((a,b)=>hi?F[a][key]-F[b][key]:F[b][key]-F[a][key]);const r={};v.forEach((s,j)=>r[s]=ks.length>1?j/(ks.length-1):1);return r};
  const R=[rank('margin',true),rank('growth',true),rank('debt',false),rank('value',true)];
  const score=Object.fromEntries(ks.map(s=>[s,R.reduce((t,r)=>t+r[s],0)/4]));
  const list=ks.sort((a,b)=>score[b]-score[a]||(a<b?-1:1)).slice(0,p.top);
  return {list,why:Object.fromEntries(list.map(s=>[s,{score:score[s],...F[s]}]))}}
function run(D,p,S){p=Object.assign({},E.DEF,{top:10,rebalW:13,lag:90},p);
  const syms=p.universe;S=S||load(D,syms);
  const T=D.dates,n=T.length,fee=p.fee/100,sec=p.sec/100,fxUsd=1e4/p.fx;
  let cash=p.start*fxUsd,realized=0,yr=null,taxPaid=0,feePaid=0,log=[],eq=[],pend=null,lastRebal=-1e9,lastPick=null;
  const sh={},cost={};
  const px=(s,i)=>S[s]&&S[s].c[i]>0?S[s].c[i]:null;
  // 주가가 빠진 주는 가장 최근 종가로 평가
  const lastPx=(s,i)=>{for(let k=i;k>=0;k--){const v=px(s,k);if(v)return v}return 0};
  const val=i=>cash+Object.keys(sh).reduce((t,s)=>t+sh[s]*lastPx(s,i),0);
  const sell=(s,q,price,i,why)=>{const g=q*price,f=g*(fee+sec);feePaid+=f;const c=cost[s]*q/sh[s];realized+=g-f-c;cost[s]-=c;sh[s]-=q;cash+=g-f;log.push([T[i],"재무","매도",s,price,why,q]);if(sh[s]<=0){delete sh[s];delete cost[s]}};
  for(let i=0;i<n;i++){
    if(T[i]<p.from||T[i]>p.to)continue;
    const y=T[i].slice(0,4);
    if(yr&&y!==yr){const tax=Math.max(0,realized-p.ded*fxUsd)*p.tax/100;taxPaid+=tax;realized=0;
      if(cash<tax)for(const s of Object.keys(sh)){if(cash>=tax)break;const pr=lastPx(s,i-1);const q=Math.min(sh[s],Math.ceil((tax-cash)/(pr*(1-fee-sec))));if(q>0)sell(s,q,pr,i,"세금 낼 현금")}
      cash=Math.max(0,cash-tax)}
    yr=y;
    if(pend){ // 다음 주 시가로 체결: 명단에서 빠진 회사 전부 팔기 → 남은 회사 비중 맞추기 → 새 회사 사기
      const op=s=>S[s]&&S[s].o[i]>0?S[s].o[i]:null;
      const tgtList=pend.list.filter(s=>op(s));
      for(const s of Object.keys(sh))if(!tgtList.includes(s)){const o=op(s)||lastPx(s,i);sell(s,sh[s],o,i,"명단 제외")}
      const tot=cash+Object.keys(sh).reduce((t,s)=>t+sh[s]*(op(s)||lastPx(s,i)),0);
      const per=tgtList.length?tot/tgtList.length:0;
      const tq={};for(const s of tgtList)tq[s]=p.whole?Math.floor(per/(op(s)*(1+fee))):per/(op(s)*(1+fee));
      for(const s of tgtList)if((sh[s]||0)>tq[s])sell(s,sh[s]-tq[s],op(s),i,"비중 맞추기");
      for(const s of tgtList){let q=tq[s]-(sh[s]||0);if(q<=0)continue;const o=op(s);q=p.whole?Math.min(q,Math.floor(cash/(o*(1+fee)))):Math.min(q,cash/(o*(1+fee)));if(q<=0)continue;
        const amt=q*o,f=amt*fee;feePaid+=f;sh[s]=(sh[s]||0)+q;cost[s]=(cost[s]||0)+amt+f;cash-=amt+f;log.push([T[i],"재무","매수",s,o,lastPick&&lastPick.why[s]?"점수 "+(lastPick.why[s].score*100).toFixed(0)+"점":(p.equal?"똑같이 나눠 담기":"상위 회사"),q])}
      if(cash<0)cash=0;pend=null}
    eq.push([T[i],val(i)/fxUsd]);
    if(i-lastRebal>=p.rebalW){const pk=pick(S,syms,i,D,p);if(pk.list.length){pend=pk;lastPick=pk;lastRebal=i}}
  }
  const li=n-1;const holds=Object.keys(sh).map(s=>({kind:"재무",cash:0,asset:s,shares:sh[s],entry:cost[s]/sh[s],cost:cost[s]/fxUsd,price:lastPx(s,li),value:sh[s]*lastPx(s,li)/fxUsd,stopped:false}));
  return {eq,log,taxPaid:taxPaid/fxUsd,feePaid:feePaid/fxUsd,p,fxUsd,realized:realized/fxUsd,lastPick,
    pending:pend?pend.list.filter(s=>!sh[s]).map(s=>({kind:"재무",act:"매수",asset:s,why:"새 명단"})).concat(Object.keys(sh).filter(s=>!pend.list.includes(s)).map(s=>({kind:"재무",act:"매도",asset:s,why:"명단 제외"}))):[],
    sleeves:holds.concat([{kind:"현금",cash:cash/fxUsd,asset:null,shares:0,entry:0,cost:0,price:null,value:cash/fxUsd,stopped:false}])}}
// 자료가 다 들어온 마지막 주까지만 자른 자료 (회사 주가가 ETF 자료보다 늦게 들어올 수 있음)
function readyIndex(D,S,syms){const first={};for(const s of syms)if(S[s]){const f=S[s].c.findIndex(v=>v>0);if(f>=0)first[s]=f}
  let k=D.dates.length-1;while(k>0&&Object.keys(first).some(s=>first[s]<=k&&!(S[s].c[k]>0)))k--;return k}
module.exports={load,features,pick,run,readyIndex};
