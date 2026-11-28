(function(){
var page=document.body.getAttribute("data-page")||"";
function on(p){return p===page?' class="on"':''}

/* ===== Same Google login as the simulator (same client id + same storage key) ===== */
var GOOGLE_CLIENT_ID="67521400455-0bt9eptaruohutmhnmlo4mpbm4lj6dqt.apps.googleusercontent.com";
var STORAGE_KEY="ngspice_cvp_user";

document.getElementById("site-header").outerHTML='<header class="site"><div class="wrap nav"><a class="brand" href="index.html" aria-label="Home"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0f2740"/><path d="M4 16h5l2-6 4 12 3-9 2 3h8" fill="none" stroke="#4cc3ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>NGSpice Realistic</b><span> Circuit Simulator</span></div></a>'+
'<nav class="links" id="menu" aria-label="Main"><a href="index.html"'+on("home")+'>Home</a><a href="simulator/index.html">Simulator</a><a href="docs.html"'+on("docs")+'>Docs</a><a href="manual.html"'+on("manual")+'>User Manual</a><a href="index.html#about">About Me</a><a href="index.html#contact">Contact</a><a href="simulator/index.html" class="cta">Launch Simulator</a></nav>'+
'<div id="auth-area"><button type="button" id="login-btn" title="Login with Google"><i class="fa-brands fa-google" aria-hidden="true"></i><span>Login</span></button>'+
'<div id="user-chip"><img id="user-avatar" src="" alt=""><span id="user-name"></span><button type="button" id="logout-btn" title="Logout"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i></button></div></div>'+
'<button class="ib" id="theme" title="Switch light / dark theme" aria-label="Switch light or dark theme"><i class="fa-solid fa-moon th-moon"></i><i class="fa-solid fa-sun th-sun"></i></button><button class="ib" id="burger" aria-label="Menu"><i class="fa-solid fa-bars"></i></button></div></header>'+
'<div id="login-modal-overlay"><div id="login-modal"><button type="button" id="login-modal-close" title="Close">&times;</button><div class="login-modal-icon"><i class="fa-brands fa-google" aria-hidden="true"></i></div><h3>Sign in</h3><p id="login-modal-msg">Sign in with Google to unlock all NGSpice features in the simulator.</p><div id="g_id_signin_container"></div></div></div>';

document.getElementById("site-footer").outerHTML='<footer class="site"><div class="wrap"><div>&copy; 2026 Md. Anisur Rahman &middot; NGSpice Realistic Circuit Simulator &middot; MIT License &middot; Built with NGSpice</div><div><a href="simulator/index.html">Simulator</a><a href="docs.html">Docs</a><a href="manual.html">User Manual</a><a href="mailto:poetanis@gmail.com">poetanis@gmail.com</a></div></div></footer>';

var root=document.documentElement,menu=document.getElementById("menu");
try{var t=localStorage.getItem("theme");if(t)root.setAttribute("data-theme",t)}catch(e){}
document.getElementById("theme").onclick=function(){var c=root.getAttribute("data-theme");var dark=c==="dark"||(!c&&matchMedia("(prefers-color-scheme:dark)").matches);var n=dark?"light":"dark";root.setAttribute("data-theme",n);try{localStorage.setItem("theme",n)}catch(e){}};
document.getElementById("burger").onclick=function(){menu.classList.toggle("open")};
menu.addEventListener("click",function(e){if(e.target.tagName==="A")menu.classList.remove("open")});

/* ===== Login logic ===== */
function getUser(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")}catch(e){return null}}
function setUser(u){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(u))}catch(e){}}
function clearUser(){try{localStorage.removeItem(STORAGE_KEY)}catch(e){}}
function parseJwt(token){
  try{
    var b64=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
    var json=decodeURIComponent(atob(b64).split("").map(function(c){return "%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)}).join(""));
    return JSON.parse(json);
  }catch(e){return null}
}
var loginBtn=document.getElementById("login-btn"),userChip=document.getElementById("user-chip"),
    overlay=document.getElementById("login-modal-overlay");

function updateAuthUI(){
  var u=getUser();
  if(u){
    loginBtn.style.display="none";userChip.style.display="flex";
    document.getElementById("user-avatar").src=u.picture||"";
    document.getElementById("user-name").textContent=u.name||u.email||"Signed in";
  }else{
    loginBtn.style.display="inline-flex";userChip.style.display="none";
  }
}
function googleReady(){return window.google&&google.accounts&&google.accounts.id}
function handleCredentialResponse(resp){
  var p=parseJwt(resp.credential);if(!p)return;
  setUser({name:p.name,email:p.email,picture:p.picture});
  updateAuthUI();closeModal();
}
function initGoogle(retries){
  if(googleReady()){
    google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleCredentialResponse,auto_select:false,cancel_on_tap_outside:true});
    return;
  }
  if(retries>0)setTimeout(function(){initGoogle(retries-1)},150);
}
function openModal(msg){
  if(msg)document.getElementById("login-modal-msg").textContent=msg;
  overlay.style.display="flex";
  try{
    if(googleReady()){
      var c=document.getElementById("g_id_signin_container");c.innerHTML="";
      google.accounts.id.renderButton(c,{theme:"outline",size:"large",type:"standard",shape:"pill"});
      google.accounts.id.prompt();
    }
  }catch(e){}
}
function closeModal(){overlay.style.display="none"}

/* load Google Identity Services */
var gs=document.createElement("script");gs.src="https://accounts.google.com/gsi/client";gs.async=true;gs.defer=true;
document.head.appendChild(gs);

loginBtn.addEventListener("click",function(){openModal("Sign in with Google to unlock all NGSpice features.")});
document.getElementById("logout-btn").addEventListener("click",function(){
  if(!confirm("Do you want to logout?"))return;
  clearUser();updateAuthUI();
  if(googleReady())google.accounts.id.disableAutoSelect();
});
document.getElementById("login-modal-close").addEventListener("click",closeModal);
overlay.addEventListener("click",function(e){if(e.target===overlay)closeModal()});
document.addEventListener("keydown",function(e){if(e.key==="Escape")closeModal()});
window.addEventListener("storage",function(e){if(e.key===STORAGE_KEY)updateAuthUI()});

updateAuthUI();initGoogle(40);
})();
/* clean links: loads link.js from the same folder (no index.html, no .html where the host allows) */
(function(){var s=document.createElement("script");s.src="link.js";document.head.appendChild(s)})();
