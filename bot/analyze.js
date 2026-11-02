// 전략 분석: 과거 구간별 성적, 해마다 성적, 아무 달에 시작했을 때 1년 결과, 설정을 조금 바꿔도 버티는지,
// 무작위로 고른 것보다 나은지(운 판별), 큰 하락장 때 성적, 전략끼리 얼마나 비슷하게 움직이는지.
// 사용: node analyze.js  → ../paper/analysis.json
const fs=require('fs'),path=require('path'),E=require('./engine.js'),NEWS=require('./news.js'),ST=require('./strat.js');
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));
const SL=JSON.parse(fs.readFileSync(path.join(__dirname,'strategies.json'),'utf8')).strategies;
const T=D.dates;
const F='2005-01-01',PF='2009-01-01',IS_TO='2015-12-31',OOS='2016-01-01';
const TARGET=Math.pow(1.01,12)-1; // 월 1% 복리 = 1년 12.68%

function at(eq,date){let v=null;for(const [d,x] of eq){if(d<=date)v=x;else break}return v}
function yearly(eq){const y={};let prev=eq[0][1];const out=[];for(const [d,v] of eq)y[d.slice(0,4)]=v;
  for(const k of Object.keys(y)){out.push([k,(y[k]/prev-1)*100]);prev=y[k]}return out}
// 아무 주에 시작해서 52주 들고 있었으면? (매달 첫 주마다 시작점)
function rolling(eq,weeks){const r=[];let lastM=null;for(let i=0;i+weeks<eq.length;i++){const m=eq[i][0].slice(0,7);if(m===lastM)continue;lastM=m;r.push([eq[i][0],(eq[i+weeks][1]/eq[i][1]-1)*100])}return r}
const pct=(a,q)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.round((s.length-1)*q)))]};
// 같은 기간 아무렇게나 골랐을 때: 매 판단 주기마다 후보(+현금) 중 무작위 하나를 들고 있기. 수수료 포함, 세금 제외.
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
function randomCagr(s,runs){const uni=[...new Set([...s.risk,...(s.useSafe?s.safe:[])])];const i0=T.findIndex(d=>d>=F);const fee=s.fee/100+s.sec/200;
  const C=Object.fromEntries(uni.map(k=>[k,D.assets[k].map(r=>r[2])]));const out=[];const R=rng(12345);
  for(let n=0;n<runs;n++){let v=1,cur=null;for(let i=i0;i<T.length-1;i++){if((i-i0)%s.rebal===0){const pick=R()<1/(uni.length+1)?null:uni[Math.floor(R()*uni.length)];if(pick!==cur){v*=1-fee;cur=pick}}
      if(cur)v*=C[cur][i+1]/C[cur][i]}
    out.push((Math.pow(v,52.18/(T.length-1-i0))-1)*100)}return out}
function corr(A,B){const k=Object.keys(A).filter(d=>d in B);const a=k.map(d=>A[d]),b=k.map(d=>B[d]);const n=a.length;if(n<20)return null;const ma=a.reduce((s,x)=>s+x,0)/n,mb=b.reduce((s,x)=>s+x,0)/n;let c=0,va=0,vb=0;for(let i=0;i<n;i++){c+=(a[i]-ma)*(b[i]-mb);va+=(a[i]-ma)**2;vb+=(b[i]-mb)**2}return c/Math.sqrt(va*vb)}

const CRASH=[["2008 금융위기","2007-10-12","2009-03-06"],["2020 코로나 폭락","2020-02-14","2020-03-20"],["2022 금리 인상 하락장","2021-12-31","2022-12-30"],["2025 관세 충격","2025-02-14","2025-04-11"]];
const rows=[];const weeklyRet={};
const stockStatus=ST.status(D);
const ret=eq=>{const o={};for(let i=1;i<eq.length;i++)o[eq[i][0]]=eq[i][1]/eq[i-1][1]-1;return o};
const list=SL.slice();
// 12번이 있고 회사 자료가 다 있으면 비교 기준(다우 30개 똑같이 나눠 담기)도 같이 계산
const pk=SL.find(x=>x.s.kind==='picks');
if(pk&&stockStatus.ready)list.push({id:'B',name:'다우 30개 똑같이',desc:'비교 기준: 12번과 같은 30개 회사를 점수 없이 똑같이 나눠 담고 3개월마다 비율 맞추기',s:{...pk.s,equal:true},compareOnly:true});
for(const x of list){const s=x.s;
  if(s.kind==='picks'&&!stockStatus.ready){rows.push({id:x.id,name:x.name,desc:x.desc,waiting:'회사 자료 받는 중 '+stockStatus.have+'/'+stockStatus.total});console.log(x.id+'. '+x.name+' 회사 자료 받는 중 '+stockStatus.have+'/'+stockStatus.total);continue}
  const R=(o)=>ST.run(D,{...s,...o});
  const F0=s.kind==='picks'?PF:F; // 재무 전략은 재무 자료(2006년 가을부터)가 8분기 쌓인 뒤부터
  const full=R({from:F0});const st=E.stats(full.eq);const start=full.eq[0][0];
  const is=E.stats(R({from:F0,to:IS_TO}).eq),oosR=R({from:OOS}),oos=E.stats(oosR.eq);
  const yr=yearly(full.eq);const roll=rolling(full.eq,52).map(r=>r[1]);
  weeklyRet[x.id]=ret(oosR.eq);
  const crash=CRASH.map(([n,a,b])=>{if(a<start)return [n,null];const va=at(full.eq,a),vb=at(full.eq,b);return [n,va&&vb?(vb/va-1)*100:null]});
  const trades=full.log.length/((full.eq.length)/52.18);
  // 설정 주변: 설정을 조금씩 바꿔도 뒤 기간 성적이 버티는지
  let nb=null;const vals=[];
  if(s.kind==='picks'&&!s.equal){for(const top of [5,10,15])for(const rebalW of [13,26])for(const lag of [90,120])vals.push(E.stats(R({top,rebalW,lag,from:OOS}).eq).avg)}
  else if(s.kind!=="fixed"&&s.kind!=='picks'){const L=[Math.max(4,s.look-13),s.look,s.look+13],Tr=[Math.max(5,s.trend-10),s.trend,s.trend+10],St=s.stop?[Math.max(0,s.stop-5),s.stop,s.stop+5]:[0,5,10];
    for(const look of L)for(const trend of Tr)for(const stop of St)vals.push(E.stats(E.run(D,{...NEWS.attach(s),look,trend,stop,from:OOS}).eq).avg)}
  if(vals.length)nb={n:vals.length,min:Math.min(...vals),median:pct(vals,.5),max:Math.max(...vals),share08:vals.filter(v=>v>=0.8).length/vals.length*100};
  // 운 판별 (세금 빼고 비교) — 추세 회전 전략만
  let luck=null;
  if(!s.kind){const mine=E.stats(E.run(D,{...NEWS.attach(s),from:F,tax:0}).eq).cagr;const rc=randomCagr(s,400);luck={mine,randMedian:pct(rc,.5),rand90:pct(rc,.9),beat:rc.filter(v=>v<mine).length/rc.length*100}}
  rows.push({id:x.id,name:x.name,desc:x.desc,noBacktest:!!s.useNews,compareOnly:!!x.compareOnly,start,
    full:{avg:st.avg,cagr:st.cagr,mdd:st.mdd,neg:st.neg,worst:st.worst,end:full.eq.at(-1)[1],tax:full.taxPaid,fee:full.feePaid,tradesPerYear:trades},
    is:{avg:is.avg,cagr:is.cagr,mdd:is.mdd},oos:{avg:oos.avg,cagr:oos.cagr,mdd:oos.mdd,ge1:oos.ge1,neg:oos.neg},
    years:yr,yearsUp:yr.filter(y=>y[1]>0).length,yearsN:yr.length,
    roll:{n:roll.length,median:pct(roll,.5),worst:Math.min(...roll),best:Math.max(...roll),hitTarget:roll.filter(v=>v>=TARGET*100).length/roll.length*100,loss:roll.filter(v=>v<0).length/roll.length*100,loss10:roll.filter(v=>v<-10).length/roll.length*100},
    crash,nb,luck,
    eq:full.eq.filter((e,i)=>i%4===0||i===full.eq.length-1).map(e=>[e[0],+e[1].toFixed(1)])});
  console.log(x.id+'. '+x.name.padEnd(8),'('+start.slice(0,4)+'~) 월평균',st.avg.toFixed(2)+'%','연',st.cagr.toFixed(1)+'%','최대하락',st.mdd.toFixed(0)+'%','| 뒤 10년 월평균',oos.avg.toFixed(2)+'%','| 1년 목표',(rows.at(-1).roll.hitTarget).toFixed(0)+'%','손해',(rows.at(-1).roll.loss).toFixed(0)+'%',luck?('| 무작위 대비 '+luck.beat.toFixed(0)+'%'):'',nb?('| 설정 주변 0.8%↑ '+nb.share08.toFixed(0)+'%'):'');
}
const ids=Object.keys(weeklyRet).map(k=>isNaN(+k)?k:+k);const cm=ids.map(a=>ids.map(b=>{const c=corr(weeklyRet[a],weeklyRet[b]);return c==null?null:+c.toFixed(2)}));
const newsWeeks=NEWS.load().weeks.length;
const out={newsWeeks,stockStatus,made:new Date().toISOString(),dataUntil:T.at(-1),periods:{full:F,isTo:IS_TO,oos:OOS},target:TARGET*100,crashes:CRASH,rows,corr:{ids,m:cm}};
fs.mkdirSync(path.join(__dirname,'..','paper'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'..','paper','analysis.json'),JSON.stringify(out));
console.log('저장: paper/analysis.json');
