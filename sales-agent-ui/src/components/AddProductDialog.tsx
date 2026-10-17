import { useState, type FormEvent } from "react";
import { Check, PackagePlus, Sparkles, X } from "lucide-react";
import type { ProductInfo } from "../types/salesAgent";
import { AssistantMascot } from "./AssistantMascot";

export function AddProductDialog({open,onClose,onSave}:{open:boolean;onClose:()=>void;onSave:(product:ProductInfo)=>void}){
  const [name,setName]=useState("");
  const [category,setCategory]=useState("");
  const [price,setPrice]=useState("");
  const [description,setDescription]=useState("");
  const [facts,setFacts]=useState("");
  if(!open)return null;
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const parsedPrice=price.trim();
    onSave({id:`product-${Date.now()}`,name:name.trim(),category:category.trim(),price:parsedPrice,description:description.trim()||"No description added yet.",facts:facts.split("\n").map(item=>item.trim()).filter(Boolean)});
    setName("");setCategory("");setPrice("");setDescription("");setFacts("");
  };
  return <div className="product-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="product-dialog-card" role="dialog" aria-modal="true" aria-labelledby="add-product-title"><button className="product-dialog-close" aria-label="Close" onClick={onClose}><X size={17}/></button><div className="product-dialog-heading"><span className="product-dialog-icon"><PackagePlus size={19}/></span><div><span className="product-dialog-eyebrow"><Sparkles size={12}/> GROW YOUR CATALOG</span><h2 id="add-product-title">Add a product</h2><p>Give your reply buddy a little context to work with.</p></div><AssistantMascot/></div><form onSubmit={submit}><div className="product-form-grid"><label>Product name<input autoFocus required maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="e.g. ProBook X2"/></label><label>Category<input required maxLength={60} value={category} onChange={event=>setCategory(event.target.value)} placeholder="e.g. Laptop"/></label><label className="product-price-field">Current verified price <span>Optional</span><input value={price} onChange={event=>setPrice(event.target.value)} maxLength={40} placeholder="e.g. $999"/><small>Only enter a price you have confirmed.</small></label><label>Description <span>Optional</span><input maxLength={180} value={description} onChange={event=>setDescription(event.target.value)} placeholder="A short, customer-friendly description"/></label><label className="product-facts-field">Key details <span>Optional · one item per line</span><textarea rows={4} maxLength={600} value={facts} onChange={event=>setFacts(event.target.value)} placeholder={"Example: 14-inch display\nLightweight design"}/></label></div><div className="product-dialog-footer"><span><AssistantMascot/>Your saved products stay on this device.</span><div><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Check size={15}/>Save Product</button></div></div></form></section></div>;
}
