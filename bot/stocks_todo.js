// 오늘 받아야 할 회사 자료 목록 (무료 한도 안에서). 한 줄에 "종목 종류" (종류: price / income / balance)
// 우선순위: 없는 주가 → 없는 손익 → 없는 재무상태 → 지난주 것까지 안 들어온 주가(12번이 지금 가진 종목 먼저) → 20일 넘은 재무 자료(오래된 것부터)
// 사용: node stocks_todo.js [한도=22]
const fs=require('fs'),path=require('path');
const budget=+(process.argv[2]||22);
const list=JSON.parse(fs.readFileSync(path.join(__dirname,'stocks.json'),'utf8')).list.map(x=>x.sym);
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));const want=D.dates.at(-1);
const st=s=>{try{return JSON.parse(fs.readFileSync(path.join(__dirname,'data','stocks',s+'.json'),'utf8'))}catch(e){return {}}};
let held=[];try{const m=JSON.parse(fs.readFileSync(path.join(__dirname,'..','paper','multi.json'),'utf8'));const x=m.strategies.find(z=>z.kind==='picks'||(z.holdings||[]).some(h=>list.includes(h.asset)));if(x)held=x.holdings.map(h=>h.asset)}catch(e){}
const S=Object.fromEntries(list.map(s=>[s,st(s)]));const age=u=>u?(Date.now()-new Date(u))/864e5:1e9;
const out=[];const add=(s,k)=>{if(!out.some(x=>x[0]===s&&x[1]===k))out.push([s,k])};
for(const s of list)if(!S[s].price)add(s,'price');
for(const s of list)if(!S[s].inc)add(s,'income');
for(const s of list)if(!S[s].bal)add(s,'balance');
const stale=list.filter(s=>S[s].price&&!S[s].price.rows.some(r=>r[0]===want)).sort((a,b)=>(held.includes(b)-held.includes(a)));
for(const s of stale)add(s,'price');
const f=[];for(const s of list){if(S[s].inc&&age(S[s].inc.updated)>20)f.push([s,'income',age(S[s].inc.updated)]);if(S[s].bal&&age(S[s].bal.updated)>20)f.push([s,'balance',age(S[s].bal.updated)])}
f.sort((a,b)=>b[2]-a[2]).forEach(x=>add(x[0],x[1]));
const done=list.filter(s=>S[s].price&&S[s].inc&&S[s].bal&&S[s].price.rows.some(r=>r[0]===want)).length;
console.error('기준 주 '+want+' · 자료가 다 맞는 회사 '+done+'/'+list.length+' · 남은 할 일 '+out.length+'개 중 오늘 '+Math.min(budget,out.length)+'개');
for(const [s,k] of out.slice(0,budget))console.log(s+' '+k);
