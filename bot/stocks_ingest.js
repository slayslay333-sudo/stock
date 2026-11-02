// 12번 전략용 회사 자료 정리: 알파 밴티지에서 받은 원본(주간 주가 CSV, 손익계산서 JSON, 재무상태표 JSON)을
// data/stocks/<종목>.json 에 필요한 칸만 줄여 저장한다.
// 사용: node stocks_ingest.js <종목> <원본파일> [<원본파일> ...]
//   원본파일은 CSV 그대로이거나, 도구 결과를 저장한 JSON({"result":"CSV..."} 또는 {"quarterlyReports":[...]})이어도 된다.
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'data','stocks');fs.mkdirSync(DIR,{recursive:true});
const list=JSON.parse(fs.readFileSync(path.join(__dirname,'stocks.json'),'utf8')).list.map(x=>x.sym);
const num=v=>v==null||v==='None'||v===''?null:(isFinite(+v)?+v:null);
function parsePrice(csv,sym){const lines=csv.trim().split(/\r?\n/);
  if(!/^timestamp,open,high,low,close,adjusted close/.test(lines[0]))throw new Error(sym+' 주가 형식이 다릅니다: '+lines[0].slice(0,60));
  const rows=[];for(const l of lines.slice(1)){const c=l.split(',');const close=+c[4],adj=+c[5];if(!(close>0&&adj>0&&+c[1]>0&&+c[3]>0))throw new Error(sym+' 이상한 값: '+l);const r=adj/close;rows.push([c[0],+(+c[1]*r).toFixed(4),+(+c[3]*r).toFixed(4),+adj.toFixed(4)])}
  rows.sort((a,b)=>a[0]<b[0]?-1:1);
  // 주중 분할로 시가만 분할 전 값인 주 고치기 (update_data.js 와 같은 규칙)
  const fixes=[];for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];const r=b[1]/a[3];
    if(r>1.25||r<0.8){const f=r>1?Math.round(r):1/Math.round(1/r);if(Math.abs(r/f-1)<0.15&&Math.abs(f-1)>0.4){b[1]=+(b[1]/f).toFixed(4);if(b[2]>Math.min(b[1],b[3])*1.001)b[2]=+(b[2]/f).toFixed(4);fixes.push(b[0])}}}
  for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(Math.abs(b[3]/a[3]-1)>0.6)throw new Error(sym+' 한 주에 60% 넘게 움직임(자료 오류 의심): '+b[0]);if(b[2]>Math.min(b[1],b[3])*1.001)throw new Error(sym+' 최저가가 시가·종가보다 높음: '+b[0])}
  return {rows,fixes}}
function ingest(sym,file){sym=sym.toUpperCase();if(!list.includes(sym))throw new Error(sym+' 은 stocks.json 명단에 없습니다');
  let txt=fs.readFileSync(file,'utf8').trim();let obj=null;
  if(txt.startsWith('{')){obj=JSON.parse(txt);if(typeof obj.result==='string'){txt=obj.result.trim();obj=txt.startsWith('{')?JSON.parse(txt):null}}
  if(obj&&(obj['Error Message']||obj.Information||obj.Note||obj.error))throw new Error(sym+' 원본이 오류 응답입니다: '+JSON.stringify(obj).slice(0,150));
  if(obj&&obj.symbol&&obj.symbol.toUpperCase()!==sym)throw new Error('파일의 종목('+obj.symbol+')이 '+sym+' 과 다릅니다');
  const fp=path.join(DIR,sym+'.json');const cur=fs.existsSync(fp)?JSON.parse(fs.readFileSync(fp,'utf8')):{sym};const now=new Date().toISOString();let what;
  if(!obj){const {rows,fixes}=parsePrice(txt,sym);if(rows.length<50)throw new Error(sym+' 주가 줄이 너무 적음');cur.price={updated:now,rows};what='주가 '+rows.length+'주 ('+rows[0][0]+'~'+rows.at(-1)[0]+')'+(fixes.length?' 분할 보정 '+fixes.join(','):'')}
  else if(Array.isArray(obj.quarterlyReports)&&obj.quarterlyReports.length&&'totalRevenue' in obj.quarterlyReports[0]){
    const q=obj.quarterlyReports.map(r=>[r.fiscalDateEnding,num(r.totalRevenue),num(r.operatingIncome),num(r.netIncome)]).sort((a,b)=>a[0]<b[0]?-1:1);
    cur.inc={updated:now,q};what='손익계산서 '+q.length+'분기 ('+q[0][0]+'~'+q.at(-1)[0]+')'}
  else if(Array.isArray(obj.quarterlyReports)&&obj.quarterlyReports.length&&'totalAssets' in obj.quarterlyReports[0]){
    const q=obj.quarterlyReports.map(r=>[r.fiscalDateEnding,num(r.totalAssets),num(r.totalLiabilities),num(r.totalShareholderEquity),num(r.commonStockSharesOutstanding)]).sort((a,b)=>a[0]<b[0]?-1:1);
    cur.bal={updated:now,q};what='재무상태표 '+q.length+'분기 ('+q[0][0]+'~'+q.at(-1)[0]+')'}
  else throw new Error(sym+' 무슨 자료인지 알 수 없습니다');
  fs.writeFileSync(fp,JSON.stringify(cur));console.log(sym+' 저장: '+what)}
if(require.main===module){const [sym,...files]=process.argv.slice(2);if(!sym||!files.length){console.error('사용: node stocks_ingest.js <종목> <원본파일>...');process.exit(1)}
  let bad=0;for(const f of files){try{ingest(sym,f)}catch(e){console.error('실패: '+e.message);bad++}}process.exit(bad?1:0)}
module.exports={ingest,parsePrice};
