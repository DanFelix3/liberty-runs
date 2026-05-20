import {auth,db} from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,doc,getDoc,getDocs,addDoc,updateDoc,
  query,where,orderBy,limit,serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── GLOBALS ───────────────────────────────────────────────
const ITEMS_PER_PAGE=8;
const CREDIT_DEFAULT=1000;

const CATEGORIES=[
  {id:'body-kits',label:'Body Kits',icon:'🚗',gridId:'grid-body-kits',pagId:'pag-body-kits'},
  {id:'rims',label:'Rims & Wheels',icon:'⚙️',gridId:'grid-rims',pagId:'pag-rims'},
  {id:'hood',label:'Hood Customizations',icon:'🔩',gridId:'grid-hood',pagId:'pag-hood'},
  {id:'roof-scoops',label:'Roof Scoops',icon:'💨',gridId:'grid-roof-scoops',pagId:'pag-roof-scoops'},
  {id:'paint-wraps',label:'Paint & Wraps',icon:'🎨',gridId:'grid-paint-wraps',pagId:'pag-paint-wraps'},
];

const SLIDE_COLORS={
  'body-kits':'linear-gradient(135deg,#1a0a0a,#2a1010)',
  'rims':'linear-gradient(135deg,#0a0f1a,#101828)',
  'hood':'linear-gradient(135deg,#0a1a0a,#102010)',
  'roof-scoops':'linear-gradient(135deg,#1a1a0a,#282010)',
  'paint-wraps':'linear-gradient(135deg,#150a1a,#201030)',
};

let currentUser=null;
let isAdmin=false;
let cart=[];
let catPages={};
let allProducts=[];
let heroItems=[];
let heroIdx=0;
let heroTimer=null;

// ─── AUTH STATE ────────────────────────────────────────────
onAuthStateChanged(auth,async user=>{
  if(user){
    currentUser=user;
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    const isAdmin = userSnap.exists() && userSnap.data().role === 'admin';
    $('#auth-overlay').fadeOut(300);
    $('#user-greeting').text(user.displayName||user.email.split('@')[0]);
    if(isAdmin)$('#nav-admin').show();
    loadCart();
    loadAllProducts();
  }else{
    currentUser=null;isAdmin=false;
    $('#auth-overlay').fadeIn(300);
  }
});

// ─── AUTH TABS ─────────────────────────────────────────────
$('.auth-tab').on('click',function(){
  const tab=$(this).data('tab');
  $('.auth-tab').removeClass('active');
  $(this).addClass('active');
  $('.auth-form').removeClass('active');
  $(`#form-${tab}`).addClass('active');
  clearAuthErrors();
});

$('#show-reset').on('click',()=>{
  $('.auth-form').removeClass('active');
  $('#form-reset').addClass('active');
  $('.auth-tab').removeClass('active');
});
$('#back-login').on('click',()=>{
  $('.auth-form').removeClass('active');
  $('#form-login').addClass('active');
  $('.auth-tab').filter('[data-tab="login"]').addClass('active');
});

function clearAuthErrors(){
  $('.form-error').hide().text('');
  $('#login-err,#reg-err,#reset-err').text('');
}

function validateEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function validatePhone(v){return /^[+\d\s-]{7,15}$/.test(v);}

// LOGIN
$('#btn-login').on('click',async()=>{
  clearAuthErrors();
  let ok=true;
  const email=$('#login-email').val().trim();
  const pass=$('#login-pass').val();
  if(!validateEmail(email)){$('#login-email-err').show();ok=false;}
  if(!pass){$('#login-pass-err').show();ok=false;}
  if(!ok)return;
  try{
    await signInWithEmailAndPassword(auth,email,pass);
  }catch(e){
    const msg=e.code==='auth/invalid-credential'?'Invalid email or password.':e.message;
    $('#login-err').text(msg);
  }
});

// REGISTER
$('#btn-register').on('click',async()=>{
  clearAuthErrors();
  let ok=true;
  const name=$('#reg-name').val().trim();
  const email=$('#reg-email').val().trim();
  const phone=$('#reg-phone').val().trim();
  const pass=$('#reg-pass').val();
  const cpass=$('#reg-cpass').val();
  if(!name){$('#reg-name-err').show();ok=false;}
  if(!validateEmail(email)){$('#reg-email-err').show();ok=false;}
  if(!validatePhone(phone)){$('#reg-phone-err').show();ok=false;}
  if(pass.length<6){$('#reg-pass-err').show();ok=false;}
  if(pass!==cpass){$('#reg-cpass-err').show();ok=false;}
  if(!ok)return;
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await addDoc(collection(db,'customers'),{
      uid:cred.user.uid,name,email,phone,
      creditLimit:CREDIT_DEFAULT,creditUsed:0,
      active:true,createdAt:serverTimestamp()
    });
    showToast('Account created! Welcome.','success');
  }catch(e){
    $('#reg-err').text(e.message);
  }
});

// RESET
$('#btn-reset').on('click',async()=>{
  clearAuthErrors();
  const email=$('#reset-email').val().trim();
  if(!validateEmail(email)){$('#reset-email-err').show();return;}
  try{
    await sendPasswordResetEmail(auth,email);
    $('#reset-err').css('color','var(--green)').text('Reset link sent! Check your email.');
  }catch(e){
    $('#reset-err').text(e.message);
  }
});

// LOGOUT
$('#btn-logout').on('click',async()=>{
  await signOut(auth);
  showToast('Signed out.','info');
});

// NAV ADMIN
$('#nav-admin').on('click',()=>window.open('pages/admin.html','_blank'));
$('#nav-orders').on('click',()=>openOrdersModal());

// USER MENU DROPDOWN
$('#btn-user-menu').on('click',e=>{
  e.stopPropagation();
  $('#user-menu').toggleClass('open');
});
$(document).on('click',()=>$('#user-menu').removeClass('open'));

// ─── PRODUCTS ──────────────────────────────────────────────
async function loadAllProducts(){
  const snap=await getDocs(query(collection(db,'products'),where('active','==',true)));
  allProducts=snap.docs.map(d=>({id:d.id,...d.data()}));
  buildHero();
  CATEGORIES.forEach(cat=>renderCategory(cat));
}

function buildHero(){
  heroItems=[];
  CATEGORIES.forEach(cat=>{
    const prods=allProducts.filter(p=>p.cat_id===cat.id);
    if(prods.length>0){
      const p=prods[Math.floor(Math.random()*prods.length)];
      heroItems.push({...p,catLabel:cat.label,icon:cat.icon,color:SLIDE_COLORS[cat.id]||'linear-gradient(135deg,#111,#1a1a1a)'});
    }
  });
  if(heroItems.length===0)return;
  renderSlides();
  startHero();
}

function renderSlides(){
  const wrap=$('#slides-wrap');const dots=$('#hero-dots');
  wrap.empty();dots.empty();
  heroItems.forEach((item,i)=>{
    const slide=`
    <div class="slide${i===0?' active':''}" data-idx="${i}">
      <div class="slide-bg">
        <div class="slide-bg-color" style="background:${item.color}"></div>
        <div class="slide-product-visual">
          <div class="slide-card-placeholder" style="background:${item.color};">
            <div class="slide-icon">${item.icon}</div>
            <div class="slide-label">${item.catLabel}</div>
          </div>
        </div>
      </div>
      <div class="slide-content">
        <span class="cat-tag">${item.catLabel}</span>
        <h2>${item.title}</h2>
        <p>${(item.des||'').substring(0,100)}${(item.des||'').length>100?'...':''}</p>
        <div class="slide-price">₹${Number(item.price).toLocaleString('en-IN')}</div>
        <div class="slide-actions">
          <button class="btn-primary" onclick="openProductModal('${item.id}')">View Details</button>
          <button class="btn-outline" onclick="addToCartById('${item.id}')">Add to Cart</button>
        </div>
      </div>
    </div>`;
    wrap.append(slide);
    dots.append(`<button class="hero-dot${i===0?' active':''}" data-idx="${i}"></button>`);
  });
}

function goSlide(idx){
  heroIdx=(idx+heroItems.length)%heroItems.length;
  $('.slide').removeClass('active');$(`.slide[data-idx="${heroIdx}"]`).addClass('active');
  $('.hero-dot').removeClass('active');$(`.hero-dot[data-idx="${heroIdx}"]`).addClass('active');
}

function startHero(){
  clearInterval(heroTimer);
  heroTimer=setInterval(()=>goSlide(heroIdx+1),5000);
}

$(document).on('click','.hero-dot',function(){
  goSlide(parseInt($(this).data('idx')));startHero();
});
$('#hero-prev').on('click',()=>{goSlide(heroIdx-1);startHero();});
$('#hero-next').on('click',()=>{goSlide(heroIdx+1);startHero();});

// ─── CATEGORY GRIDS ────────────────────────────────────────
function renderCategory(cat){
  catPages[cat.id]=catPages[cat.id]||1;
  const prods=allProducts.filter(p=>p.cat_id===cat.id);
  renderGrid(`#${cat.gridId}`,prods,catPages[cat.id]);
  renderPagination(`#${cat.pagId}`,prods.length,catPages[cat.id],pg=>{
    catPages[cat.id]=pg;
    renderGrid(`#${cat.gridId}`,prods,pg);
  });
}

function renderGrid(selector,prods,page){
  const start=(page-1)*ITEMS_PER_PAGE;
  const slice=prods.slice(start,start+ITEMS_PER_PAGE);
  const grid=$(selector);grid.empty();
  if(slice.length===0){
    grid.html('<div class="empty-state"><i class="fas fa-box-open"></i><p>No products in this category yet.</p></div>');
    return;
  }
  slice.forEach(p=>grid.append(productCardHtml(p)));
}

function productCardHtml(p){
  const catObj=CATEGORIES.find(c=>c.id===p.cat_id)||{icon:'🔧',label:'Parts'};
  const lowStock=p.qty>0&&p.qty<15;
  return `
  <div class="product-card" data-id="${p.id}">
    <div class="product-card-img" style="background:${SLIDE_COLORS[p.cat_id]||'var(--dark2)'}">
      <span style="font-size:52px;position:relative;z-index:1;">${catObj.icon}</span>
      ${p.qty===0?'<div class="product-card-badge" style="background:var(--gray2)">Out of Stock</div>':''}
      ${lowStock?'<div class="product-card-badge">Low Stock</div>':''}
    </div>
    <div class="product-card-body">
      <span class="product-card-cat">${catObj.label}</span>
      <div class="product-card-title">${p.title}</div>
      <div class="product-card-desc">${p.des||''}</div>
      <div class="product-card-footer">
        <div>
          <div class="product-card-price">₹${Number(p.price).toLocaleString('en-IN')}</div>
          <div class="product-card-qty">${p.qty>0?`${p.qty} in stock`:'Out of stock'}</div>
        </div>
        <button class="btn-cart" onclick="addToCartById('${p.id}')" ${p.qty===0?'disabled':''} title="Add to cart">
          <i class="fas fa-cart-plus"></i>
        </button>
      </div>
    </div>
  </div>`;
}

function renderPagination(selector,total,current,cb){
  const pages=Math.ceil(total/ITEMS_PER_PAGE);
  const el=$(selector);el.empty();
  if(pages<=1)return;
  for(let i=1;i<=pages;i++){
    const btn=$(`<button class="page-btn${i===current?' active':''}">${i}</button>`);
    btn.on('click',()=>cb(i));
    el.append(btn);
  }
}

// PRODUCT DETAIL MODAL
window.openProductModal=function(id){
  const p=allProducts.find(x=>x.id===id);
  if(!p)return;
  const catObj=CATEGORIES.find(c=>c.id===p.cat_id)||{icon:'🔧',label:'Parts'};
  const delivDays=5+Math.floor(Math.random()*5);
  const delivDate=new Date();delivDate.setDate(delivDate.getDate()+delivDays);
  const delivStr=delivDate.toLocaleDateString('en-IN',{weekday:'long',month:'long',day:'numeric'});
  $('#modal-content-inner').html(`
    <div class="modal-visual" style="background:${SLIDE_COLORS[p.cat_id]||'var(--dark2)'}">
      <span style="font-size:96px;">${catObj.icon}</span>
    </div>
    <div class="modal-body">
      <span class="modal-cat">${catObj.label}</span>
      <div class="modal-title">${p.title}</div>
      <div class="modal-desc">${p.des||'Premium aftermarket part. Engineered for performance and style.'}</div>
      <div class="modal-price">₹${Number(p.price).toLocaleString('en-IN')}</div>
      <div class="modal-delivery"><i class="fas fa-truck"></i> Estimated delivery: ${delivStr}</div>
      <div class="modal-qty-row">
        <span style="font-size:13px;color:var(--gray);">Qty:</span>
        <div class="qty-ctrl">
          <button class="qty-btn" id="modal-qty-minus"><i class="fas fa-minus"></i></button>
          <input class="qty-val" type="number" id="modal-qty-val" value="1" min="1" max="${p.qty}">
          <button class="qty-btn" id="modal-qty-plus"><i class="fas fa-plus"></i></button>
        </div>
        <span class="modal-stock ${p.qty<15?'low':''} ${p.qty===0?'out':''}">${p.qty===0?'Out of stock':p.qty<15?`Only ${p.qty} left!`:`${p.qty} available`}</span>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" style="flex:1;" onclick="addToCartById('${p.id}',parseInt($('#modal-qty-val').val()))" ${p.qty===0?'disabled':''}>
          <i class="fas fa-cart-plus"></i> Add to Cart
        </button>
      </div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--gray);">
        <span>SKU: LR-${p.id.substring(0,6).toUpperCase()}</span> &nbsp;|&nbsp;
        <span>Category: ${catObj.label}</span>
      </div>
    </div>
  `);
  $('#product-modal').addClass('open');
  $('#modal-qty-minus').on('click',()=>{
    const v=parseInt($('#modal-qty-val').val());
    if(v>1)$('#modal-qty-val').val(v-1);
  });
  $('#modal-qty-plus').on('click',()=>{
    const v=parseInt($('#modal-qty-val').val());
    if(v<p.qty)$('#modal-qty-val').val(v+1);
  });
};

$('#product-modal-close').on('click',()=>$('#product-modal').removeClass('open'));
$('#product-modal').on('click',function(e){if($(e.target).is(this))$(this).removeClass('open');});

// OPEN ON CARD CLICK (not cart button)
$(document).on('click','.product-card',function(e){
  if($(e.target).closest('.btn-cart').length)return;
  openProductModal($(this).data('id'));
});

// ─── CART ──────────────────────────────────────────────────
function loadCart(){
  try{cart=JSON.parse(localStorage.getItem(`cart_${currentUser.uid}`))||[];}
  catch{cart=[];}
  updateCartUI();
}

function saveCart(){
  localStorage.setItem(`cart_${currentUser.uid}`,JSON.stringify(cart));
}

window.addToCartById=function(id,qty=1){
  const p=allProducts.find(x=>x.id===id);
  if(!p||p.qty===0)return;
  const existing=cart.find(c=>c.id===id);
  if(existing){
    existing.qty=Math.min(existing.qty+qty,p.qty);
  }else{
    cart.push({id:p.id,title:p.title,price:p.price,qty,maxQty:p.qty,cat_id:p.cat_id});
  }
  saveCart();updateCartUI();
  showToast(`${p.title} added to cart.`,'success');
  $('#product-modal').removeClass('open');
};

function updateCartUI(){
  const total=cart.reduce((s,c)=>s+c.qty,0);
  const subtotal=cart.reduce((s,c)=>s+(c.price*c.qty),0);
  $('#cart-badge').text(total).toggle(total>0);
  $('#cart-subtotal,#cart-total').text(`₹${subtotal.toLocaleString('en-IN')}`);
  const list=$('#cart-items-list');list.empty();
  if(cart.length===0){
    list.html('<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>Your cart is empty.</p></div>');
    return;
  }
  cart.forEach(item=>{
    const catObj=CATEGORIES.find(c=>c.id===item.cat_id)||{icon:'🔧'};
    list.append(`
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item-icon">${catObj.icon}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.title}</div>
        <div class="cart-item-price">₹${Number(item.price).toLocaleString('en-IN')} each</div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" onclick="cartChangeQty('${item.id}',-1)"><i class="fas fa-minus"></i></button>
          <span class="cart-qty-val">${item.qty}</span>
          <button class="cart-qty-btn" onclick="cartChangeQty('${item.id}',1)"><i class="fas fa-plus"></i></button>
          <button class="cart-remove" onclick="cartRemove('${item.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`);
  });
}

window.cartChangeQty=function(id,delta){
  const item=cart.find(c=>c.id===id);
  if(!item)return;
  item.qty+=delta;
  if(item.qty<1){cartRemove(id);return;}
  if(item.qty>item.maxQty)item.qty=item.maxQty;
  saveCart();updateCartUI();
};
window.cartRemove=function(id){
  cart=cart.filter(c=>c.id!==id);
  saveCart();updateCartUI();
};

$('#btn-cart-open').on('click',()=>{$('#cart-sidebar').addClass('open');});
$('#cart-close').on('click',()=>{$('#cart-sidebar').removeClass('open');});

// PAYMENT OPTS
$('.payment-opt').on('click',function(){
  $('.payment-opt').removeClass('selected');
  $(this).addClass('selected');
  $(this).find('input').prop('checked',true);
  const isCred=$(this).is('#opt-credit');
  if(isCred){loadCreditInfo();}
  $('#credit-info').toggle(isCred);
});

async function loadCreditInfo(){
  const q=query(collection(db,'customers'),where('uid','==',currentUser.uid));
  const snap=await getDocs(q);
  if(snap.empty)return;
  const cust=snap.docs[0].data();
  const limit=cust.creditLimit||CREDIT_DEFAULT;
  const used=cust.creditUsed||0;
  const avail=Math.max(0,limit-used);
  $('#credit-limit-disp').text(`₹${limit.toLocaleString('en-IN')}`);
  $('#credit-used-disp').text(`₹${used.toLocaleString('en-IN')}`);
  $('#credit-avail-disp').text(`₹${avail.toLocaleString('en-IN')}`);
}

// CHECKOUT
$('#btn-checkout').on('click',async()=>{
  if(!currentUser){showToast('Please sign in first.','error');return;}
  if(cart.length===0){showToast('Your cart is empty.','error');return;}
  const payType=$('input[name="payment"]:checked').val();
  const subtotal=cart.reduce((s,c)=>s+(c.price*c.qty),0);

  if(payType==='credit'){
    const q=query(collection(db,'customers'),where('uid','==',currentUser.uid));
    const snap=await getDocs(q);
    if(snap.empty){showToast('Customer profile not found.','error');return;}
    const cust=snap.docs[0].data();
    const avail=(cust.creditLimit||CREDIT_DEFAULT)-(cust.creditUsed||0);
    if(subtotal>avail){showToast(`Insufficient credit. Available: ₹${avail.toLocaleString('en-IN')}`,'error');return;}
  }

  showConfirm('Confirm Order','Place this order?',async()=>{
    try{
      const orderNum='LR'+Date.now().toString().slice(-8);
      const orderDoc={
        orderNum,uid:currentUser.uid,
        email:currentUser.email,
        items:cart.map(c=>({...c})),
        subtotal,total:subtotal,
        payType,status:'confirmed',
        createdAt:serverTimestamp()
      };
      const ref=await addDoc(collection(db,'orders'),orderDoc);

      // Reduce stock
      for(const item of cart){
        const pRef=doc(db,'products',item.id);
        await updateDoc(pRef,{qty:increment(-item.qty)});
        const local=allProducts.find(p=>p.id===item.id);
        if(local)local.qty=Math.max(0,local.qty-item.qty);
      }

      // Update credit used
      if(payType==='credit'){
        const cq=query(collection(db,'customers'),where('uid','==',currentUser.uid));
        const csnap=await getDocs(cq);
        if(!csnap.empty){
          await updateDoc(doc(db,'customers',csnap.docs[0].id),{creditUsed:increment(subtotal)});
        }
      }

      showOrderReceipt({...orderDoc,id:ref.id});
      cart=[];saveCart();updateCartUI();
      $('#cart-sidebar').removeClass('open');
      CATEGORIES.forEach(cat=>renderCategory(cat));
    }catch(e){
      showToast('Order failed: '+e.message,'error');
    }
  });
});

function showOrderReceipt(order){
  let rows='';
  order.items.forEach(it=>{
    rows+=`<div class="receipt-item"><span>${it.title} ×${it.qty}</span><span>₹${(it.price*it.qty).toLocaleString('en-IN')}</span></div>`;
  });
  $('#order-receipt-content').html(`
    <h4>Order Confirmed!</h4>
    <span class="order-num"># ${order.orderNum}</span>
    <div class="receipt-items">${rows}</div>
    <div class="receipt-total"><span>Total</span><span>₹${order.total.toLocaleString('en-IN')}</span></div>
    <div style="margin-top:12px;font-size:12px;color:var(--gray);">
      Payment: ${order.payType==='cash'?'Cash':'Credit'} &nbsp;|&nbsp; Status: ${order.status}
    </div>
  `);
  $('#order-modal').addClass('open');
}

$('#order-modal-close').on('click',()=>$('#order-modal').removeClass('open'));
$('#order-modal').on('click',function(e){if($(e.target).is(this))$(this).removeClass('open');});
$('#btn-print-order').on('click',()=>window.print());

// MY ORDERS
async function openOrdersModal(){
  $('#orders-modal').addClass('open');
  $('#orders-list').html('<div class="loader"><div class="spinner"></div></div>');
  const q=query(collection(db,'orders'),where('uid','==',currentUser.uid),orderBy('createdAt','desc'));
  const snap=await getDocs(q);
  if(snap.empty){$('#orders-list').html('<div class="empty-state"><i class="fas fa-receipt"></i><p>No orders yet.</p></div>');return;}
  let html='';
  snap.docs.forEach(d=>{
    const o=d.data();
    const date=o.createdAt?o.createdAt.toDate().toLocaleDateString('en-IN'):'—';
    html+=`
    <div style="border:1px solid var(--border);border-radius:2px;margin-bottom:12px;overflow:hidden;">
      <div style="background:var(--dark2);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-family:var(--font-cond);font-size:13px;font-weight:700;color:var(--red);">#${o.orderNum}</span>
          <span style="font-size:12px;color:var(--gray);margin-left:10px;">${date}</span>
        </div>
        <span style="font-family:var(--font-cond);font-size:14px;font-weight:700;color:var(--gold);">₹${o.total.toLocaleString('en-IN')}</span>
      </div>
      <div style="padding:12px 16px;">
        ${o.items.map(i=>`<div style="font-size:13px;color:var(--gray);margin-bottom:4px;">${i.title} ×${i.qty} — ₹${(i.price*i.qty).toLocaleString('en-IN')}</div>`).join('')}
        <div style="margin-top:8px;font-size:11px;color:var(--gray2);">Payment: ${o.payType} | Status: ${o.status}</div>
      </div>
    </div>`;
  });
  $('#orders-list').html(html);
}

$('#orders-modal-close').on('click',()=>$('#orders-modal').removeClass('open'));
$('#orders-modal').on('click',function(e){if($(e.target).is(this))$(this).removeClass('open');});

// ─── SEARCH ────────────────────────────────────────────────
$('#btn-search-toggle').on('click',()=>{
  $('#search-bar').toggleClass('open');
  if($('#search-bar').hasClass('open'))$('#search-input').focus();
  else{$('#search-results').hide();$('#main-content').show();}
});

$('#btn-search-close').on('click',()=>{
  $('#search-bar').removeClass('open');
  $('#search-results').hide();$('#main-content').show();
});

$('#btn-clear-search').on('click',()=>{
  $('#search-input').val('');$('#search-cat').val('');
  $('#search-results').hide();$('#main-content').show();
});

$('#btn-search-go').on('click',doSearch);
$('#search-input').on('keypress',e=>{if(e.key==='Enter')doSearch();});

function doSearch(){
  const q=$('#search-input').val().toLowerCase().trim();
  const cat=$('#search-cat').val();
  let results=allProducts.filter(p=>p.active!==false);
  if(cat)results=results.filter(p=>p.cat_id===cat);
  if(q)results=results.filter(p=>(p.title||'').toLowerCase().includes(q)||(p.des||'').toLowerCase().includes(q));
  $('#search-count').text(results.length);
  const grid=$('#search-grid');grid.empty();
  results.forEach(p=>grid.append(productCardHtml(p)));
  $('#search-results').show();$('#main-content').hide();
}

// ─── UTILS ─────────────────────────────────────────────────
function showToast(msg,type='info'){
  const t=$(`<div class="toast ${type}">${msg}</div>`);
  $('#toast-container').append(t);
  setTimeout(()=>t.fadeOut(300,function(){$(this).remove();}),3000);
}

function showConfirm(title,msg,onYes){
  $('#confirm-title').text(title);$('#confirm-msg').text(msg);
  $('#confirm-overlay').css('display','flex');
  $('#confirm-yes').off('click').on('click',()=>{
    $('#confirm-overlay').hide();onYes();
  });
  $('#confirm-no').off('click').on('click',()=>$('#confirm-overlay').hide());
}
