// 가상계좌(paper/state.json)의 '목표 보유'를 한투 계좌에 맞춰 주문
// 기본은 확인만(주문 안 냄). 실제 주문: node kis_trade.js --live
// 실행 시점: 매주 화요일 0시 5분(한국 시간) = 미국 월요일 장 중.
const fs=require('fs'),path=require('path');const {KIS}=require('./kis.js');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
async function main(opt={}){
  const live=opt.live??process.argv.includes('--live');
  const st=opt.state||JSON.parse(fs.readFileSync(path.join(__dirname,'..','paper','state.json'),'utf8'));
  const kis=opt.kis||KIS.load();const A=cfg.assets;const out=[];const say=m=>{out.push(m);console.log(m)};
  say(`[${kis.c.mode==='demo'?'모의':'실전'}] ${live?'실제 주문':'확인만 (주문 안 냄)'} · 목표 보유: ${st.targetName} (자료 ${st.dataUntil})`);
  const excgs=[...new Set(Object.values(A).map(a=>a.주문거래소))];let held=[];
  for(const e of excgs){for(const h of await kis.balance(e))if(A[h.symb])held.push({...h,excg:e})}
  say('현재 잔고: '+(held.map(h=>h.symb+' '+h.qty+'주').join(', ')||'없음'));
  const plan=[];
  for(const h of held)if(h.symb!==st.target){const px=await kis.price(A[h.symb].시세거래소,h.symb);plan.push({side:'sell',symb:h.symb,qty:h.sellable,price:px})}
  if(st.target&&!held.some(h=>h.symb===st.target)){
    const px=await kis.price(A[st.target].시세거래소,st.target);const lim=+(px*1.01).toFixed(2);
    const b=await kis.buyable(A[st.target].주문거래소,st.target,lim);
    const sellCash=plan.filter(x=>x.side==='sell').reduce((s,x)=>s+x.qty*x.price*(1-0.0025),0);
    const qty=Math.floor((b.cash+sellCash)/(lim*1.0025));
    if(qty>0)plan.push({side:'buy',symb:st.target,qty,price:lim,note:sellCash>0?'매도 대금 포함 계산 — 매도 체결 뒤 주문':''});
    else say('살 돈이 부족합니다 (주문 가능 '+b.cash.toFixed(2)+'달러)')}
  if(!plan.length){say('주문할 것 없음 — 이미 목표대로 보유 중');return {out,plan,kis}}
  // 미국 장 중에 실행: 모의·실전 모두 지정가(00). 매수는 현재가+1%, 매도는 현재가-1%로 넣어 바로 체결되게 함
  for(const x of plan){const dv='00';
    const price=x.side==='sell'?+(x.price*0.99).toFixed(2):x.price;
    say(`${x.side==='buy'?'매수':'매도'} ${x.symb} ${x.qty}주 @ ${price} (지정가) ${x.note||''}`);
    if(live){try{const r=await kis.order(x.side,A[x.symb].주문거래소,x.symb,x.qty,price,dv);say('  접수 번호 '+(r&&r.ODNO))}catch(e){say('  주문 실패: '+e.message);x.error=e.message}}}
  return {out,plan,kis}}
if(require.main===module)main().catch(e=>{console.error('오류:',e.message);process.exit(1)});
module.exports={main};
