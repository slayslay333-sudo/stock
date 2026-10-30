// 한국투자증권 오픈API 연결 (공식 저장소 koreainvestment/open-trading-api 기준, 2026-10 확인)
// 비밀값은 저장소에 넣지 않음: ~/.kis/kis.json 또는 환경변수 KIS_CONFIG 경로
// { "mode":"demo", "appkey":"...", "appsecret":"...", "cano":"8자리", "prdt":"01" }
const fs=require('fs'),path=require('path'),os=require('os');
const URLS={real:'https://openapi.koreainvestment.com:9443',demo:'https://openapivts.koreainvestment.com:29443'};
class KIS{
  constructor(c){this.c=c;this.base=c.baseUrl||URLS[c.mode];if(!this.base)throw new Error('mode는 demo 또는 real');
    this.tokenFile=c.tokenFile||path.join(os.homedir(),'.kis','token_'+c.mode+'.json');this.calls=[]}
  static load(p){p=p||process.env.KIS_CONFIG||path.join(os.homedir(),'.kis','kis.json');return new KIS(JSON.parse(fs.readFileSync(p,'utf8')))}
  tr(real){return this.c.mode==='demo'?'V'+real.slice(1):real}
  async token(){
    try{const t=JSON.parse(fs.readFileSync(this.tokenFile,'utf8'));if(new Date(t.exp.replace(' ','T')+'+09:00')-Date.now()>3600e3)return t.token}catch(e){}
    const res=await fetch(this.base+'/oauth2/tokenP',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:this.c.appkey,appsecret:this.c.appsecret})});
    const j=await res.json();if(!j.access_token)throw new Error('토큰 발급 실패: '+JSON.stringify(j));
    fs.mkdirSync(path.dirname(this.tokenFile),{recursive:true});fs.writeFileSync(this.tokenFile,JSON.stringify({token:j.access_token,exp:j.access_token_token_expired}),{mode:0o600});return j.access_token}
  async call(method,api,trId,params){
    const h={'content-type':'application/json; charset=utf-8',authorization:'Bearer '+await this.token(),appkey:this.c.appkey,appsecret:this.c.appsecret,tr_id:trId,custtype:'P',tr_cont:''};
    let url=this.base+api,opt={method,headers:h};
    if(method==='GET')url+='?'+new URLSearchParams(params);else opt.body=JSON.stringify(params);
    const res=await fetch(url,opt);const j=await res.json().catch(()=>({rt_cd:'-1',msg1:'응답 해석 실패 '+res.status}));
    this.calls.push({api,trId,status:res.status,rt_cd:j.rt_cd,msg:j.msg1});
    if(j.rt_cd!=='0')throw Object.assign(new Error((j.msg_cd||'')+' '+(j.msg1||'오류')),{kis:j,trId});return j}
  // 시세 (실전·모의 공통 HHDFS00000300). excd: NAS / NYS / AMS
  async price(excd,symb){const j=await this.call('GET','/uapi/overseas-price/v1/quotations/price','HHDFS00000300',{AUTH:'',EXCD:excd,SYMB:symb});return +j.output.last}
  // 잔고 (실전 TTTS3012R / 모의 VTTS3012R)
  async balance(excg){const j=await this.call('GET','/uapi/overseas-stock/v1/trading/inquire-balance',this.tr('TTTS3012R'),
      {CANO:this.c.cano,ACNT_PRDT_CD:this.c.prdt,OVRS_EXCG_CD:excg,TR_CRCY_CD:'USD',CTX_AREA_FK200:'',CTX_AREA_NK200:''});
    return (j.output1||[]).filter(x=>+x.ovrs_cblc_qty>0).map(x=>({symb:x.ovrs_pdno,qty:+x.ovrs_cblc_qty,sellable:+(x.ord_psbl_qty??x.ovrs_cblc_qty),avg:+x.pchs_avg_pric}))}
  // 매수 가능 금액 (실전 TTTS3007R / 모의 VTTS3007R)
  async buyable(excg,symb,price){const j=await this.call('GET','/uapi/overseas-stock/v1/trading/inquire-psamount',this.tr('TTTS3007R'),
      {CANO:this.c.cano,ACNT_PRDT_CD:this.c.prdt,OVRS_EXCG_CD:excg,OVRS_ORD_UNPR:String(price),ITEM_CD:symb});
    return {cash:+j.output.ord_psbl_frcr_amt,maxQty:+(j.output.max_ord_psbl_qty??j.output.ovrs_max_ord_psbl_qty??0)}}
  // 주문. 매수 실전 TTTT1002U / 모의 VTTT1002U. 매도 실전 TTTT1006U / 모의 VTTT1001U(공식 설명 기준; 실패 시 VTTT1006U 재시도)
  // 모의는 지정가(00)만 가능. 실전도 장 중에 지정가(00)로 넣음
  async order(side,excg,symb,qty,price,ordDvsn){
    const body={CANO:this.c.cano,ACNT_PRDT_CD:this.c.prdt,OVRS_EXCG_CD:excg,PDNO:symb,ORD_QTY:String(qty),OVRS_ORD_UNPR:price.toFixed(2),
      CTAC_TLNO:'',MGCO_APTM_ODNO:'',SLL_TYPE:side==='sell'?'00':'',ORD_SVR_DVSN_CD:'0',ORD_DVSN:ordDvsn};
    if(side==='buy')return (await this.call('POST','/uapi/overseas-stock/v1/trading/order',this.c.mode==='demo'?'VTTT1002U':'TTTT1002U',body)).output;
    if(this.c.mode==='real')return (await this.call('POST','/uapi/overseas-stock/v1/trading/order','TTTT1006U',body)).output;
    try{return (await this.call('POST','/uapi/overseas-stock/v1/trading/order','VTTT1001U',body)).output}
    catch(e){console.log('  모의 매도 VTTT1001U 실패('+e.message+') → VTTT1006U로 다시 시도');return (await this.call('POST','/uapi/overseas-stock/v1/trading/order','VTTT1006U',body)).output}}
}
module.exports={KIS,URLS};
