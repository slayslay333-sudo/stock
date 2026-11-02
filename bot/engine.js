/* 주간 전략 시험 엔진 — 브라우저와 노드 양쪽에서 같은 코드로 돌아감
   신호: 그 주 종가로 판단 → 다음 주 시가에 체결
   손절: 보유 중 그 주 최저가가 손절가에 닿으면 손절가(시가가 이미 아래면 시가)에 매도 */
(function(root){
const DEF={risk:["QQQ","SPY"],safe:["TLT","GLD"],useSafe:true,look:26,trend:40,stop:5,reMa:10,rebal:4,
  swingW:0,swingDrop:4,swingHold:2,whole:false,stopMode:"low",fee:0.25,sec:0.00206,tax:22,ded:250,fx:1350,start:1000,from:"2005-01-01",to:"9999"};
function sma(a,i,n){if(i<n-1)return null;let s=0;for(let k=i-n+1;k<=i;k++)s+=a[k];return s/n}
function run(D,p){p=Object.assign({},DEF,p);
  const T=D.dates,A=D.assets,n=T.length,fee=p.fee/100,sec=p.sec/100;
  const C={},O={},L={};for(const k in A){C[k]=A[k].map(r=>r[2]);O[k]=A[k].map(r=>r[0]);L[k]=A[k].map(r=>r[1])}
  const fxUsd=1e4/p.fx;                        // 만원 → 달러
  let cash=p.start*fxUsd,realized=0,yr=null,log=[],eq=[],taxPaid=0,feePaid=0;
  const sl=[{w:1-p.swingW/100,cash:0,sh:0,a:null,cost:0,entry:0,stopped:false,wk:0,kind:"장타"},
            {w:p.swingW/100,cash:0,sh:0,a:null,cost:0,entry:0,stopped:false,wk:0,kind:"단타"}];
  sl[0].cash=cash*sl[0].w;sl[1].cash=cash*sl[1].w;
  const val=(s,i)=>s.cash+(s.sh?s.sh*C[s.a][i]:0);
  const buy=(s,a,px,i,why)=>{let q=p.whole?Math.floor(s.cash/(px*(1+fee))):s.cash/(px*(1+fee));if(q<=0)return;const amt=q*px,f=amt*fee;feePaid+=f;s.sh=q;s.cost=amt+f;s.cash-=amt+f;if(s.cash<1e-9)s.cash=Math.max(0,s.cash);s.a=a;s.entry=px;s.wk=0;log.push([T[i],s.kind,"매수",a,px,why,q])};
  const sell=(s,px,i,why)=>{const g=s.sh*px,f=g*(fee+sec);feePaid+=f;realized+=g-f-s.cost;s.cash+=g-f;log.push([T[i],s.kind,"매도",s.a,px,why,s.sh]);s.sh=0;s.cost=0;s.a=null};
  let pend=[];
  for(let i=0;i<n;i++){
    if(T[i]<p.from||T[i]>p.to){continue}
    const y=T[i].slice(0,4);
    if(yr&&y!==yr){const tax=Math.max(0,realized-p.ded*fxUsd)*p.tax/100;taxPaid+=tax;realized=0;
      let tot=sl.reduce((s,x)=>s+val(x,i-1),0);
      for(const s of sl){let part=tot>0?tax*val(s,i-1)/tot:0;if(s.cash>=part)s.cash-=part;else{let need=part-s.cash;s.cash=0;if(s.sh){const q=need/C[s.a][i-1];s.cost*=Math.max(0,(s.sh-q)/s.sh);s.sh-=q}}}}
    yr=y;
    // 1) 지난주 신호 체결 (이번 주 시가)
    for(const [s,act,a,why] of pend){if(act==="sell"&&s.sh){sell(s,O[s.a][i],i,why);if(why.startsWith("손절"))s.stopped=true}else if(act==="buy"&&!s.sh&&s.cash>0)buy(s,a,O[a][i],i,why)}
    pend=[];
    // 2) 이번 주 안 손절 (최저가 기준)
    for(const s of sl){if(s.sh&&p.stop>0&&p.stopMode==="low"){const sp=s.entry*(1-p.stop/100);if(L[s.a][i]<=sp){sell(s,Math.min(O[s.a][i],sp),i,"손절 "+p.stop+"%");s.stopped=true}}if(s.sh)s.wk++}
    eq.push([T[i],sl.reduce((t,x)=>t+val(x,i),0)/fxUsd]);
    // 3) 이번 주 종가로 다음 주 계획
    const mom=k=>i>=p.look?C[k][i]/C[k][i-p.look]-1:null,up=k=>{const m=sma(C[k],i,p.trend);return m!==null&&C[k][i]>m};
    const cand=p.risk.filter(k=>up(k)&&mom(k)>0).sort((a,b)=>mom(b)-mom(a));
    const safe=p.useSafe?p.safe.filter(k=>mom(k)>0).sort((a,b)=>mom(b)-mom(a)):[];
    const target=cand[0]||safe[0]||null;
    const core=sl[0];
    if(p.stop>0&&p.stopMode==="close")for(const s of sl){if(s.sh&&C[s.a][i]<=s.entry*(1-p.stop/100))pend.push([s,"sell",null,"손절 "+p.stop+"%"])}
    const stopNow=s=>pend.some(x=>x[0]===s&&x[2]===null&&x[3].startsWith("손절"));
    const reOk=k=>{if(!core.stopped)return true;const m=sma(C[k],i,p.reMa);return m!==null&&C[k][i]>m};
    const rebalWeek=(eq.length%p.rebal)===0;
    if(core.w>0){
      if(core.sh&&!stopNow(core)){const a=core.a,isRisk=p.risk.includes(a);
        if(isRisk&&!up(a))pend.push([core,"sell",null,"추세 꺾임"]);
        else if(rebalWeek&&target&&target!==a)pend.push([core,"sell",null,"갈아타기"]);}
      if(target&&!stopNow(core)&&(!core.sh||pend.some(x=>x[0]===core))){
        if(reOk(target)){pend.push([core,"buy",target,cand[0]?"추세 상승":"방어 자산"]);core.stopped=false}}
    }
    const sw=sl[1];
    if(sw.w>0){
      if(sw.sh&&!stopNow(sw)){if(sw.wk>=p.swingHold)pend.push([sw,"sell",null,"단타 정리"])}
      else{const c=p.risk.filter(k=>up(k)&&i>0&&C[k][i]/C[k][i-1]-1<=-p.swingDrop/100);if(c.length)pend.push([sw,"buy",c[0],"급락 반등 노림"])}
    }
  }
  const li=T.length-1;
  return {eq,log,taxPaid:taxPaid/fxUsd,feePaid:feePaid/fxUsd,p,fxUsd,realized:realized/fxUsd,
    pending:pend.map(([s,act,a,why])=>({kind:s.kind,act:act==="sell"?"매도":"매수",asset:act==="sell"?s.a:a,why})),
    sleeves:sl.map(s=>({kind:s.kind,cash:s.cash/fxUsd,asset:s.a,shares:s.sh,entry:s.entry,cost:s.cost/fxUsd,price:s.a?C[s.a][li]:null,value:(s.cash+(s.sh?s.sh*C[s.a][li]:0))/fxUsd,stopped:s.stopped}))};
}
/* 고정 비율 전략: 정해진 비율로 사서 들고 있다가, 달이 바뀐 첫 주에(rebalM개월마다) 비율을 다시 맞춤.
   w={SPY:0.6,TLT:0.4}. rebalM=0 이면 처음에 사고 계속 보유. 신호는 그 주 종가, 체결은 다음 주 시가(회전 전략과 같음). */
function runFixed(D,p){p=Object.assign({},DEF,{rebalM:1},p);
  const T=D.dates,A=D.assets,n=T.length,fee=p.fee/100,sec=p.sec/100,fxUsd=1e4/p.fx,W=p.w,ks=Object.keys(W);
  const C={},O={};for(const k of ks){C[k]=A[k].map(r=>r[2]);O[k]=A[k].map(r=>r[0])}
  let cash=p.start*fxUsd,realized=0,yr=null,taxPaid=0,feePaid=0,log=[],eq=[],pend=false,started=false,lastM=null,mCount=0;
  const sh={},cost={};for(const k of ks){sh[k]=0;cost[k]=0}
  const val=i=>cash+ks.reduce((s,k)=>s+sh[k]*C[k][i],0);
  for(let i=0;i<n;i++){
    if(T[i]<p.from||T[i]>p.to)continue;
    const y=T[i].slice(0,4);
    if(yr&&y!==yr){const tax=Math.max(0,realized-p.ded*fxUsd)*p.tax/100;taxPaid+=tax;realized=0;
      if(cash>=tax)cash-=tax;else{let need=tax-cash;cash=0;for(const k of ks){if(need<=0)break;if(!sh[k])continue;const px=C[k][i-1];const q=Math.min(sh[k],Math.ceil(need/(px*(1-fee-sec))));const g=q*px,f=g*(fee+sec);feePaid+=f;realized+=g-f-cost[k]*q/sh[k];cost[k]*=(sh[k]-q)/sh[k];sh[k]-=q;cash+=g-f;need-=g-f;log.push([T[i],"고정","매도",k,px,"세금 낼 현금",q])}cash=Math.max(0,cash-Math.max(0,need))}}
    yr=y;
    if(pend){ // 다음 주 시가로 비율 맞추기: 먼저 팔고, 그다음 사기
      const tot=cash+ks.reduce((s,k)=>s+sh[k]*O[k][i],0);const tgt={};for(const k of ks)tgt[k]=p.whole?Math.floor(tot*W[k]/(O[k][i]*(1+fee))):tot*W[k]/(O[k][i]*(1+fee));
      for(const k of ks)if(sh[k]>tgt[k]){const q=sh[k]-tgt[k],px=O[k][i],g=q*px,f=g*(fee+sec);feePaid+=f;const c=cost[k]*q/sh[k];realized+=g-f-c;cost[k]-=c;sh[k]-=q;cash+=g-f;log.push([T[i],"고정","매도",k,px,started?"비율 맞추기":"시작",q])}
      for(const k of ks)if(sh[k]<tgt[k]){let q=tgt[k]-sh[k];const px=O[k][i];if(p.whole)q=Math.min(q,Math.floor(cash/(px*(1+fee))));else q=Math.min(q,cash/(px*(1+fee)));if(q<=0)continue;const amt=q*px,f=amt*fee;feePaid+=f;sh[k]+=q;cost[k]+=amt+f;cash-=amt+f;log.push([T[i],"고정","매수",k,px,started?"비율 맞추기":"시작",q])}
      if(cash<0)cash=0;pend=false;started=true}
    eq.push([T[i],val(i)/fxUsd]);
    const m=T[i].slice(0,7);
    if(!started)pend=true;
    else if(p.rebalM>0&&lastM&&m!==lastM){mCount++;if(mCount%p.rebalM===0){const tot=val(i);const off=ks.some(k=>Math.abs(sh[k]*C[k][i]/tot-W[k])>0.02);if(off)pend=true}}
    lastM=m;
  }
  const li=n-1;
  return {eq,log,taxPaid:taxPaid/fxUsd,feePaid:feePaid/fxUsd,p,fxUsd,realized:realized/fxUsd,
    pending:pend?ks.map(k=>({kind:"고정",act:started?"비율 맞추기":"매수",asset:k,why:started?"비율 맞추기":"시작"})):[],
    sleeves:ks.map(k=>({kind:"고정",cash:0,asset:sh[k]?k:null,shares:sh[k],entry:sh[k]?cost[k]/sh[k]/(1+0):0,cost:cost[k]/fxUsd,price:C[k][li],value:sh[k]*C[k][li]/fxUsd,stopped:false})).concat([{kind:"현금",cash:cash/fxUsd,asset:null,shares:0,entry:0,cost:0,price:null,value:cash/fxUsd,stopped:false}])};
}
function stats(eq,from,to){
  const e=eq.filter(x=>x[0]>=(from||"")&&x[0]<=(to||"9999"));if(e.length<10)return null;
  const mon={};for(const [d,v] of e)mon[d.slice(0,7)]=v;const mk=Object.keys(mon);const mr=[];
  for(let k=1;k<mk.length;k++)mr.push(mon[mk[k]]/mon[mk[k-1]]-1);
  let pk=0,mdd=0;for(const [,v] of e){pk=Math.max(pk,v);mdd=Math.min(mdd,v/pk-1)}
  const yrs=e.length/52.18,cagr=Math.pow(e[e.length-1][1]/e[0][1],1/yrs)-1;
  const yr={};for(const [d,v] of e)(yr[d.slice(0,4)]=yr[d.slice(0,4)]||[v,v])[1]=v;
  return {months:mr.length,avg:mr.reduce((s,x)=>s+x,0)/mr.length*100,cagr:cagr*100,mdd:mdd*100,
    ge1:mr.filter(x=>x>=0.01).length/mr.length*100,neg:mr.filter(x=>x<0).length/mr.length*100,worst:Math.min(...mr)*100,best:Math.max(...mr)*100,
    start:e[0][1],end:e[e.length-1][1],monthly:mk.slice(1).map((m,k)=>[m,mr[k]*100])};
}
// 전략 하나 실행: kind "fixed"면 고정 비율, 아니면 추세 회전
function runAny(D,s){return s.kind==="fixed"?runFixed(D,s):run(D,s)}
const api={DEF,run,runFixed,runAny,stats};
if(typeof module!=="undefined")module.exports=api;else root.Engine=api;
})(this);
