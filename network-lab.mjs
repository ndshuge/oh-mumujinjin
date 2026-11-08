/** Privacy-conscious network evidence collector for Mainland mobile users.
 * Keeps only boolean outcomes; does not include tokens, private URLs or raw errors.
 */
export function summarizeConnectivity(samples,{cloudflareOk=null}={}){
  if(!Array.isArray(samples)||!samples.length){
    return {category:'unknown',successCount:0,message:'请先运行测试。'};
  }
  const successCount=samples.filter(s=>s.httpsOk===true&&s.websocketOk===true).length;
  const allHealthy=successCount===samples.length;
  const allHttpsFailed=samples.every(s=>!s.httpsOk);
  const httpsPass=samples.some(s=>s.httpsOk);
  const anyWsFail=samples.some(s=>!s.websocketOk);
  const mixedHttp=samples.some(s=>s.httpsOk)&&samples.some(s=>!s.httpsOk);
  const mixedWs=samples.some(s=>s.websocketOk)&&samples.some(s=>!s.websocketOk);
  let category,message;
  if(allHealthy){
    category='healthy';
    message='本设备连续测试中 Supabase HTTPS 与 WebSocket 都正常，可以尝试创建房间。此结果仅代表本次测试网络。';
  }else if(mixedHttp||mixedWs||successCount>0){
    category='intermittent';
    message='检测到间歇性连接故障：Supabase 连接时好时坏。可能是移动数据网络、运营商 DNS 或路由波动。请在相同设备上用 Wi-Fi 再测试对比。';
  }else if(allHttpsFailed){
    category='offline';
    message='当前设备无法通过 HTTPS 访问 Supabase。即使网页能打开，也不能联机。请切换 Wi-Fi 对照测试；目前缺乏证据判断是否由云端服务造成。';
  }else if(httpsPass&&anyWsFail){
    category='websocket';
    message='Supabase HTTPS 可访问，但 WebSocket 实时连接失败。需要检查此网络对 WebSocket 的支持；棋局不能正常实时同步。';
  }else{
    category='unknown';
    message='网络测试结果不完整，需要重新检测。';
  }
  if(cloudflareOk===true){
    message+=' Cloudflare 备用入口当前可访问，但不代表双方 WebSocket 一定畅通。';
  }else if(cloudflareOk===false){
    message+=' Cloudflare 备用入口也未通过本次 HTTPS 检测。';
  }
  return {category,successCount,message};
}
export async function runProbeSeries({probe,count=3,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),intervalMs=650,onResult=()=>{}}={}){
  if(typeof probe!=='function')throw Error('Missing probe');
  const rounds=Math.max(1,Math.min(5,Math.trunc(count)||3));
  const rows=[];
  for(let i=0;i<rounds;i++){
    const start=Date.now();
    let httpsOk=false,websocketOk=false;
    try{
      const response=await probe();
      httpsOk=response?.httpsOk===true;
      websocketOk=response?.websocketOk===true;
    }catch(_){}
    const row={round:i+1,httpsOk,websocketOk,ok:httpsOk&&websocketOk,elapsedMs:Date.now()-start};
    rows.push(row);
    onResult({...row});
    if(i<rounds-1)await pause(intervalMs);
  }
  return rows;
}
