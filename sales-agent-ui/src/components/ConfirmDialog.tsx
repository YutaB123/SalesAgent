import {useEffect,useRef} from 'react';
import type {ReactNode} from 'react';

export function ConfirmDialog({title,children,onConfirm,onCancel,confirmLabel='Confirm',busy=false}:{title:string;children?:ReactNode;onConfirm:()=>void;onCancel:()=>void;confirmLabel?:string;busy?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
 return <dialog ref={dialog} className="confirm-dialog" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onCancel();}} onClick={e=>{if(e.target===dialog.current&&!busy)onCancel();}}><h2>{title}</h2>{children}<div className="confirm-actions"><button autoFocus disabled={busy} onClick={onCancel}>Cancel</button><button className="confirm-primary" disabled={busy} onClick={onConfirm}>{busy?'Please wait…':confirmLabel}</button></div></dialog>;
}
