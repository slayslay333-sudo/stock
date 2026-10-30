// 맥미니용: 알파 밴티지에서 주간 수정주가 4개를 직접 받아 raw 폴더에 저장 (하루 무료 한도 25번 중 4번 사용)
// 키: 환경변수 AV_KEY 또는 ~/.kis/alphavantage.txt
const fs=require('fs'),path=require('path'),os=require('os');
const key=(process.env.AV_KEY||(()=>{try{return fs.readFileSync(path.join(os.homedir(),'.kis','alphavantage.txt'),'utf8')}catch(e){return''}})()).trim();
if(!key){console.error('알파 밴티지 키가 없습니다 (~/.kis/alphavantage.txt)');process.exit(1)}
const base=process.env.AV_BASE||'https://www.alphavantage.co';
const out=process.argv[2]||path.join(__dirname,'raw');fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{for(const s of ['QQQ','SPY','TLT','GLD']){let txt='';
  for(let t=0;t<3;t++){const r=await fetch(`${base}/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${s}&datatype=csv&apikey=${encodeURIComponent(key)}`);txt=await r.text();
    if(txt.startsWith('timestamp,open,high,low,close,adjusted close'))break;
    console.log(s+' 받기 실패('+(t+1)+'번째): '+txt.slice(0,120).replace(/\s+/g,' '));txt='';await sleep(process.env.AV_RETRY_MS?+process.env.AV_RETRY_MS:65000)}
  if(!txt){console.error(s+' 시세를 받지 못했습니다');process.exit(2)}
  fs.writeFileSync(path.join(out,s+'.csv'),txt);console.log(s+' 받음 '+(txt.split('\n').length-1)+'주');await sleep(2500)}})().catch(e=>{console.error('오류: '+e.message);process.exit(3)});
