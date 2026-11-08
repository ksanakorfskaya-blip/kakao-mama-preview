"use strict";
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const {Pool} = require("pg");
const {rateLimit} = require("express-rate-limit");

const must = name => {
  const value=process.env[name];
  if(!value) throw new Error("Missing required variable: "+name);
  return value;
};
const ORIGIN=must("PUBLIC_ORIGIN").replace(/\/$/,"");
const URL_ORIGIN=new URL(ORIGIN);
if(URL_ORIGIN.protocol!=="https:" && process.env.NODE_ENV!=="development") throw new Error("PUBLIC_ORIGIN must be https");
const config={
  databaseUrl:must("DATABASE_URL"),
  smtpHost:must("SMTP_HOST"),
  smtpPort:Number(process.env.SMTP_PORT||465),
  smtpSecure:process.env.SMTP_SECURE!=="false",
  smtpUser:must("SMTP_USER"),
  smtpPassword:must("SMTP_PASSWORD"),
  from:must("MAIL_FROM")
};
const ssl=process.env.DB_SSL==="1" ? {
  rejectUnauthorized:true,
  ca:process.env.DB_CA
    ? process.env.DB_CA.replace(/\\n/g,"\n")
    : fs.readFileSync(path.join(__dirname,"ca.crt"),"utf8")
} : false;
// node-postgres lets SSL query params override the explicit ssl object.
// Strip SSL-specific URL params so the verified Timeweb CA is always applied.
// Never log the database URL: it contains credentials.
const databaseConnectionUrl=new URL(config.databaseUrl);
const sslUrlParameters=["sslmode","sslrootcert","sslcert","sslkey","ssl","uselibpqcompat"];
const removedSslParameters=sslUrlParameters.filter(name=>databaseConnectionUrl.searchParams.has(name));
for(const name of removedSslParameters)databaseConnectionUrl.searchParams.delete(name);
if(removedSslParameters.length)console.log("PostgreSQL SSL URL options handled by the trusted server SSL config:",removedSslParameters.join(","));
const pool=new Pool({connectionString:databaseConnectionUrl.toString(),ssl,max:5,connectionTimeoutMillis:10000});
const mailer=nodemailer.createTransport({
  host:config.smtpHost,port:config.smtpPort,secure:config.smtpSecure,
  auth:{user:config.smtpUser,pass:config.smtpPassword}
});
const app=express();
app.set("trust proxy",1);
app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","no-referrer");
  res.set("X-Frame-Options","DENY");
  res.set("Cache-Control","no-store");
  next();
});
app.use("/api",express.json({limit:"2mb",type:"application/json"}));
app.use("/api",(req,res,next)=>{
  if(!["GET","HEAD","OPTIONS"].includes(req.method)){
    const origin=req.get("origin");
    if(origin && origin!==URL_ORIGIN.origin) return res.status(403).json({error:"Недопустимый источник запроса"});
    if(req.get("content-type")?.split(";")[0].trim()!=="application/json") return res.status(415).json({error:"Нужен JSON"});
  }
  next();
});
const authLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:"draft-7",legacyHeaders:false,
  message:{error:"Слишком много попыток. Попробуйте позже."}});
app.use("/api/auth",authLimit);
function sha(v){return crypto.createHash("sha256").update(v).digest("hex");}
function token(){return crypto.randomBytes(32).toString("hex");}
function email(v){
  const s=String(v||"").trim().toLowerCase();
  return s.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)?s:null;
}
function passwordOk(v){return typeof v==="string" && v.length>=12 && Buffer.byteLength(v,"utf8")<=72;}
function error(res,msg,status=400){return res.status(status).json({error:msg});}
function cookies(req){
  return Object.fromEntries((req.headers.cookie||"").split(";").map(p=>p.trim()).filter(Boolean).map(p=>{
    const i=p.indexOf("=");return [p.slice(0,i),p.slice(i+1)];
  }));
}
function setSession(res,value){
  res.cookie("family_session",value,{httpOnly:true,secure:URL_ORIGIN.protocol==="https:",sameSite:"lax",path:"/",maxAge:30*24*60*60*1000});
}
function clearSession(res){res.clearCookie("family_session",{httpOnly:true,secure:URL_ORIGIN.protocol==="https:",sameSite:"lax",path:"/"});}
async function createSession(userId,res){
  const value=token();
  await pool.query("INSERT INTO family_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[sha(value),userId]);
  setSession(res,value);
}
async function session(req){
  const v=cookies(req).family_session;
  if(!v || !/^[a-f0-9]{64}$/.test(v))return null;
  const q=await pool.query("SELECT u.id,u.email FROM family_sessions s JOIN family_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.email_verified=TRUE",[sha(v)]);
  return q.rows[0]||null;
}
async function signedIn(req,res,next){
  try{req.user=await session(req);if(!req.user)return error(res,"Нужно войти в аккаунт",401);next();}
  catch(e){next(e);}
}
async function sendLink(userId,purpose,to){
  const value=token();
  await pool.query("DELETE FROM family_tokens WHERE user_id=$1 AND purpose=$2",[userId,purpose]);
  await pool.query("INSERT INTO family_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 minutes')",[sha(value),userId,purpose]);
  const link=ORIGIN+"/account.html?"+(purpose==="verify"?"verify":"reset")+"="+encodeURIComponent(value);
  const subject=purpose==="verify"?"Подтвердите почту — Мои полезные привычки":"Восстановить доступ — Мои полезные привычки";
  const intro=purpose==="verify"?"Чтобы подтвердить регистрацию, откройте ссылку:":"Чтобы установить новый пароль, откройте ссылку:";
  await mailer.sendMail({from:config.from,to,subject,text:intro+"\n\n"+link+"\n\nСсылка действует 30 минут. Если это были не вы, просто игнорируйте письмо."});
}
async function consumeLink(value,purpose){
  if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))return null;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const q=await client.query("DELETE FROM family_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>NOW() RETURNING user_id",[sha(value),purpose]);
    if(!q.rows.length){await client.query("ROLLBACK");return null;}
    await client.query("COMMIT");return q.rows[0].user_id;
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
app.get("/health",async(req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true});}catch(e){res.status(503).json({ok:false});}});
app.get("/api/auth/me",async(req,res,next)=>{
  try{const user=await session(req);res.json({authenticated:!!user,user:user?{id:user.id,email:user.email}:null});}catch(e){next(e);}
});
app.post("/api/auth/register",async(req,res,next)=>{
  try{
    const em=email(req.body?.email),pass=req.body?.password,adult=req.body?.isAdult===true;
    if(!em||!passwordOk(pass)||!adult)return error(res,"Нужна почта, пароль от 12 символов (до 72 байт) и подтверждение совершеннолетия");
    const exists=await pool.query("SELECT id,email_verified FROM family_users WHERE email=$1",[em]);
    if(exists.rows.length){
      if(exists.rows[0].email_verified)return error(res,"Этот адрес уже зарегистрирован. Попробуйте войти.",409);
      await pool.query("UPDATE family_users SET password_hash=$1 WHERE id=$2 AND email_verified=FALSE",[await bcrypt.hash(pass,12),exists.rows[0].id]);
      await sendLink(exists.rows[0].id,"verify",em);return res.json({ok:true});
    }
    const hash=await bcrypt.hash(pass,12);
    const result=await pool.query("INSERT INTO family_users(email,password_hash) VALUES($1,$2) ON CONFLICT (email) DO NOTHING RETURNING id",[em,hash]);
    if(!result.rows.length)return error(res,"Этот адрес уже зарегистрирован",409);
    await pool.query("INSERT INTO family_profiles(user_id) VALUES($1)",[result.rows[0].id]);
    await sendLink(result.rows[0].id,"verify",em);
    res.status(201).json({ok:true});
  }catch(e){next(e);}
});
app.post("/api/auth/verify",async(req,res,next)=>{
  try{
    const id=await consumeLink(req.body?.token,"verify");
    if(!id)return error(res,"Ссылка недействительна или устарела",400);
    await pool.query("UPDATE family_users SET email_verified=TRUE WHERE id=$1",[id]);
    await createSession(id,res);res.json({ok:true});
  }catch(e){next(e);}
});
app.post("/api/auth/login",async(req,res,next)=>{
  try{
    const em=email(req.body?.email),pass=req.body?.password;
    if(!em||typeof pass!=="string")return error(res,"Укажите почту и пароль",400);
    const q=await pool.query("SELECT id,password_hash,email_verified FROM family_users WHERE email=$1",[em]);
    if(!q.rows.length||!(await bcrypt.compare(pass,q.rows[0].password_hash)))return error(res,"Неверная почта или пароль",401);
    if(!q.rows[0].email_verified)return error(res,"Сначала подтвердите адрес электронной почты",403);
    await createSession(q.rows[0].id,res);res.json({ok:true});
  }catch(e){next(e);}
});
app.post("/api/auth/logout",signedIn,async(req,res,next)=>{
  try{const value=cookies(req).family_session;await pool.query("DELETE FROM family_sessions WHERE token_hash=$1",[sha(value)]);clearSession(res);res.json({ok:true});}catch(e){next(e);}
});
app.post("/api/auth/forgot",async(req,res,next)=>{
  try{
    const em=email(req.body?.email);
    if(em){const q=await pool.query("SELECT id,email_verified FROM family_users WHERE email=$1",[em]);if(q.rows[0]?.email_verified)await sendLink(q.rows[0].id,"reset",em);}
    res.json({ok:true});
  }catch(e){next(e);}
});
app.post("/api/auth/reset",async(req,res,next)=>{
  try{
    if(!passwordOk(req.body?.password))return error(res,"Новый пароль должен содержать не меньше 12 символов и не больше 72 байт");
    const id=await consumeLink(req.body?.token,"reset");
    if(!id)return error(res,"Ссылка недействительна или устарела");
    await pool.query("UPDATE family_users SET password_hash=$1 WHERE id=$2",[await bcrypt.hash(req.body.password,12),id]);
    await pool.query("DELETE FROM family_sessions WHERE user_id=$1",[id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
app.get("/api/state",signedIn,async(req,res,next)=>{
  try{const q=await pool.query("SELECT content,updated_at FROM family_profiles WHERE user_id=$1",[req.user.id]);res.json({state:q.rows[0]?.content||{parent:"",children:[],selected:null,demo:false},updatedAt:q.rows[0]?.updated_at||null});}catch(e){next(e);}
});
app.put("/api/state",signedIn,async(req,res,next)=>{
  try{
    const state=req.body?.state;
    if(!state||typeof state!=="object"||Array.isArray(state)||!Array.isArray(state.children)||state.children.length>15||typeof state.parent!=="string"||state.parent.length>100)return error(res,"Неверные данные семейного профиля");
    const ids=new Set();
    for(const c of state.children){
      if(!c||typeof c.id!=="string"||!/^c[a-zA-Z0-9]{6,24}$/.test(c.id)||ids.has(c.id)||typeof c.name!=="string"||c.name.length>50||!c.days||typeof c.days!=="object"||Array.isArray(c.days))return error(res,"Неверные данные ребёнка");
      ids.add(c.id);
    }
    if(Buffer.byteLength(JSON.stringify(state))>1000000)return error(res,"Объём дневника превышает допустимый");
    await pool.query("INSERT INTO family_profiles(user_id,content) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET content=$2,updated_at=NOW()",[req.user.id,state]);
    res.json({ok:true});
  }catch(e){next(e);}
});
function validDay(x){return typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x+"T12:00:00Z"));}
function validChild(x){return typeof x==="string"&&/^c[a-zA-Z0-9]{6,24}$/.test(x);}
app.get("/api/drawings",signedIn,async(req,res,next)=>{
  try{
    const child=req.query.childId,day=req.query.day;
    if(!validChild(child)||!validDay(day))return error(res,"Неверная дата или ребёнок");
    const q=await pool.query("SELECT id,child_id,day,mime,data,created_at FROM family_drawings WHERE user_id=$1 AND child_id=$2 AND day=$3 ORDER BY created_at DESC LIMIT 100",[req.user.id,child,day]);
    res.json({drawings:q.rows.map(r=>({id:r.id,childId:r.child_id,childDay:r.child_id+"|"+day,day,mime:r.mime,created:r.created_at,image:"data:"+r.mime+";base64,"+r.data.toString("base64")}))});
  }catch(e){next(e);}
});
app.post("/api/drawings",signedIn,async(req,res,next)=>{
  try{
    const {id,childId,day,image}=req.body||{};
    if(!validChild(childId)||!validDay(day)||typeof id!=="string"||id.length>160||typeof image!=="string")return error(res,"Неверный рисунок");
    const m=/^data:(image\/webp|image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if(!m)return error(res,"Неверный формат рисунка");
    const bytes=Buffer.from(m[2],"base64");
    if(bytes.length<10||bytes.length>650000)return error(res,"Рисунок слишком большой");
    const user=await pool.query("SELECT content FROM family_profiles WHERE user_id=$1",[req.user.id]);
    if(!user.rows[0]?.content?.children?.some(c=>c.id===childId))return error(res,"Ребёнок не найден",404);
    const q=await pool.query("SELECT COUNT(*)::int AS n FROM family_drawings WHERE user_id=$1 AND child_id=$2 AND day=$3",[req.user.id,childId,day]);
    if(q.rows[0].n>=40)return error(res,"За этот день уже сохранено много рисунков");
    await pool.query("INSERT INTO family_drawings(user_id,id,child_id,day,mime,data) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,id) DO NOTHING",[req.user.id,id,childId,day,m[1],bytes]);
    res.json({ok:true});
  }catch(e){next(e);}
});
app.delete("/api/drawings/past",signedIn,async(req,res,next)=>{
  try{const before=req.body?.before;if(!validDay(before))return error(res,"Неверная дата");await pool.query("DELETE FROM family_drawings WHERE user_id=$1 AND day<$2",[req.user.id,before]);res.json({ok:true});}catch(e){next(e);}
});
app.delete("/api/drawings/child",signedIn,async(req,res,next)=>{
  try{const childId=req.body?.childId;if(!validChild(childId))return error(res,"Неверный ребёнок");await pool.query("DELETE FROM family_drawings WHERE user_id=$1 AND child_id=$2",[req.user.id,childId]);res.json({ok:true});}catch(e){next(e);}
});
app.delete("/api/account",signedIn,async(req,res,next)=>{
  try{await pool.query("DELETE FROM family_users WHERE id=$1",[req.user.id]);clearSession(res);res.json({ok:true});}catch(e){next(e);}
});
const ROOT=path.resolve(__dirname,"..");
app.use("/assets",express.static(path.join(ROOT,"assets"),{dotfiles:"deny"}));
for(const file of ["index.html","account.html","style.css","drawing-studio.css","family-habits.js","drawing-studio.js","cloud-account.js"]){
  app.get("/"+file,(req,res)=>res.sendFile(path.join(ROOT,file)));
}
app.get("/",(req,res)=>res.sendFile(path.join(ROOT,"index.html")));
app.use((req,res)=>res.status(404).send("Not found"));
app.use((err,req,res,next)=>{
  console.error("Request failed",err.code||err.name||"unknown");
  if(res.headersSent)return next(err);
  res.status(500).json({error:"Временная ошибка сервера. Повторите попытку позже."});
});
async function start(){
  await pool.query(fs.readFileSync(path.join(__dirname,"schema.sql"),"utf8"));
  await mailer.verify();
  const port=Number(process.env.PORT||3000);
  app.listen(port,"0.0.0.0",()=>console.log("Family Habits cloud listening at "+port));
}
start().catch(e=>{console.error("Server setup failed:",e.message);process.exitCode=1;pool.end();});
