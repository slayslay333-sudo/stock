// 전략 여러 개 가상계좌: 정해진 날부터 각각 1,000만원(가상)으로 매주 실제 시세대로 사고판 기록
// 사용: node paper_multi.js  → ../paper/multi.json
// 재무 전략(12번)은 회사 자료 30개가 다 들어와야 계산하고, 그 전에는 "자료 받는 중"으로 표시한다.
const fs=require('fs'),path=require('path'),ST=require('./strat.js');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const SJ=JSON.parse(fs.readFileSync(path.join(__dirname,'strategies.json'),'utf8'));
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'data','weekly.json'),'utf8'));
const NM=k=>ST.name(cfg,k);
const stockStatus=ST.status(D);
const list=SJ.strategies.map(x=>{const from=x.from||SJ.from;
  const base={id:x.id,name:x.name,desc:x.desc,kind:x.s.kind||'rotate',from,start:x.s.start};
  if(x.s.kind==='picks'&&!stockStatus.ready)return {...base,waiting:'회사 자료 받는 중 '+stockStatus.have+'/'+stockStatus.total,value:x.s.start,ret:0,weeks:0,feeMan:0,taxMan:0,holdings:[],cashMan:x.s.start,pending:[],log:[],equity:[],reh:[]};
  const r=ST.run(D,{...x.s,from});
  const value=r.eq.length?r.eq.at(-1)[1]:x.s.start;
  // 리허설: 같은 규칙을 1년 전, 3년 전부터 돌렸다면
  const reh=[['1년 전부터',1],['3년 전부터',3]].map(([n,y])=>{const d=new Date(D.dates.at(-1));d.setFullYear(d.getFullYear()-y);const rr=ST.run(D,{...x.s,from:d.toISOString().slice(0,10)});return {name:n,ret:(rr.eq.at(-1)[1]/x.s.start-1)*100}});
  return {...base,value,ret:(value/x.s.start-1)*100,weeks:r.eq.length,dataUntil:r.eq.length?r.eq.at(-1)[0]:null,
    feeMan:r.feePaid,taxMan:r.taxPaid,
    holdings:r.sleeves.filter(z=>z.asset).map(z=>({kind:z.kind,asset:z.asset,name:NM(z.asset),shares:z.shares,price:z.price,valueMan:z.value})),
    cashMan:r.sleeves.reduce((a,z)=>a+z.cash,0),
    pending:r.pending.map(z=>({...z,name:NM(z.asset)})),
    pick:r.lastPick&&r.lastPick.list.length?{list:r.lastPick.list.map(s=>({asset:s,name:NM(s),...r.lastPick.why[s]}))}:null,
    log:r.log.map(z=>({week:z[0],kind:z[1],act:z[2],asset:z[3],name:NM(z[3]),price:z[4],why:z[5],shares:z[6]})),
    equity:r.eq.map(e=>[e[0],+e[1].toFixed(2)]),reh}});
const rank=list.slice().sort((a,b)=>b.value-a.value||a.id-b.id).map(x=>x.id);
const out={updated:new Date().toISOString(),dataUntil:D.dates.at(-1),from:SJ.from,stockStatus,strategies:list,rank};
fs.writeFileSync(path.join(__dirname,'..','paper','multi.json'),JSON.stringify(out));
console.log('전략 '+list.length+'개 가상계좌 '+D.dates.at(-1)+' 기준: '+rank.map(id=>{const x=list.find(z=>z.id===id);return x.id+'번 '+x.name+' '+(x.waiting?'('+x.waiting+')':(Math.abs(x.ret)<0.005?'0.00':(x.ret>0?'+':'')+x.ret.toFixed(2))+'%')}).join(' / '));
