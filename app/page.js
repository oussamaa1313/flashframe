"use client";
import {useState} from 'react';

export default function Home(){
  const [files,setFiles]=useState([]);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  async function checkout(){
    setBusy(true); setMsg('Opening secure checkout…');
    try{
      const r=await fetch('/api/checkout',{method:'POST'});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Checkout unavailable');
      location.href=d.url;
    }catch(e){setMsg(e.message);setBusy(false)}
  }
  async function process(){
    if(!files.length || files.length>3){setMsg('Choose between 1 and 3 videos.');return}
    const params=new URLSearchParams(location.search), sid=params.get('session_id');
    if(!sid){setMsg('Complete payment before uploading.');return}
    const fd=new FormData(); files.forEach(f=>fd.append('videos',f)); fd.append('session_id',sid);
    setBusy(true);setMsg('Uploading and preparing your videos…');
    try{
      const r=await fetch('/api/process',{method:'POST',body:fd});const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Processing failed');
      setMsg('Your edited files are ready. Use the download links below.');
      d.files.forEach((f,i)=>{const a=document.createElement('a');a.href=f.url;a.download=`flashframe-${i+1}.mp4`;a.textContent=`Download video ${i+1}`;a.className='download';document.getElementById('downloads').append(a)});
    }catch(e){setMsg(e.message)}finally{setBusy(false)}
  }
  const paid=new URLSearchParams(typeof window!=='undefined'?window.location.search:'').get('paid')==='1';
  return <main>
    <nav><a className="logo" href="/">FLASH<span>FRAME</span></a><span className="navnote">Simple video branding</span></nav>
    <section className="hero">
      <div className="pill">VIDEO EDITING MADE SIMPLE</div>
      <h1>Make every video<br/><em>look unmistakably yours.</em></h1>
      <p className="lead">Add consistent branding to your videos with a simple, fast editing workflow. Upload up to three videos in one order.</p>
      <div className="offer"><strong>$10</strong><span>one-time payment<br/>up to 3 videos</span></div>
      <button onClick={checkout} disabled={busy} className="primary">{busy?'Please wait…':'Get started — $10'} <b>↗</b></button>
      <p className="tiny">Secure card payment powered by Stripe · No subscription</p>
    </section>
    <section className="panel">
      <div className="panelhead"><div><small>YOUR WORKSPACE</small><h2>{paid?'Payment confirmed':'Start your order'}</h2></div><span className="count">01 / 03</span></div>
      {paid?<><p className="muted">Your payment is confirmed. Upload up to three videos for branding edits.</p>
        <input type="file" accept="video/mp4,video/quicktime,video/webm" multiple onChange={e=>setFiles([...e.target.files])}/>
        <p className="muted">{files.length} of 3 videos selected</p>
        <button className="primary" disabled={busy} onClick={process}>Upload and process</button>
      </>:<div className="locked"><div className="lock">↗</div><h3>Upload unlocks after checkout</h3><p>Pay once, then upload up to three videos.</p></div>}
      <p className="status">{msg}</p><div id="downloads" className="downloads"/>
    </section>
    <section className="steps"><div><small>HOW IT WORKS</small><h2>Three steps. That's it.</h2></div><div className="stepgrid">
      <article><b>01</b><h3>Pay once</h3><p>Secure $10 checkout with Stripe.</p></article>
      <article><b>02</b><h3>Upload videos</h3><p>Select up to three video files.</p></article>
      <article><b>03</b><h3>Download</h3><p>Get your processed files ready to use.</p></article>
    </div></section>
    <footer>© 2026 FlashFrame · Video branding tools</footer>
  </main>
}
