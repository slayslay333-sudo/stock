// 알파 밴티지 주간 수정주가 CSV (config.json 의 assets 종목 전부) → data/weekly.json
// 사용: node update_data.js raw/QQQ.csv raw/SPY.csv ... [--now 2026-10-31T09:00:00Z]   또는  node update_data.js raw/ (폴더)
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2);const ni=args.indexOf('--now');const now=ni>=0?new Date(args.splice(ni,2)[1]):new Date();
const want=Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8')).assets);const files={};
const list=args.length===1&&fs.statSync(args[0]).isDirectory()?fs.readdirSync(args[0]).map(f=>path.join(args[0],f)):args;
for(const f of list){const b=path.basename(f).toUpperCase().replace(/\.CSV$/,'');if(want.includes(b))files[b]=f}
for(const k of want)if(!files[k])throw new Error(k+' 파일이 없습니다');
const data={};
for(const k of want){const lines=fs.readFileSync(files[k],'utf8').trim().split(/\r?\n/);
  if(!/^timestamp,open,high,low,close,adjusted close/.test(lines[0]))throw new Error(k+' 형식이 다릅니다: '+lines[0]);
  const d={};for(const l of lines.slice(1)){const c=l.split(',');const close=+c[4],adj=+c[5],r=adj/close;
    if(!(close>0&&adj>0&&+c[1]>0&&+c[3]>0))throw new Error(k+' 이상한 값: '+l);d[c[0]]=[+(+c[1]*r).toFixed(4),+(+c[3]*r).toFixed(4),+adj.toFixed(4)]}
  data[k]=d}
// 주식 분할이 주중에 있으면 그 주 시가만 분할 전 가격으로 남는다 (예: 기술 업종 2025년 12월).
// 시가가 지난주 종가와 25% 넘게 벌어지고 그 차이가 2배·3배 같은 정수배에 가까우면 분할로 보고 시가를 나눈다.
const splitFix=[];
for(const k of want){const ks=Object.keys(data[k]).sort();for(let i=1;i<ks.length;i++){const a=data[k][ks[i-1]],b=data[k][ks[i]];const r=b[0]/a[2];
  if(r>1.25||r<0.8){const f=r>1?Math.round(r):1/Math.round(1/r);if(Math.abs(r/f-1)<0.15&&Math.abs(f-1)>0.4){b[0]=+(b[0]/f).toFixed(4);if(b[1]>Math.min(b[0],b[2])*1.001)b[1]=+(b[1]/f).toFixed(4);splitFix.push(k+' '+ks[i]+' ÷'+(f>=1?f:'1/'+Math.round(1/f)))}}}}
if(splitFix.length)console.log('분할 주 시가 고침: '+splitFix.join(', '));
let dates=Object.keys(data.QQQ).filter(t=>want.every(k=>data[k][t])).sort();
// 미국 동부 시간으로 이번 주가 아직 안 끝났으면 마지막 주는 뺀다 (금요일 16:30 이후면 완성)
const et=new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
const last=dates.at(-1);const lastD=new Date(last+'T00:00:00');
const fri=new Date(lastD);fri.setDate(lastD.getDate()+((5-lastD.getDay()+7)%7));fri.setHours(16,30,0,0);
let dropped=null;if(et<fri){dropped=dates.pop()}
// 점검
for(let i=1;i<dates.length;i++){const gap=(new Date(dates[i])-new Date(dates[i-1]))/864e5;if(gap>10)throw new Error('주간 자료 빈 곳: '+dates[i-1]+' → '+dates[i])}
for(const k of want)for(let i=1;i<dates.length;i++){const a=data[k][dates[i-1]][2],b=data[k][dates[i]][2];if(Math.abs(b/a-1)>0.35)throw new Error(k+' 한 주에 35% 넘게 움직임(자료 오류 의심): '+dates[i])}
for(const k of want)for(let i=1;i<dates.length;i++){const a=data[k][dates[i-1]],b=data[k][dates[i]];if(Math.abs(b[0]/a[2]-1)>0.35)throw new Error(k+' 시가가 지난주 종가와 35% 넘게 다름(자료 오류 의심): '+dates[i]);if(b[1]>Math.min(b[0],b[2])*1.001)throw new Error(k+' 최저가가 시가·종가보다 높음: '+dates[i])}
const out={updated:now.toISOString(),dates,assets:Object.fromEntries(want.map(k=>[k,dates.map(t=>data[k][t])]))};
fs.writeFileSync(path.join(__dirname,'data','weekly.json'),JSON.stringify(out));
console.log('저장:',dates.length,'주',dates[0],'~',dates.at(-1),dropped?('(아직 안 끝난 주 '+dropped+' 제외)'):'');
