import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BadgeCheck, CreditCard, Repeat2, Ticket } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../lib/api';
import { ErrorBox, Loading } from '../components/Loading';

type Product = { id:string; name:string; description:string; price_agorot:number; credits?:number; validity_days?:number; billing_interval?:string; included_credits?:number; discount_percent?:number };

export function ProductsPage(){
  const q=useQuery({queryKey:['products'],queryFn:()=>api<{membershipPlans:Product[];passProducts:Product[]}>('/public/products')});
  const [selected,setSelected]=useState<{type:'PASS'|'MEMBERSHIP';product:Product}|null>(null);
  const buy=useMutation({mutationFn:(body:any)=>api<{session:{url:string}}>('/public/orders',{method:'POST',body:JSON.stringify(body)}),onSuccess:r=>location.href=r.session.url});
  if(q.isLoading)return <Loading/>;if(q.error||!q.data)return <ErrorBox error={q.error||new Error('לא ניתן לטעון מוצרים')}/>;
  return <div className="products-page section-pad"><div className="page-hero"><span className="eyebrow">PASSES & MEMBERSHIPS</span><h1>יותר ריקוד. פחות התעסקות.</h1><p>כרטיסיות ומנויים נרכשים אונליין ומפיקים קוד אישי לשימוש בהרשמה לסדנאות.</p></div>
    <section><div className="section-heading"><Ticket/><h2>כרטיסיות</h2></div><div className="workshop-grid">{q.data.passProducts.map(p=><ProductCard key={p.id} product={p} type="PASS" onBuy={()=>setSelected({type:'PASS',product:p})}/>)}</div></section>
    <section><div className="section-heading"><Repeat2/><h2>מנויים</h2></div><div className="workshop-grid">{q.data.membershipPlans.map(p=><ProductCard key={p.id} product={p} type="MEMBERSHIP" onBuy={()=>setSelected({type:'MEMBERSHIP',product:p})}/>)}</div></section>
    {selected&&<div className="modal-backdrop"><div className="modal compact-modal"><button className="modal-close" onClick={()=>setSelected(null)}>×</button><span className="eyebrow">SECURE CHECKOUT</span><h2>{selected.product.name}</h2><strong className="product-price">{money(selected.product.price_agorot)}</strong><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);buy.mutate({productType:selected.type,productId:selected.product.id,fullName:f.get('fullName'),email:f.get('email'),phone:f.get('phone')})}}><div className="form-grid"><label>שם מלא<input name="fullName" required/></label><label>דוא״ל<input name="email" type="email" required/></label><label className="field-sm">טלפון<input name="phone" required/></label></div>{buy.error&&<ErrorBox error={buy.error}/>}<button className="button primary full" disabled={buy.isPending}><CreditCard/> {buy.isPending?'פותח תשלום...':'המשך לתשלום'}</button></form></div></div>}
  </div>;
}

function ProductCard({product,type,onBuy}:{product:Product;type:'PASS'|'MEMBERSHIP';onBuy:()=>void}){
  return <article className="product-card"><div className="product-icon">{type==='PASS'?<Ticket/>:<Repeat2/>}</div><span className="eyebrow">{type}</span><h3>{product.name}</h3><p>{product.description}</p><ul>{type==='PASS'?<><li><BadgeCheck/> {product.credits} כניסות</li><li><BadgeCheck/> תוקף {product.validity_days} ימים</li></>:<><li><BadgeCheck/> {product.included_credits} קרדיטים בתקופה</li><li><BadgeCheck/> חיוב {interval(product.billing_interval)}</li>{Boolean(product.discount_percent)&&<li><BadgeCheck/> {product.discount_percent}% הנחה</li>}</>}</ul><strong>{money(product.price_agorot)}</strong><button className="button primary full" onClick={onBuy}>רכישה</button></article>;
}
const interval=(v?:string)=>v==='MONTHLY'?'חודשי':v==='QUARTERLY'?'רבעוני':'שנתי';

export function ProductResultPage(){
  const [params]=useSearchParams();const code=params.get('order')||'';
  const q=useQuery({queryKey:['order-result',code],queryFn:()=>api<{order:any}>(`/public/orders/${encodeURIComponent(code)}/status`),enabled:!!code,refetchInterval:(x)=>(x.state.data as any)?.order?.status==='PAID'?false:2000});
  if(q.isLoading)return <Loading label="בודקים את הרכישה..."/>;if(q.error||!q.data)return <ErrorBox error={q.error||new Error('הזמנה לא נמצאה')}/>;
  const o=q.data.order;const paid=o.status==='PAID';return <div className="center-page result-page">{paid?<BadgeCheck className="success-icon" size={64}/>:<CreditCard className="error-icon" size={60}/>}<span className="eyebrow">PRODUCT ORDER</span><h1>{paid?'הרכישה הושלמה':'ממתינים לאישור התשלום'}</h1>{paid&&<><p>הקוד האישי נשלח גם בדוא״ל. שמרו אותו לשימוש בהרשמה.</p><div className="confirmation-code">{o.metadata?.issuedCode||'מפיקים קוד...'}</div></>}<div className="hero-actions"><Link className="button primary" to="/my-registration">לאזור שלי</Link><Link className="button ghost" to="/products">חזרה למוצרים</Link></div></div>;
}
