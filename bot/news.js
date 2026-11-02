// 뉴스 점수 기록(data/news.json) 읽기·점검. 11번 전략(뉴스 거름망)이 씀.
// 한 주에 하나: {week:"2026-10-30"(그 주 자료 날짜), score:-2~2 정수, summary, sources:[{title,url}], scoredAt}
const fs=require('fs'),path=require('path');
const FILE=path.join(__dirname,'data','news.json');
function load(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){return {weeks:[]}}}
function map(){const m={};for(const w of load().weeks)m[w.week]=w.score;return m}
function check(dates){const errs=[];const N=load();const seen=new Set();
  for(const w of N.weeks){if(!Number.isInteger(w.score)||w.score<-2||w.score>2)errs.push(w.week+' 점수가 -2~2 정수가 아님');
    if(!dates.includes(w.week))errs.push(w.week+' 자료에 없는 주');if(seen.has(w.week))errs.push(w.week+' 같은 주가 두 번');seen.add(w.week);
    if(!w.summary||!(w.sources||[]).length)errs.push(w.week+' 이유나 출처가 없음')}
  return errs}
// 전략 설정에 뉴스 점수를 붙임
function attach(s){return s.useNews?{...s,news:map()}:s}
module.exports={FILE,load,map,check,attach};
