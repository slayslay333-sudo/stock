// 현황 정리: 자료가 언제까지 들어왔는지, 예약 작업이 잘 돌았는지, 점검 결과, 단타·연구 진행을 ../paper/status.json 에 기록
// 사용: node status.js [예약작업상태.json]
//   예약작업상태.json = [{"name":"...","status":"성공|실패|...","lastRun":"ISO 시각"}]  (클로드가 예약 작업 목록에서 옮겨 적은 것)
const fs=require('fs'),path=require('path'),cp=require('child_process');
const rd=(p,d)=>{try{return JSON.parse(fs.readFileSync(path.join(__dirname,p),'utf8'))}catch(e){return d}};
const D=rd('data/weekly.json',{dates:[]}),N=rd('data/news.json',{weeks:[]}),M=rd('../paper/multi.json',{}),RS=rd('../paper/research.json',{results:[]}),DT=rd('data/daytrade.json',null);
let trig=[];if(process.argv[2]){try{trig=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))}catch(e){}}
const run=c=>{try{return {ok:true,out:cp.execSync(c,{cwd:__dirname,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').pop()}}catch(e){return {ok:false,out:String(e.stdout||e.message).trim().split('\n').filter(l=>l.startsWith('실패')||l.startsWith('문제')).join(' / ').slice(0,300)}}};
const v=run('node validate.js'),k=run('node test_kis.js'),dt=run('node daytrade.js --check');
const age=d=>d?Math.round((Date.now()-new Date(d))/864e5):null;
const issues=[];
if(!v.ok)issues.push('실수 방지 점검 실패: '+v.out);if(!k.ok)issues.push('한투 연결 시험 실패: '+k.out);if(!dt.ok)issues.push('단타 기록 점검 실패: '+dt.out);
const last=D.dates.at(-1);if(age(last)>9)issues.push('주간 시세가 '+age(last)+'일 전 것 ('+last+')');
for(const t of trig)if(t.status&&!/성공/.test(t.status))issues.push('예약 작업 "'+t.name+'" 마지막 실행: '+t.status);
const best=RS.results.filter(r=>r.verdict&&r.verdict.startsWith('1번보다 나음')).sort((a,b)=>b.oos.avg-a.oos.avg).slice(0,3).map(r=>({name:r.name,full:r.full,oos:r.oos,approx:r.approx}));
const st={updated:new Date().toISOString(),
  data:{weeklyUntil:last,weeklyUpdated:D.updated||null,newsWeeks:N.weeks.length,lastNews:N.weeks.at(-1)||null,stocks:M.stockStatus||null},
  checks:{validate:v,kis:k,daytrade:dt},triggers:trig,
  daytrade:DT?{valueMan:DT.valueMan,trades:DT.log.length,holding:DT.shares,lastQuote:DT.quotes.at(-1)||null}:null,
  research:{tested:RS.results.length,waiting:RS.waiting??null,best},
  multi:M.strategies?M.rank.slice(0,3).map(id=>{const x=M.strategies.find(z=>z.id===id);return {id,name:x.name,ret:x.ret}}):[],
  issues};
fs.writeFileSync(path.join(__dirname,'..','paper','status.json'),JSON.stringify(st,null,1));
console.log('현황 '+(issues.length?'문제 '+issues.length+'개: '+issues.join(' | '):'이상 없음')+' · 주간 시세 '+last+' · 회사 자료 '+(M.stockStatus?M.stockStatus.have+'/'+M.stockStatus.total:'-')+' · 단타 '+(DT?DT.valueMan.toFixed(1)+'만원':'시작 전')+' · 연구 '+RS.results.length+'개');
