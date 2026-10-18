import { useEffect, useMemo, useState } from 'react';
import { Search, Smartphone } from 'lucide-react';
import { PageHeading } from './Cards';

type Device = {
  id: string;
  name: string;
  brand: string;
  category: string;
  fullPrice: number;
  monthlyPayment24mo: number;
  storageGb: number;
  os: string;
  fit: string[];
  features: string[];
  tradeoffs: string[];
  isMockData: boolean;
};

const money = (amount: number) => `$${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

export function PhoneDatabase() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/devices').then(async response => {
      if (!response.ok) throw new Error('Phone database is unavailable.');
      return response.json() as Promise<{ devices: Device[] }>;
    }).then(data => { if (!cancelled) setDevices(data.devices); })
      .catch(() => { if (!cancelled) setError('Could not load phones. Try refreshing the page.'); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return devices.filter(device => !query || [device.name, device.brand, device.category, device.os, ...device.fit, ...device.features].join(' ').toLowerCase().includes(query));
  }, [devices, search]);

  return <>
    <PageHeading title="Phone Database" description={`${devices.length} phones · illustrative mock data from tmobile_sales_agent_mock_data.json`} />
    <section className="phone-database">
      <p className="phone-data-notice"><strong>Demo data:</strong> Models and prices are fictional examples from the mock dataset. They are not live T-Mobile inventory, current prices, or offers.</p>
      <div className="phone-database-toolbar">
        <label className="phone-search"><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search phones, brands, or features" aria-label="Search phones"/></label>
        <span>{visible.length} {visible.length === 1 ? 'phone' : 'phones'}</span>
      </div>
      {error && <p className="empty-copy" role="alert">{error}</p>}
      {!error && devices.length === 0 && <p className="empty-copy">Loading phone database…</p>}
      <div className="device-grid">{visible.map(device => <article className="device-card" key={device.id}>
        <div className="device-card-top"><span className="device-icon"><Smartphone size={21}/></span><span className="device-brand">{device.brand}</span><strong className="device-price">{money(device.fullPrice)}</strong></div>
        <h2>{device.name}</h2>
        <p className="device-category">{device.category}</p>
        <dl className="device-details">
          <div><dt>Mock price</dt><dd>{money(device.fullPrice)} retail · {money(device.monthlyPayment24mo)}/month × 24 months</dd></div>
          <div><dt>Configuration</dt><dd>{device.storageGb} GB · {device.os} · {device.category}</dd></div>
          <div><dt>Features</dt><dd className="device-tags">{device.features.map(item => <span key={item}>{item.replaceAll('_', ' ')}</span>)}</dd></div>
          <div><dt>Good for</dt><dd className="device-tags">{device.fit.map(item => <span key={item}>{item.replaceAll('_', ' ')}</span>)}</dd></div>
          <div><dt>Tradeoffs</dt><dd>{device.tradeoffs.join('; ')}</dd></div>
        </dl>
        <footer className="device-card-footer"><small>Mock figures only; not live inventory or pricing.</small></footer>
      </article>)}</div>
      {!error && devices.length > 0 && visible.length === 0 && <p className="empty-copy">No phones match “{search}”.</p>}
    </section>
  </>;
}
