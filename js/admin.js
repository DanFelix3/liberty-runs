import {auth,db} from '../js/firebase-config.js';
import {
  signOut,onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,doc,getDoc,getDocs,addDoc,updateDoc,deleteDoc,
  query,where,orderBy,serverTimestamp,Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── GLOBALS ───────────────────────────────────────────────
const PAGE_SIZE=10;
let adminUser=null;
let allProducts=[];let allCustomers=[];let allOrders=[];
let invPage=1;let custPage=1;let creditPage=1;let ordPage=1;
let invFilter='';let custFilter='';let creditFilter='';let ordFilter='';let ordPayFilter='';
let currentSalesTab='all-sales';let currentCustTab='all-cust';
let currentInvTab='all-stock';let currentStockCat='';

const CAT_LABELS={'body-kits':'Body Kits','rims':'Rims','hood':'Hood','roof-scoops':'Roof Scoops','paint-wraps':'Paint & Wraps'};

// ─── DATE / TOPBAR ─────────────────────────────────────────
$('#topbar-date').text(new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));

// ─── AUTH CHECK ────────────────────────────────────────────
onAuthStateChanged(auth,async user=>{
  if(!user){window.location.href='../index.html';return;}
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const isAdmin = userSnap.exists() && userSnap.data().role === 'admin';
  if(!isAdmin){alert('Access denied. Admin only.');window.location.href='../index.html';return;}
  adminUser=user;
  $('#sidebar-name').text(user.email.split('@')[0]);
  $('#sidebar-avatar').text(user.email[0].toUpperCase());
  loadAll();
});

async function loadAll(){
  await Promise.all([loadProducts(),loadCustomers(),loadOrders()]);
  renderDashboard();
}

// ─── SIDEBAR NAV ───────────────────────────────────────────
$('.sidebar-nav a').on('click',function(e){
  e.preventDefault();
  const panel=$(this).data('panel');
  if(!panel)return;
  $('.sidebar-nav a').removeClass('active');$(this).addClass('active');
  $('.admin-panel').removeClass('active');$(`#panel-${panel}`).addClass('active');
  $('#topbar-title').text($(this).text().trim());
  if(panel==='dashboard')renderDashboard();
  if(panel==='inventory')renderInventory();
  if(panel==='customers')renderCustomers();
  if(panel==='credit')renderCredit();
  if(panel==='orders')renderOrders();
  if(panel==='rpt-customers')renderRptCustomers();
  if(panel==='rpt-inventory')renderRptInventory();
  if(panel==='rpt-sales')renderRptSales();
});

$('#btn-logout').on('click',async()=>{await signOut(auth);window.location.href='../index.html';});

// ─── MODAL HELPERS ─────────────────────────────────────────
$('[data-close]').on('click',function(){closeModal($(this).data('close'));});
function openModal(id){$(`#${id}`).addClass('open');}
function closeModal(id){$(`#${id}`).removeClass('open');}

// ─── CONFIRM ───────────────────────────────────────────────
function showConfirm(title,msg,onYes){
  $('#confirm-title').text(title);$('#confirm-msg').text(msg);
  $('#confirm-overlay').css('display','flex');
  $('#confirm-yes').off('click').on('click',()=>{$('#confirm-overlay').hide();onYes();});
  $('#confirm-no').off('click').on('click',()=>$('#confirm-overlay').hide());
}

// ─── TOAST ─────────────────────────────────────────────────
function showToast(msg,type='info'){
  const t=$(`<div class="toast ${type}">${msg}</div>`);
  $('#toast-container').append(t);
  setTimeout(()=>t.fadeOut(300,function(){$(this).remove();}),3000);
}

// ─── LOAD DATA ─────────────────────────────────────────────
async function loadProducts(){
  const snap=await getDocs(collection(db,'products'));
  allProducts=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadCustomers(){
  const snap=await getDocs(collection(db,'customers'));
  allCustomers=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadOrders(){
  const snap=await getDocs(query(collection(db,'orders'),orderBy('createdAt','desc')));
  allOrders=snap.docs.map(d=>({id:d.id,...d.data()}));
}

// ─── DASHBOARD ─────────────────────────────────────────────
function renderDashboard(){
  $('#stat-products').text(allProducts.filter(p=>p.active).length);
  $('#stat-customers').text(allCustomers.length);
  $('#stat-orders').text(allOrders.length);
  const rev=allOrders.reduce((s,o)=>s+(o.total||0),0);
  $('#stat-revenue').text('₹'+rev.toLocaleString('en-IN'));
  let rows='';
  allOrders.slice(0,10).forEach(o=>{
    const date=o.createdAt?o.createdAt.toDate().toLocaleDateString('en-IN'):'—';
    rows+=`<tr>
      <td><span style="color:var(--red);font-weight:700;">${o.orderNum}</span></td>
      <td>${o.email}</td>
      <td>${o.items?o.items.length:0}</td>
      <td>₹${(o.total||0).toLocaleString('en-IN')}</td>
      <td><span class="badge ${o.payType==='cash'?'badge-green':'badge-blue'}">${o.payType}</span></td>
      <td>${date}</td>
      <td><span class="badge badge-gold">${o.status}</span></td>
    </tr>`;
  });
  $('#dash-orders-body').html(rows||'<tr><td colspan="7" style="text-align:center;color:var(--gray);">No orders yet.</td></tr>');
}

// ─── INVENTORY ─────────────────────────────────────────────
$('#inv-search').on('input',function(){invFilter=$(this).val().toLowerCase();invPage=1;renderInventory();});
$('#inv-cat-filter').on('change',function(){renderInventory();});

function renderInventory(){
  const catF=$('#inv-cat-filter').val();
  let prods=allProducts;
  if(catF)prods=prods.filter(p=>p.cat_id===catF);
  if(invFilter)prods=prods.filter(p=>(p.title||'').toLowerCase().includes(invFilter)||(p.id||'').toLowerCase().includes(invFilter));
  const total=prods.length;
  const slice=prods.slice((invPage-1)*PAGE_SIZE,invPage*PAGE_SIZE);
  let rows='';
  slice.forEach(p=>{
    rows+=`<tr data-id="${p.id}">
      <td style="font-size:11px;color:var(--gray);">${p.id.substring(0,8)}…</td>
      <td><input class="td-edit" data-field="cat_id" value="${p.cat_id||''}" list="cat-list" style="width:130px;"></td>
      <td><input class="td-edit" data-field="title" value="${escHtml(p.title||'')}" style="width:160px;"></td>
      <td><input class="td-edit" data-field="des" value="${escHtml(p.des||'')}" style="width:180px;"></td>
      <td><input class="td-edit" data-field="img_url" value="${escHtml(p.img_url||'')}" placeholder="https://..." style="width:180px;" title="Image URL"></td>
      <td><input class="td-edit" data-field="qty" type="number" value="${p.qty||0}" style="width:70px;"></td>
      <td><input class="td-edit" data-field="price" type="number" value="${p.price||0}" step="0.01" style="width:90px;"></td>
      <td><span class="badge ${p.active?'badge-green':'badge-gray'}">${p.active?'Active':'Inactive'}</span></td>
      <td>
        <div class="action-btns">
          <button class="act-btn act-btn-save" onclick="saveProduct('${p.id}',this)"><i class="fas fa-save"></i> Save</button>
          <button class="act-btn act-btn-toggle" onclick="toggleProduct('${p.id}','${p.active}')">${p.active?'Deactivate':'Activate'}</button>
          <button class="act-btn act-btn-del" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  });
  $('#inv-body').html(rows||'<tr><td colspan="8" style="text-align:center;color:var(--gray);">No products found.</td></tr>');
  $('#inv-count').text(`${total} products`);
  renderPag('#inv-pag',total,invPage,pg=>{invPage=pg;renderInventory();});
}
$('#btn-add-product').on('click',()=>{
  $('#pm-id').val('');$('#pm-cat').val('');$('#pm-title').val('');
  $('#pm-des').val('');$('#pm-qty').val('');$('#pm-price').val('');$('#pm-img-url').val('');
  $('#product-modal-title').text('Add Product');
  openModal('product-modal');
});
$('#btn-save-product').on('click',async()=>{
  let ok=true;
  const cat_id=$('#pm-cat').val();const title=$('#pm-title').val().trim();
  const des=$('#pm-des').val().trim();
  const qty=parseInt($('#pm-qty').val());const price=parseFloat($('#pm-price').val());
  if(!cat_id){$('#pm-cat-err').show();ok=false;}else{$('#pm-cat-err').hide();}
  if(!title){$('#pm-title-err').show();ok=false;}else{$('#pm-title-err').hide();}
  if(isNaN(qty)||qty<0){$('#pm-qty-err').show();ok=false;}else{$('#pm-qty-err').hide();}
  if(isNaN(price)||price<0){$('#pm-price-err').show();ok=false;}else{$('#pm-price-err').hide();}
  if(!ok)return;
  const img_url=$('#pm-img-url').val().trim();
  const data={cat_id,title,des,qty,price,img_url:img_url||'',active:true,updatedAt:serverTimestamp()};
  const id=$('#pm-id').val();
  try{
    if(id){await updateDoc(doc(db,'products',id),data);}
    else{data.createdAt=serverTimestamp();await addDoc(collection(db,'products'),data);}
    await loadProducts();renderInventory();renderRptInventory();
    closeModal('product-modal');showToast('Product saved.','success');
  }catch(e){showToast('Error: '+e.message,'error');}
});

window.saveProduct=async function(id,btn){
  const row=$(btn).closest('tr');
  const data={};
  row.find('.td-edit').each(function(){
    const f=$(this).data('field');let v=$(this).val();
    if(f==='qty')v=parseInt(v)||0;
    if(f==='price')v=parseFloat(v)||0;
    data[f]=v;
  });
  data.updatedAt=serverTimestamp();
  try{
    await updateDoc(doc(db,'products',id),data);
    const idx=allProducts.findIndex(p=>p.id===id);
    if(idx>=0)allProducts[idx]={...allProducts[idx],...data};
    showToast('Product updated.','success');
  }catch(e){showToast('Error: '+e.message,'error');}
};

window.toggleProduct=function(id,current){
  const newVal=current==='true'?false:true;
  const label=newVal?'activate':'deactivate';
  showConfirm('Confirm',`Do you want to ${label} this product?`,async()=>{
    await updateDoc(doc(db,'products',id),{active:newVal,updatedAt:serverTimestamp()});
    const idx=allProducts.findIndex(p=>p.id===id);
    if(idx>=0)allProducts[idx].active=newVal;
    renderInventory();showToast(`Product ${label}d.`,'success');
  });
};

window.deleteProduct=function(id){
  showConfirm('Delete Product','Permanently delete this product? This cannot be undone.',async()=>{
    await deleteDoc(doc(db,'products',id));
    allProducts=allProducts.filter(p=>p.id!==id);
    renderInventory();showToast('Product deleted.','success');
  });
};

// ─── CUSTOMERS ─────────────────────────────────────────────
$('#cust-search').on('input',function(){custFilter=$(this).val().toLowerCase();custPage=1;renderCustomers();});

function renderCustomers(){
  let custs=allCustomers;
  if(custFilter)custs=custs.filter(c=>(c.name||'').toLowerCase().includes(custFilter)||(c.email||'').toLowerCase().includes(custFilter));
  const total=custs.length;
  const slice=custs.slice((custPage-1)*PAGE_SIZE,custPage*PAGE_SIZE);
  let rows='';
  slice.forEach(c=>{
    const date=c.createdAt?c.createdAt.toDate().toLocaleDateString('en-IN'):'—';
    rows+=`<tr>
      <td>${escHtml(c.name||'—')}</td>
      <td>${escHtml(c.email||'—')}</td>
      <td>${escHtml(c.phone||'—')}</td>
      <td>₹${(c.creditLimit||1000).toLocaleString('en-IN')}</td>
      <td>₹${(c.creditUsed||0).toLocaleString('en-IN')}</td>
      <td><span class="badge ${c.active!==false?'badge-green':'badge-gray'}">${c.active!==false?'Active':'Inactive'}</span></td>
      <td>${date}</td>
      <td>
        <div class="action-btns">
          <button class="act-btn act-btn-toggle" onclick="toggleCustomer('${c.id}','${c.active!==false}')">${c.active!==false?'Deactivate':'Activate'}</button>
          <button class="act-btn act-btn-del" onclick="deleteCustomer('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  });
  $('#cust-body').html(rows||'<tr><td colspan="8" style="text-align:center;color:var(--gray);">No customers found.</td></tr>');
  $('#cust-count').text(`${total} customers`);
  renderPag('#cust-pag',total,custPage,pg=>{custPage=pg;renderCustomers();});
}

window.toggleCustomer=function(id,current){
  const newVal=current==='true'?false:true;
  showConfirm('Confirm',`${newVal?'Activate':'Deactivate'} this customer?`,async()=>{
    await updateDoc(doc(db,'customers',id),{active:newVal});
    const idx=allCustomers.findIndex(c=>c.id===id);
    if(idx>=0)allCustomers[idx].active=newVal;
    renderCustomers();showToast('Customer updated.','success');
  });
};

window.deleteCustomer=function(id){
  showConfirm('Delete Customer','Permanently delete this customer?',async()=>{
    await deleteDoc(doc(db,'customers',id));
    allCustomers=allCustomers.filter(c=>c.id!==id);
    renderCustomers();showToast('Customer deleted.','success');
  });
};

// ─── CREDIT ────────────────────────────────────────────────
$('#credit-search').on('input',function(){creditFilter=$(this).val().toLowerCase();creditPage=1;renderCredit();});

function renderCredit(){
  let custs=allCustomers;
  if(creditFilter)custs=custs.filter(c=>(c.name||'').toLowerCase().includes(creditFilter)||(c.email||'').toLowerCase().includes(creditFilter));
  const total=custs.length;
  const slice=custs.slice((creditPage-1)*PAGE_SIZE,creditPage*PAGE_SIZE);
  let rows='';
  slice.forEach(c=>{
    const limit=c.creditLimit||1000;
    const used=c.creditUsed||0;
    const avail=Math.max(0,limit-used);
    rows+=`<tr data-cid="${c.id}">
      <td>${escHtml(c.name||'—')}</td>
      <td>${escHtml(c.email||'—')}</td>
      <td><input class="td-edit" type="number" value="${limit}" style="width:100px;" data-field="creditLimit"></td>
      <td>₹${used.toLocaleString('en-IN')}</td>
      <td style="color:${avail<200?'var(--red)':'var(--green)'};">₹${avail.toLocaleString('en-IN')}</td>
      <td>
        <div class="action-btns">
          <button class="act-btn act-btn-save" onclick="saveCreditLimit('${c.id}',this)"><i class="fas fa-save"></i> Save</button>
          <button class="act-btn act-btn-toggle" onclick="resetCredit('${c.id}')">Reset Used</button>
        </div>
      </td>
    </tr>`;
  });
  $('#credit-body').html(rows||'<tr><td colspan="6" style="text-align:center;color:var(--gray);">No customers.</td></tr>');
  $('#credit-count').text(`${total} customers`);
  renderPag('#credit-pag',total,creditPage,pg=>{creditPage=pg;renderCredit();});
}

window.saveCreditLimit=async function(id,btn){
  const row=$(btn).closest('tr');
  const limit=parseFloat(row.find('[data-field="creditLimit"]').val())||1000;
  await updateDoc(doc(db,'customers',id),{creditLimit:limit,updatedAt:serverTimestamp()});
  const idx=allCustomers.findIndex(c=>c.id===id);
  if(idx>=0)allCustomers[idx].creditLimit=limit;
  renderCredit();showToast('Credit limit updated.','success');
};

window.resetCredit=function(id){
  showConfirm('Reset Credit','Reset used credit to ₹0 for this customer?',async()=>{
    await updateDoc(doc(db,'customers',id),{creditUsed:0});
    const idx=allCustomers.findIndex(c=>c.id===id);
    if(idx>=0)allCustomers[idx].creditUsed=0;
    renderCredit();showToast('Credit usage reset.','success');
  });
};

// ─── ORDERS ────────────────────────────────────────────────
$('#ord-search').on('input',function(){ordFilter=$(this).val().toLowerCase();ordPage=1;renderOrders();});
$('#ord-pay-filter').on('change',function(){ordPayFilter=$(this).val();ordPage=1;renderOrders();});

function renderOrders(){
  let ords=allOrders;
  if(ordFilter)ords=ords.filter(o=>(o.orderNum||'').toLowerCase().includes(ordFilter)||(o.email||'').toLowerCase().includes(ordFilter));
  if(ordPayFilter)ords=ords.filter(o=>o.payType===ordPayFilter);
  const total=ords.length;
  const slice=ords.slice((ordPage-1)*PAGE_SIZE,ordPage*PAGE_SIZE);
  let rows='';
  slice.forEach(o=>{
    const date=o.createdAt?o.createdAt.toDate().toLocaleDateString('en-IN'):'—';
    rows+=`<tr>
      <td><span style="color:var(--red);font-weight:700;">${o.orderNum}</span></td>
      <td>${escHtml(o.email||'—')}</td>
      <td>${o.items?o.items.length:0} items</td>
      <td>₹${(o.total||0).toLocaleString('en-IN')}</td>
      <td><span class="badge ${o.payType==='cash'?'badge-green':'badge-blue'}">${o.payType}</span></td>
      <td>${date}</td>
      <td><span class="badge badge-gold">${o.status}</span></td>
    </tr>`;
  });
  $('#ord-body').html(rows||'<tr><td colspan="7" style="text-align:center;color:var(--gray);">No orders.</td></tr>');
  $('#ord-count').text(`${total} orders`);
  renderPag('#ord-pag',total,ordPage,pg=>{ordPage=pg;renderOrders();});
}

// ─── REPORT: CUSTOMERS ─────────────────────────────────────
$('[data-rtab]').on('click',function(){
  $('[data-rtab]').removeClass('active');$(this).addClass('active');
  currentCustTab=$(this).data('rtab');
  const needsDates=['top10-cust','cash-cust','credit-cust'].includes(currentCustTab);
  $('#rpt-cust-dates').toggle(needsDates);
  if(!needsDates)renderRptCustomers();
});
$('#btn-rpt-cust-go').on('click',renderRptCustomers);

function renderRptCustomers(){
  const tab=currentCustTab;
  if(tab==='all-cust'){
    $('#rpt-cust-title').text('All Customers');
    $('#rpt-cust-head').html('<tr><th>Name</th><th>Email</th><th>Phone</th><th>Credit Limit</th><th>Credit Used</th><th>Available</th><th>Status</th><th>Joined</th></tr>');
    let rows='';
    allCustomers.forEach(c=>{
      const lim=c.creditLimit||1000;const used=c.creditUsed||0;
      const date=c.createdAt?c.createdAt.toDate().toLocaleDateString('en-IN'):'—';
      rows+=`<tr><td>${escHtml(c.name||'—')}</td><td>${escHtml(c.email||'—')}</td><td>${escHtml(c.phone||'—')}</td><td>₹${lim.toLocaleString('en-IN')}</td><td>₹${used.toLocaleString('en-IN')}</td><td>₹${Math.max(0,lim-used).toLocaleString('en-IN')}</td><td><span class="badge ${c.active!==false?'badge-green':'badge-gray'}">${c.active!==false?'Active':'Inactive'}</span></td><td>${date}</td></tr>`;
    });
    $('#rpt-cust-body').html(rows||'<tr><td colspan="8" style="text-align:center;color:var(--gray);">No data.</td></tr>');
    return;
  }
  const from=new Date($('#rpt-cust-from').val());const to=new Date($('#rpt-cust-to').val());
  if(!$('#rpt-cust-from').val()||!$('#rpt-cust-to').val()){showToast('Select date range.','error');return;}
  to.setHours(23,59,59);
  let ords=allOrders.filter(o=>{
    const d=o.createdAt?o.createdAt.toDate():null;
    return d&&d>=from&&d<=to;
  });
  if(tab==='cash-cust')ords=ords.filter(o=>o.payType==='cash');
  if(tab==='credit-cust')ords=ords.filter(o=>o.payType==='credit');

  const custMap={};
  ords.forEach(o=>{
    if(!custMap[o.uid]){custMap[o.uid]={email:o.email,total:0,orders:0};}
    custMap[o.uid].total+=o.total||0;custMap[o.uid].orders++;
  });
  let entries=Object.values(custMap).sort((a,b)=>b.total-a.total);
  if(tab==='top10-cust')entries=entries.slice(0,10);

  const title=tab==='top10-cust'?'Top 10 Customers':tab==='cash-cust'?'Cash Purchase Report':'Credit Purchase Report';
  $('#rpt-cust-title').text(title);
  $('#rpt-cust-head').html('<tr><th>Email</th><th>Orders</th><th>Total Spent</th></tr>');
  let rows='';
  entries.forEach(e=>{rows+=`<tr><td>${escHtml(e.email)}</td><td>${e.orders}</td><td>₹${e.total.toLocaleString('en-IN')}</td></tr>`;});
  $('#rpt-cust-body').html(rows||'<tr><td colspan="3" style="text-align:center;color:var(--gray);">No data for selected range.</td></tr>');
}

// ─── REPORT: INVENTORY ─────────────────────────────────────
$('[data-itab]').on('click',function(){
  $('[data-itab]').removeClass('active');$(this).addClass('active');
  currentInvTab=$(this).data('itab');
  $('#rpt-inv-cat').toggle(currentInvTab==='cat-stock');
  renderRptInventory();
});
$('#rpt-inv-cat').on('change',function(){currentStockCat=$(this).val();renderRptInventory();});

function renderRptInventory(){
  let prods=allProducts.filter(p=>p.active);
  const tab=currentInvTab;
  if(tab==='cat-stock'&&currentStockCat)prods=prods.filter(p=>p.cat_id===currentStockCat);
  if(tab==='high-stock')prods=prods.filter(p=>p.qty>100);
  if(tab==='low-stock')prods=prods.filter(p=>p.qty<15);
  prods=prods.sort((a,b)=>b.qty-a.qty);
  const labels={'all-stock':'Current Stock — All','cat-stock':'Category Wise Stock','high-stock':'High Stock (>100 units)','low-stock':'Low Stock (<15 units)'};
  $('#rpt-inv-title').text(labels[tab]||'Stock Report');
  let rows='';
  prods.forEach(p=>{
    const maxQ=Math.max(...allProducts.map(x=>x.qty),1);
    const pct=Math.min(100,Math.round((p.qty/maxQ)*100));
    const cls=p.qty>100?'high':p.qty<15?'low':'mid';
    rows+=`<tr>
      <td style="font-weight:600;">${escHtml(p.title||'—')}</td>
      <td>${CAT_LABELS[p.cat_id]||p.cat_id}</td>
      <td>₹${(p.price||0).toLocaleString('en-IN')}</td>
      <td>${p.qty}</td>
      <td style="min-width:100px;"><div class="stock-bar"><div class="stock-fill ${cls}" style="width:${pct}%;"></div></div></td>
      <td><span class="badge ${p.qty===0?'badge-red':p.qty<15?'badge-gold':'badge-green'}">${p.qty===0?'Out of Stock':p.qty<15?'Low Stock':'In Stock'}</span></td>
    </tr>`;
  });
  $('#rpt-inv-body').html(rows||'<tr><td colspan="6" style="text-align:center;color:var(--gray);">No products.</td></tr>');
}

// ─── REPORT: SALES ─────────────────────────────────────────
$('[data-stab]').on('click',function(){
  $('[data-stab]').removeClass('active');$(this).addClass('active');
  currentSalesTab=$(this).data('stab');renderRptSales();
});
$('#btn-rpt-sales-go').on('click',renderRptSales);

function renderRptSales(){
  const from=new Date($('#rpt-sales-from').val());
  const to=new Date($('#rpt-sales-to').val());
  if(!$('#rpt-sales-from').val()||!$('#rpt-sales-to').val()){showToast('Select date range.','error');return;}
  to.setHours(23,59,59);
  let ords=allOrders.filter(o=>{
    const d=o.createdAt?o.createdAt.toDate():null;
    return d&&d>=from&&d<=to;
  });
  const tab=currentSalesTab;
  if(tab==='cash-sales')ords=ords.filter(o=>o.payType==='cash');
  if(tab==='credit-sales')ords=ords.filter(o=>o.payType==='credit');
  const grandTotal=ords.reduce((s,o)=>s+(o.total||0),0);

  if(tab==='all-sales'||tab==='cash-sales'||tab==='credit-sales'){
    const title=tab==='all-sales'?'All Sales':tab==='cash-sales'?'Cash Sales':'Credit Sales';
    $('#rpt-sales-title').text(title);
    $('#rpt-sales-head').html('<tr><th>Order #</th><th>Email</th><th>Items</th><th>Total</th><th>Payment</th><th>Date</th></tr>');
    let rows='';
    ords.forEach(o=>{
      const date=o.createdAt?o.createdAt.toDate().toLocaleDateString('en-IN'):'—';
      rows+=`<tr><td style="color:var(--red);font-weight:700;">${o.orderNum}</td><td>${escHtml(o.email||'—')}</td><td>${o.items?o.items.length:0}</td><td>₹${(o.total||0).toLocaleString('en-IN')}</td><td><span class="badge ${o.payType==='cash'?'badge-green':'badge-blue'}">${o.payType}</span></td><td>${date}</td></tr>`;
    });
    $('#rpt-sales-body').html(rows||'<tr><td colspan="6" style="text-align:center;color:var(--gray);">No data.</td></tr>');
    $('#rpt-sales-summary').text(`${ords.length} orders | Total: ₹${grandTotal.toLocaleString('en-IN')}`);
    return;
  }

  if(tab==='cat-sales'){
    $('#rpt-sales-title').text('Category Wise Sales');
    const catMap={};
    ords.forEach(o=>{
      (o.items||[]).forEach(it=>{
        const cat=it.cat_id||'unknown';
        if(!catMap[cat]){catMap[cat]={cat,qty:0,total:0};}
        catMap[cat].qty+=it.qty||0;catMap[cat].total+=(it.price*it.qty)||0;
      });
    });
    const entries=Object.values(catMap).sort((a,b)=>b.total-a.total);
    $('#rpt-sales-head').html('<tr><th>Category</th><th>Units Sold</th><th>Revenue</th></tr>');
    let rows='';
    entries.forEach(e=>{rows+=`<tr><td>${CAT_LABELS[e.cat]||e.cat}</td><td>${e.qty}</td><td>₹${e.total.toLocaleString('en-IN')}</td></tr>`;});
    $('#rpt-sales-body').html(rows||'<tr><td colspan="3" style="text-align:center;color:var(--gray);">No data.</td></tr>');
    $('#rpt-sales-summary').text(`Total Revenue: ₹${grandTotal.toLocaleString('en-IN')}`);
    return;
  }

  if(tab==='top10-items'||tab==='bot10-items'){
    const title=tab==='top10-items'?'Top 10 Selling Items':'Bottom 10 Selling Items';
    $('#rpt-sales-title').text(title);
    const itemMap={};
    ords.forEach(o=>{
      (o.items||[]).forEach(it=>{
        if(!itemMap[it.id]){itemMap[it.id]={title:it.title,qty:0,total:0};}
        itemMap[it.id].qty+=it.qty||0;itemMap[it.id].total+=(it.price*it.qty)||0;
      });
    });
    let entries=Object.values(itemMap).sort((a,b)=>b.qty-a.qty);
    if(tab==='bot10-items')entries=entries.reverse();
    entries=entries.slice(0,10);
    $('#rpt-sales-head').html('<tr><th>Product</th><th>Units Sold</th><th>Revenue</th></tr>');
    let rows='';
    entries.forEach(e=>{rows+=`<tr><td>${escHtml(e.title)}</td><td>${e.qty}</td><td>₹${e.total.toLocaleString('en-IN')}</td></tr>`;});
    $('#rpt-sales-body').html(rows||'<tr><td colspan="3" style="text-align:center;color:var(--gray);">No data.</td></tr>');
    $('#rpt-sales-summary').text('');
    return;
  }
}

// ─── PAGINATION ────────────────────────────────────────────
function renderPag(selector,total,current,cb){
  const pages=Math.ceil(total/PAGE_SIZE);
  const el=$(selector);el.empty();
  if(pages<=1)return;
  for(let i=1;i<=pages;i++){
    const btn=$(`<button class="page-btn${i===current?' active':''}">${i}</button>`);
    btn.on('click',()=>cb(i));el.append(btn);
  }
}

// ─── UTILS ─────────────────────────────────────────────────
function escHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// datalist for categories
$('body').append('<datalist id="cat-list"><option value="body-kits"><option value="rims"><option value="hood"><option value="roof-scoops"><option value="paint-wraps"></datalist>');