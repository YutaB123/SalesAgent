import {getCountries,getCountryCallingCode,parsePhoneNumberFromString} from 'libphonenumber-js';
import type {CountryCode} from 'libphonenumber-js';
const names=new Intl.DisplayNames(['en'],{type:'region'});
const countries=getCountries().sort((a,b)=>(names.of(a)||a).localeCompare(names.of(b)||b));
const flag=(code:string)=>String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
export function CountryPhoneInput({country,onCountry,value,onChange,disabled}:{country:CountryCode;onCountry:(c:CountryCode)=>void;value:string;onChange:(v:string)=>void;disabled:boolean}){
 return <div className="country-phone"><label>Country<select aria-label="Country" value={country} disabled={disabled} onChange={e=>onCountry(e.target.value as CountryCode)}>{countries.map(c=><option value={c} key={c}>{flag(c)} {names.of(c)} +{getCountryCallingCode(c)}</option>)}</select></label><label>Phone number<div className="phone-number-input"><span>+{getCountryCallingCode(country)}</span><input type="tel" aria-label="Customer phone number" value={value} disabled={disabled} placeholder={country==='US'?'425 555 0123':'Phone number'} onChange={e=>{const raw=e.target.value;if(raw.trim().startsWith('+')){const parsed=parsePhoneNumberFromString(raw);if(parsed?.country){onCountry(parsed.country);onChange(parsed.nationalNumber);return;}}onChange(raw);}}/></div></label></div>;
}
