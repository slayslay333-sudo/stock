// 전략 실행 공용 (노드 전용): 뉴스 점수 붙이기, 재무 전략(picks) 처리, 회사 자료 준비 상태
const fs=require('fs'),path=require('path'),E=require('./engine.js'),NEWS=require('./news.js'),P=require('./picks.js');
const STOCKS=JSON.parse(fs.readFileSync(path.join(__dirname,'stocks.json'),'utf8'));
const SYMS=STOCKS.list.map(x=>x.sym);
const NAME=Object.fromEntries(STOCKS.list.map(x=>[x.sym,x.이름]));
let cache=null;
function stocks(D){if(!cache||cache.D!==D)cache={D,S:P.load(D,SYMS)};return cache.S}
// 회사 자료가 모두 있는지 (12번을 돌려도 되는지)
function status(D){const S=stocks(D);const have=SYMS.filter(s=>S[s]&&S[s].c.some(v=>v>0)&&S[s].inc.length&&S[s].bal.length);
  return {ready:have.length===SYMS.length,have:have.length,total:SYMS.length,upTo:have.length?D.dates[P.readyIndex(D,S,SYMS)]:null}}
// 전략 하나 실행. 재무 전략은 회사 자료가 다 들어온 주까지만 자른 자료로 계산.
function run(D,s){
  if(s.kind==='picks'){const S=stocks(D);const k=P.readyIndex(D,S,SYMS);
    const Dk=k===D.dates.length-1?D:{dates:D.dates.slice(0,k+1),assets:D.assets};
    const Sk=k===D.dates.length-1?S:Object.fromEntries(Object.entries(S).map(([a,v])=>[a,{...v,o:v.o.slice(0,k+1),l:v.l.slice(0,k+1),c:v.c.slice(0,k+1)}]));
    return P.run(Dk,{...s,universe:SYMS},Sk)}
  return E.runAny(D,NEWS.attach(s))}
const name=(cfg,k)=>k?(cfg.assets[k]?cfg.assets[k].이름:NAME[k]||k):k;
module.exports={run,status,stocks,SYMS,NAME,name};
