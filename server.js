// Servidor do Gatinho Virtual: escuta a live do TikTok e repassa os presentes para a página.
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const L=require('tiktok-live-connector');
const Conn=L.TikTokLiveConnection||L.WebcastPushConnection;
const PORT=process.env.PORT||3000;

const srv=http.createServer((req,res)=>{
  if(req.url==='/health'){res.end('ok');return}
  fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{
    if(e){res.writeHead(500);return res.end('index.html não encontrado')}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(d)});
});
const wss=new WebSocketServer({server:srv,path:'/ws'});
const send=o=>{const s=JSON.stringify(o);wss.clients.forEach(c=>c.readyState===1&&c.send(s))};
let conn=null,cur='',last={event:'status',state:'off',text:'Digite seu @ do TikTok'};
const status=(state,text)=>{last={event:'status',state,text};send(last);console.log(text)};

async function start(user){
  user=String(user||'').replace(/^@/,'').trim();
  if(!user||(conn&&cur===user))return;
  if(conn){try{conn.disconnect()}catch(e){}conn=null}
  cur=user;status('wait','Conectando a @'+user+'…');
  const opt={};if(process.env.SIGN_API_KEY)opt.signApiKey=process.env.SIGN_API_KEY;
  const c=conn=new Conn(user,opt);
  c.on('gift',d=>{
    const gd=d.giftDetails||{},type=d.giftType??gd.giftType,end=d.repeatEnd===true||d.repeatEnd===1;
    if(type===1&&!end)return; // sequência em andamento: só conta no fim
    send({event:'gift',data:{giftName:d.giftName||gd.giftName,repeatCount:d.repeatCount||1,giftType:type,repeatEnd:true,
      nickname:d.nickname||(d.user&&d.user.nickname)||d.uniqueId||(d.user&&d.user.uniqueId)||'Alguém'}});
  });
  c.on('disconnected',()=>{if(conn!==c)return;status('off','Live desconectada. Tentando de novo…');
    setTimeout(()=>{if(conn===c){conn=null;start(user)}},5000)});
  try{await c.connect();status('on','Conectado à live de @'+user)}
  catch(e){status('off','Não consegui conectar: '+(e.message||e)+' (a live precisa estar aberta)');
    if(conn===c){conn=null;setTimeout(()=>start(user),8000)}}
}
wss.on('connection',ws=>{
  ws.send(JSON.stringify(last));
  ws.on('message',m=>{try{const j=JSON.parse(m);if(j.cmd==='connect')start(j.user)}catch(e){}});
});
srv.listen(PORT,()=>{console.log('Gatinho no ar na porta '+PORT);if(process.env.TIKTOK_USER)start(process.env.TIKTOK_USER)});
