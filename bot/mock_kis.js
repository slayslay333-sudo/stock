// 가짜 한투 서버: 공식 형식대로 요청이 오는지 엄격하게 검사하고 계좌를 흉내 냄 (시험 전용)
const http=require('http');
function start({mode='demo',cash=7400,prices={QQQ:715.34,SPY:681.2,TLT:88.1,GLD:245.6},rejectDemoSell1001=false}={}){
  const acct={cash,pos:{}},seen=[];let tokens=0;
  const EX={QQQ:['NASD','NAS'],SPY:['AMEX','AMS'],TLT:['NASD','NAS'],GLD:['AMEX','AMS']};
  const err=(res,code,msg)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({rt_cd:'1',msg_cd:code,msg1:msg}))};
  const okj=(res,o)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({rt_cd:'0',msg_cd:'OK',msg1:'정상',...o}))};
  const srv=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{
    const u=new URL(req.url,'http://x');const q=Object.fromEntries(u.searchParams);const body=b?JSON.parse(b):{};const h=req.headers;
    seen.push({path:u.pathname,tr:h.tr_id,q,body});
    if(u.pathname==='/oauth2/tokenP'){if(body.grant_type!=='client_credentials'||!body.appkey||!body.appsecret)return err(res,'EGW','토큰 요청 형식 오류');tokens++;
      return okj(res,{access_token:'tok'+tokens,access_token_token_expired:'2099-01-01 00:00:00',token_type:'Bearer'})}
    if(!/^Bearer tok\d+$/.test(h.authorization||'')||!h.appkey||!h.appsecret||h.custtype!=='P')return err(res,'EGW00123','인증 헤더 오류');
    const V=mode==='demo';
    if(u.pathname==='/uapi/overseas-price/v1/quotations/price'){if(h.tr_id!=='HHDFS00000300')return err(res,'TR','시세 tr_id 오류');
      if(!EX[q.SYMB]||EX[q.SYMB][1]!==q.EXCD)return err(res,'EX','시세 거래소 코드 오류 '+q.EXCD+' '+q.SYMB);return okj(res,{output:{last:String(prices[q.SYMB])}})}
    if(u.pathname==='/uapi/overseas-stock/v1/trading/inquire-balance'){if(h.tr_id!==(V?'VTTS3012R':'TTTS3012R'))return err(res,'TR','잔고 tr_id 오류 '+h.tr_id);
      if(!/^\d{8}$/.test(q.CANO)||!/^\d{2}$/.test(q.ACNT_PRDT_CD))return err(res,'AC','계좌번호 형식');
      return okj(res,{output1:Object.entries(acct.pos).filter(([s,n])=>n>0&&EX[s][0]===q.OVRS_EXCG_CD).map(([s,n])=>({ovrs_pdno:s,ovrs_cblc_qty:String(n),ord_psbl_qty:String(n),pchs_avg_pric:'0'})),output2:{}})}
    if(u.pathname==='/uapi/overseas-stock/v1/trading/inquire-psamount'){if(h.tr_id!==(V?'VTTS3007R':'TTTS3007R'))return err(res,'TR','매수가능 tr_id 오류');
      return okj(res,{output:{ord_psbl_frcr_amt:acct.cash.toFixed(2),max_ord_psbl_qty:String(Math.floor(acct.cash/+q.OVRS_ORD_UNPR))}})}
    if(u.pathname==='/uapi/overseas-stock/v1/trading/order'){
      const buy=h.tr_id===(V?'VTTT1002U':'TTTT1002U'),sell=V?(h.tr_id==='VTTT1001U'||h.tr_id==='VTTT1006U'):h.tr_id==='TTTT1006U';
      if(!buy&&!sell)return err(res,'TR','주문 tr_id 오류 '+h.tr_id);
      if(sell&&V&&h.tr_id==='VTTT1001U'&&rejectDemoSell1001)return err(res,'TR','(시험) VTTT1001U 거절');
      const need=['CANO','ACNT_PRDT_CD','OVRS_EXCG_CD','PDNO','ORD_QTY','OVRS_ORD_UNPR','CTAC_TLNO','MGCO_APTM_ODNO','SLL_TYPE','ORD_SVR_DVSN_CD','ORD_DVSN'];
      for(const k of need)if(!(k in body))return err(res,'BD','주문 항목 누락 '+k);
      if(EX[body.PDNO][0]!==body.OVRS_EXCG_CD)return err(res,'EX','주문 거래소 코드 오류');
      if(V&&body.ORD_DVSN!=='00')return err(res,'DV','모의는 지정가(00)만');
      if(!V&&buy&&!['00','32','34'].includes(body.ORD_DVSN))return err(res,'DV','실전 매수 주문구분 오류');
      if(buy&&body.SLL_TYPE!=='')return err(res,'SL','매수는 SLL_TYPE 빈칸');if(sell&&body.SLL_TYPE!=='00')return err(res,'SL','매도는 SLL_TYPE 00');
      const n=+body.ORD_QTY,px=+body.OVRS_ORD_UNPR;if(!Number.isInteger(n)||n<=0)return err(res,'QT','수량 오류');
      if(buy){const fill=Math.min(px,prices[body.PDNO]);const cost=n*fill*1.0025;if(cost>acct.cash+1e-6)return err(res,'CA','주문가능금액 초과');acct.cash-=cost;acct.pos[body.PDNO]=(acct.pos[body.PDNO]||0)+n}
      else{if((acct.pos[body.PDNO]||0)<n)return err(res,'QT','보유수량 초과');acct.pos[body.PDNO]-=n;acct.cash+=n*Math.max(px,prices[body.PDNO]*0)*(1-0.0025-0.0000206)}
      return okj(res,{output:{KRX_FWDG_ORD_ORGNO:'01790',ODNO:String(1e7+seen.length),ORD_TMD:'093000'}})}
    err(res,'404','없는 주소 '+u.pathname)})});
  return new Promise(r=>srv.listen(0,()=>r({srv,acct,seen,url:'http://127.0.0.1:'+srv.address().port,prices,tokens:()=>tokens})))}
module.exports={start};
