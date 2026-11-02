// 전략 10개 가상계좌: 같은 날부터 각각 1,000만원(가상)으로 매주 실제 시세대로 사고판 기록
// 사용: node paper_multi.js  → ../paper/multi.json
const fs=require('fs'),path=require('path'),E=require('./engine.js');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const SJ=JSON.parse(fs.readFileSync(path.join(__dirname,'strategies.json'),'utf8'));
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));
const NM=k=>k&&cfg.assets[k]?cfg.assets[k].이름:k;
const from=SJ.from;
const list=SJ.strategies.map(x=>{const s={...x.s,from};const r=E.runAny(D,s);
  const value=r.eq.length?r.eq.at(-1)[1]:s.start;
  // 리허설: 같은 규칙을 1년 전, 3년 전부터 돌렸다면
  const reh=[['1년 전부터',1],['3년 전부터',3]].map(([n,y])=>{const d=new Date(D.dates.at(-1));d.setFullYear(d.getFullYear()-y);const rr=E.runAny(D,{...x.s,from:d.toISOString().slice(0,10)});return {name:n,ret:(rr.eq.at(-1)[1]/x.s.start-1)*100}});
  return {id:x.id,name:x.name,desc:x.desc,start:s.start,value,ret:(value/s.start-1)*100,weeks:r.eq.length,
    feeMan:r.feePaid,taxMan:r.taxPaid,
    holdings:r.sleeves.filter(z=>z.asset).map(z=>({kind:z.kind,asset:z.asset,name:NM(z.asset),shares:z.shares,price:z.price,valueMan:z.value})),
    cashMan:r.sleeves.reduce((a,z)=>a+z.cash,0),
    pending:r.pending.map(z=>({...z,name:NM(z.asset)})),
    log:r.log.map(z=>({week:z[0],kind:z[1],act:z[2],asset:z[3],name:NM(z[3]),price:z[4],why:z[5],shares:z[6]})),
    equity:r.eq.map(e=>[e[0],+e[1].toFixed(2)]),reh}});
const rank=list.slice().sort((a,b)=>b.value-a.value).map(x=>x.id);
const out={updated:new Date().toISOString(),dataUntil:D.dates.at(-1),from,strategies:list,rank};
fs.writeFileSync(path.join(__dirname,'..','paper','multi.json'),JSON.stringify(out));
console.log('전략 10개 가상계좌 '+D.dates.at(-1)+' 기준: '+rank.map(id=>{const x=list.find(z=>z.id===id);return x.id+'번 '+x.name+' '+(Math.abs(x.ret)<0.005?'0.00':(x.ret>0?'+':'')+x.ret.toFixed(2))+'%'}).join(' / '));
