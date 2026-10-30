// 알파 밴티지 주간 수정주가 CSV 4개 → data/weekly.json
// 사용: node update_data.js QQQ.csv SPY.csv TLT.csv GLD.csv [--now 2026-10-31T09:00:00Z]
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2);const ni=args.indexOf('--now');const now=ni>=0?new Date(args.splice(ni,2)[1]):new Date();
const want=['QQQ','SPY','TLT','GLD'];const files={};
for(const f of args){const k=want.find(s=>path.basename(f).toUpperCase().startsWith(s));if(k)files[k]=f}
for(const k of want)if(!files[k])throw new Error(k+' 파일이 없습니다');
const data={};
for(const k of want){const lines=fs.readFileSync(files[k],'utf8').trim().split(/\r?\n/);
  if(!/^timestamp,open,high,low,close,adjusted close/.test(lines[0]))throw new Error(k+' 형식이 다릅니다: '+lines[0]);
  const d={};for(const l of lines.slice(1)){const c=l.split(',');const close=+c[4],adj=+c[5],r=adj/close;
    if(!(close>0&&adj>0&&+c[1]>0&&+c[3]>0))throw new Error(k+' 이상한 값: '+l);d[c[0]]=[+(+c[1]*r).toFixed(4),+(+c[3]*r).toFixed(4),+adj.toFixed(4)]}
  data[k]=d}
let dates=Object.keys(data.QQQ).filter(t=>want.every(k=>data[k][t])).sort();
// 미국 동부 시간으로 이번 주가 아직 안 끝났으면 마지막 주는 뺀다 (금요일 16:30 이후면 완성)
const et=new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
const last=dates.at(-1);const lastD=new Date(last+'T00:00:00');
const fri=new Date(lastD);fri.setDate(lastD.getDate()+((5-lastD.getDay()+7)%7));fri.setHours(16,30,0,0);
let dropped=null;if(et<fri){dropped=dates.pop()}
// 점검
for(let i=1;i<dates.length;i++){const gap=(new Date(dates[i])-new Date(dates[i-1]))/864e5;if(gap>10)throw new Error('주간 자료 빈 곳: '+dates[i-1]+' → '+dates[i])}
for(const k of want)for(let i=1;i<dates.length;i++){const a=data[k][dates[i-1]][2],b=data[k][dates[i]][2];if(Math.abs(b/a-1)>0.35)throw new Error(k+' 한 주에 35% 넘게 움직임(자료 오류 의심): '+dates[i])}
const out={updated:now.toISOString(),dates,assets:Object.fromEntries(want.map(k=>[k,dates.map(t=>data[k][t])]))};
fs.writeFileSync(path.join(__dirname,'data','weekly.json'),JSON.stringify(out));
console.log('저장:',dates.length,'주',dates[0],'~',dates.at(-1),dropped?('(아직 안 끝난 주 '+dropped+' 제외)'):'');
