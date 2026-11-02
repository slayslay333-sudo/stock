// 연구 실행: research/ideas.json 에서 아직 안 한 아이디어를 n개 시험해 ../paper/research.json 에 기록
// 사용: node research.js [n=2]      (모두 했으면 "대기열 비었음")
// 섞기(mix)·흔들림 맞추기(voltarget)는 각 전략의 주간 수익률로 계산한 근사치(1주 단위·세금은 각 전략 안에서 이미 반영).
// 회전(rotate)·고정(fixed)은 실제 엔진으로 정확히 계산.
const fs=require('fs'),path=require('path'),E=require('./engine.js'),ST=require('./strat.js');
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));
const SJ=JSON.parse(fs.readFileSync(path.join(__dirname,'strategies.json'),'utf8'));
const Q=JSON.parse(fs.readFileSync(path.join(__dirname,'research','ideas.json'),'utf8'));
const OUT=path.join(__dirname,'..','paper','research.json');
const res=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{results:[]};
const n=+(process.argv[2]||2);const T=D.dates;const F='2005-01-01',OOS='2016-01-01';
const base=SJ.strategies.find(x=>x.id===1).s;
const runId=(id,from)=>ST.run(D,{...SJ.strategies.find(x=>x.id===id).s,from});
const toRet=eq=>{const m=new Map(eq);return T.map((d,i)=>i>0&&m.has(d)&&m.has(T[i-1])?m.get(d)/m.get(T[i-1])-1:null)};
const fromRet=(r,from)=>{let v=1000;const eq=[];for(let i=0;i<T.length;i++){if(T[i]<from||r[i]===null&&!eq.length)continue;v*=1+(r[i]||0);eq.push([T[i],v])}return eq};
function eqFor(spec,from){
  if(spec.type==='rotate')return E.run(D,{...base,...spec.params,from}).eq;
  if(spec.type==='fixed')return E.runFixed(D,{...base,kind:'fixed',w:spec.w,rebalM:1,from}).eq;
  if(spec.type==='mix'){const rs=spec.ids.map(id=>toRet(runId(id,from).eq));return fromRet(T.map((d,i)=>rs.some(r=>r[i]===null)?null:rs.reduce((s,r)=>s+r[i],0)/rs.length),from)}
  if(spec.type==='voltarget'){const r=toRet(runId(spec.id,from).eq);const o=T.map(()=>null);for(let i=0;i<T.length;i++){if(r[i]===null)continue;const w=r.slice(Math.max(0,i-26),i).filter(x=>x!==null);if(w.length<26){o[i]=r[i];continue}const m=w.reduce((s,x)=>s+x,0)/w.length;const sd=Math.sqrt(w.reduce((s,x)=>s+(x-m)**2,0)/w.length)*Math.sqrt(52);o[i]=(sd>0?Math.min(1,spec.target/100/sd):1)*r[i]}return fromRet(o,from)}
  throw new Error('모르는 종류: '+spec.type)}
const sum=eq=>{const s=E.stats(eq);return {avg:+s.avg.toFixed(3),cagr:+s.cagr.toFixed(2),mdd:+s.mdd.toFixed(1),neg:+s.neg.toFixed(0)}};
const ref={full:sum(runId(1,F).eq),oos:sum(runId(1,OOS).eq)};
const done=new Set(res.results.map(r=>r.id));const todo=Q.ideas.filter(x=>!done.has(x.id)).slice(0,n);
if(!todo.length){console.log('대기열 비었음 (시험 '+res.results.length+'개 완료)');process.exit(0)}
for(const x of todo){const full=sum(eqFor(x.spec,F)),oos=sum(eqFor(x.spec,OOS));
  const better=full.avg>=ref.full.avg&&oos.avg>=ref.oos.avg&&full.mdd>=ref.full.mdd-3;
  const verdict=better?'1번보다 나음 (수익 비슷하거나 높고 하락 폭 비슷하거나 작음)':(full.mdd>ref.full.mdd+3&&full.avg>=ref.full.avg-0.1?'하락 폭은 줄었지만 수익은 비슷하거나 낮음':'1번보다 나쁨');
  res.results.push({id:x.id,name:x.name,why:x.why,spec:x.spec,approx:['mix','voltarget'].includes(x.spec.type),testedAt:new Date().toISOString(),dataUntil:T.at(-1),full,oos,ref,verdict});
  console.log(x.name+': 2005~ 월 '+full.avg+'% 낙폭 '+full.mdd+'% | 2016~ 월 '+oos.avg+'% → '+verdict)}
res.updated=new Date().toISOString();res.tested=res.results.length;res.waiting=Q.ideas.length-res.results.length;
res.note='시험한 아이디어가 많을수록 운 좋게 잘 나온 것이 섞일 가능성이 커진다. 좋은 결과도 가상계좌로 몇 달 확인한 뒤에 쓴다.';
fs.writeFileSync(OUT,JSON.stringify(res,null,1));
